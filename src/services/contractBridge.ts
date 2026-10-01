
import {
  Contract,
  Transaction,
  TransactionBuilder,
  xdr,
  BASE_FEE,
} from 'stellar-sdk';
import { Horizon } from 'stellar-sdk';
import { Server, Api } from 'stellar-sdk/rpc';
import { Network, NETWORK_PASSPHRASES, SOROBAN_RPC_URLS, RPC_ENDPOINTS } from '../config';
import {
  getContractAddress,
  isPlaceholderContractAddress,
  PlaceholderContractAddressError,
} from '../../config/contracts';
import { buildMintWrapArgs, type MintWrapArgsInput } from '../utils/contractArgsBuilder';
import { mapContractError } from '../../app/utils/contractErrors';
import { signWithFreighter } from '../../app/services/transactionSigner';
import { sorobanQueue } from '../utils/sorobanRequestQueue';
import { stroopsToXlm } from '../utils/stellarAmount';

export type TransactionState =
  | 'pending'
  | 'simulating'
  | 'signed'
  | 'submitted'
  | 'confirmed'
  | 'failed';

export type TransactionObserver = (state: TransactionState, data?: unknown) => void;

export interface MintWrapOptions {
  accountAddress: string;
  period: string;
  archetype: string;
  dataHash: Uint8Array;
  signature: Uint8Array;
  network: Network;
  observer?: TransactionObserver;
}

export interface MintResult {
  transactionHash: string;
  ledger: number;
  state: TransactionState;
}

export interface TransactionError {
  message: string;
  code?: string;
  state: TransactionState;
  originalError?: unknown;
}

/**
 * Resource costs from simulation
 */
export interface SimulationCost {
  /** CPU instructions */
  cpuInsns: number;
  /** Memory bytes */
  memBytes: number;
}

/**
 * Contract footprint from simulation
 */
export interface SimulationFootprint {
  /** Read-only contract keys */
  readOnly: string[];
  /** Read-write contract keys */
  readWrite: string[];
}

/**
 * Detailed simulation result
 */
export interface SimulationResult {
  /** Whether simulation succeeded */
  success: boolean;
  /** Error message if simulation failed */
  error?: string;
  /** Resource costs */
  cost?: SimulationCost;
  /** Contract footprint */
  footprint?: SimulationFootprint;
  /** Return value from contract (if successful) */
  result?: unknown;
  /** Estimated transaction fee in XLM */
  estimatedFee?: number;
  /** Account balance in XLM */
  accountBalance?: number;
  /** Whether restore preamble is required */
  requiresRestore?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of confirmation polling attempts */
const MAX_CONFIRMATION_ATTEMPTS = 60;
const CONFIRMATION_POLL_INTERVAL = 2000;

/** Transaction timeout (ms) */
const TRANSACTION_TIMEOUT = 120000; // 2 minutes

/** Simulation cache duration (ms) */
const SIMULATION_CACHE_DURATION = 30000; // 30 seconds

/** Simulation cache */
const simulationCache = new Map<string, { result: SimulationResult; timestamp: number }>();

const RPC_REQUEST_TIMEOUT = 30000;
const TRANSACTION_SUBMIT_TIMEOUT = 60000;

// ─── Helper Functions ───────────────────────────────────────────────────────

/** Reused Soroban RPC server per network (avoids re-creating clients per tx) */
const sorobanServerRegistry: Partial<Record<Network, Server>> = {};

/**
 * Creates and caches a Soroban RPC server instance for the given network.
 */
function getSorobanServer(network: Network): Server {
  const cached = sorobanServerRegistry[network];
  if (cached) {
    return cached;
  }
  const rpcUrl = SOROBAN_RPC_URLS[network];
  const server = new Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
  sorobanServerRegistry[network] = server;
  return server;
}

function getNetworkPassphrase(network: Network): string {
  return NETWORK_PASSPHRASES[network];
}

function withTimeout<T>(promise: Promise<T>, ms: number, context: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${context} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function formatStellarAmount(amount: number): string {
  return amount.toFixed(7);
}

function emitState(
  observer: TransactionObserver | undefined,
  state: TransactionState,
  data?: unknown,
): void {
  if (observer) {
    try {
      observer(state, data);
    } catch (error) {
      log.error('Transaction observer error:', error);
    }
  }
}

async function waitForConfirmation(
  server: Server,
  transactionHash: string,
  observer: TransactionObserver | undefined,
  startTime: number,
): Promise<{ ledger: number }> {
  let attempts = 0;

  while (attempts < MAX_CONFIRMATION_ATTEMPTS) {
    const elapsedMs = Date.now() - startTime;

    if (elapsedMs > TRANSACTION_TIMEOUT) {
      // Emit a structured timeout payload so the UI can show actionable copy
      // without resubmitting automatically.
      emitState(observer, 'failed', {
        code: 'CONFIRMATION_TIMEOUT',
        transactionHash,
        elapsedMs,
        attempts,
      });
      throw new Error('Transaction confirmation timeout');
    }

    // Emit per-tick confirming progress (1-based attempt for display)
    emitState(observer, 'submitted', {
      confirming: true,
      attempt: attempts + 1,
      maxAttempts: MAX_CONFIRMATION_ATTEMPTS,
      elapsedMs,
      transactionHash,
    });

    try {
      const response = await sorobanQueue.enqueue(() =>
        server.getTransaction(transactionHash),
      );

      if (response.status === Api.GetTransactionStatus.SUCCESS) {
        const ledger = response.ledger ?? 0;
        emitState(observer, 'confirmed', { ledger, transactionHash });
        return { ledger };
      }

      if (response.status === Api.GetTransactionStatus.FAILED) {
        const errorMessage = 'Transaction failed on network';
        emitState(observer, 'failed', { error: errorMessage });
        throw new Error(errorMessage);
      }
      // NOT_FOUND or other — continue polling
    } catch (error) {
      if (error instanceof Error && error.message.includes('Transaction failed')) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('confirmation timeout')) {
        throw error;
      }
      log.warn(`Polling attempt ${attempts + 1} failed:`, error);
    }

    attempts++;
    await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_POLL_INTERVAL));
  }

  // Max attempts exhausted — treat the same as a timeout
  emitState(observer, 'failed', {
    code: 'CONFIRMATION_TIMEOUT',
    transactionHash,
    elapsedMs: Date.now() - startTime,
    attempts,
  });
  throw new Error(
    `Transaction not confirmed after ${MAX_CONFIRMATION_ATTEMPTS} attempts`,
  );
}

/**
 * Map SDK / host errors to concise user-facing copy.
 * Raw details stay available via `mapContractError(...).raw` for logs.
 */
function parseContractError(error: unknown): string {
  const mapped = mapContractError(error);
  // Always keep raw details in diagnostics/logs
  if (mapped.code !== 'Unknown') {
    log.warn('contract error', {
      code: mapped.code,
      numericCode: mapped.numericCode,
      raw: mapped.raw,
    });
    return mapped.userMessage;
  }

  if (error instanceof Error) {
    const message = error.message;
    if (message.includes('insufficient_fee') || message.includes('fee')) {
      return 'Insufficient transaction fee. Please try again.';
    }
    if (message.includes('User declined') || message.includes('rejected')) {
      return 'Transaction was rejected by user';
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'Network error. Please check your connection and try again.';
    }
    if (message.includes('HostError') || message.includes('ContractError') || message.includes('Error(Contract')) {
      log.warn('unmapped host error', mapped.raw);
      return mapped.userMessage;
    }
    return message;
  }
  if (typeof error === 'string') return error;
  return 'Unknown error occurred during transaction';
}


async function buildMintTransaction(
  accountAddress: string,
  mintArgsInput: Omit<MintWrapArgsInput, 'accountAddress'>,
  network: Network,
): Promise<{ transaction: Transaction; contract: Contract }> {
  let contractAddress: string;
  try {
    contractAddress = getContractAddress(network);
  } catch (err) {
    if (err instanceof PlaceholderContractAddressError) {
      throw new Error(`${err.userMessage} ${err.developerHint}`);
    }
    throw err;
  }
  if (!contractAddress || isPlaceholderContractAddress(contractAddress)) {
    const placeholderErr = new PlaceholderContractAddressError(network);
    throw new Error(`${placeholderErr.userMessage} ${placeholderErr.developerHint}`);
  }

  const sorobanServer = getSorobanServer(network);

  let account;
  try {
    account = await sorobanQueue.coalesce(
      `account:${network}:${accountAddress}`,
      () => sorobanServer.getAccount(accountAddress),
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Not Found') || errorMessage.includes('404')) {
      throw new Error(
        `Account ${accountAddress} not found on ${network}. ` +
        `Please ensure the account exists and is funded on the ${network} network.`,
      );
    }
    throw new Error(
      `Failed to load account: ${errorMessage}. ` +
      `Please check that the account address is correct and exists on ${network}.`,
    );
  }

  const argsResult = buildMintWrapArgs({ accountAddress, ...mintArgsInput });
  if (!argsResult.success) {
    throw new Error(
      `Failed to build contract arguments: ${argsResult.errors.join(', ')}`,
    );
  }

  const contract = new Contract(contractAddress);
  const operation = contract.call('mint_wrap', ...argsResult.data.args);

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(network),
  })
    .addOperation(operation)
    .setTimeout(300)
    .build();

  return { transaction, contract };
}

/**
 * Calculates estimated transaction fee from simulation
 */
function calculateEstimatedFee(simulation: { cost?: SimulationCost }, baseFee = 100): number {
  // Base fee is in stroops (1 XLM = 10,000,000 stroops)
  // Default base fee is 100 stroops (0.00001 XLM)
  let estimatedFee = baseFee;

  // Add resource costs if available
  if (simulation.cost) {
    // CPU instructions cost (rough estimate: 1 instruction = 0.00001 stroops)
    if (simulation.cost.cpuInsns) {
      estimatedFee += Math.ceil(simulation.cost.cpuInsns * 0.00001);
    }
    // Memory cost (rough estimate: 1 byte = 0.000001 stroops)
    if (simulation.cost.memBytes) {
      estimatedFee += Math.ceil(simulation.cost.memBytes * 0.000001);
    }
  }

  // Convert stroops to XLM
  return stroopsToXlm(estimatedFee);
}

/**
 * Checks if account has sufficient balance for transaction
 */
async function validateAccountBalance(
  accountAddress: string,
  network: Network,
  requiredFee: number,
): Promise<{ sufficient: boolean; balance: number; required: number }> {
  try {
    // Use Horizon API to get account balance
    const horizonUrl = RPC_ENDPOINTS[network];
    const horizonServer = new Horizon.Server(horizonUrl);
    const account = await horizonServer.loadAccount(accountAddress);
    
    // Get native XLM balance (first balance entry)
    const xlmBalance = account.balances.find((b) => b.asset_type === 'native');
    const balance = xlmBalance ? parseFloat(xlmBalance.balance) : 0;
    
    return {
      sufficient: balance >= requiredFee,
      balance,
      required: requiredFee,
    };
  } catch {
    // If we can't get account, assume insufficient (will fail later anyway)
    return {
      sufficient: false,
      balance: 0,
      required: requiredFee,
    };
  }
}

/**
 * Generates a cache key for simulation results
 */
function getSimulationCacheKey(transaction: Transaction, accountAddress: string): string {
  // Use transaction hash as a stable cache key
  try {
    const hash = transaction.hash().toString('hex');
    return `${accountAddress}:${hash}`;
  } catch {
    // Fallback to a pseudo-unique key if hashing fails
    return `${accountAddress}:${Date.now()}`;
  }
}

export async function executeMintWrap(options: MintWrapOptions): Promise<MintResult> {
  return mintWrap(options);
}

/**
 * Clears expired simulation cache entries
 */
function clearExpiredSimulationCache(): void {
  const now = Date.now();
  for (const [key, value] of simulationCache.entries()) {
    if (now - value.timestamp > SIMULATION_CACHE_DURATION) {
      simulationCache.delete(key);
    }
  }
}

/**
 * Simulates a transaction before signing and returns detailed results
 * 
 * This function:
 * - Checks cache for recent simulation results
 * - Simulates the transaction using Soroban RPC
 * - Validates account balance
 * - Returns detailed simulation results including costs and fees
 */
async function simulateTransaction(
  server: Server,
  transaction: Transaction,
  accountAddress: string,
  network: Network,
  observer: TransactionObserver | undefined,
): Promise<SimulationResult> {
  emitState(observer, 'simulating');

  // Clear expired cache entries
  clearExpiredSimulationCache();

  // Check cache
  const cacheKey = getSimulationCacheKey(transaction, accountAddress);
  const cached = simulationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SIMULATION_CACHE_DURATION) {
    emitState(observer, 'simulating', { simulation: cached.result, cached: true });
    return cached.result;
  }

  try {
    const simulation = await sorobanQueue.coalesce(
      `simulate:${network}:${cacheKey}`,
      () => server.simulateTransaction(transaction),
    );

    // Check if simulation failed
    const simulationAny = simulation as unknown as Record<string, unknown>;
    if ('error' in simulation || simulationAny.errorResult) {
      const errorResult = (simulationAny.errorResult || simulationAny.error) as unknown;
      const errorMessage = parseContractError(errorResult || simulation);
      
      const result: SimulationResult = {
        success: false,
        error: errorMessage,
      };
      
      emitState(observer, 'failed', { error: errorMessage, simulation: result });
      return result;
    }

    // Parse successful simulation
    const costData = simulationAny.cost as { cpuInsns?: number; memBytes?: number } | undefined;
    const cost: SimulationCost | undefined = costData
      ? {
          cpuInsns: costData.cpuInsns || 0,
          memBytes: costData.memBytes || 0,
        }
      : undefined;

    const footprintData = simulationAny.footprint as { readOnly?: string[]; readWrite?: string[] } | undefined;
    const footprint: SimulationFootprint | undefined = footprintData
      ? {
          readOnly: footprintData.readOnly || [],
          readWrite: footprintData.readWrite || [],
        }
      : undefined;

    const minResourceFee = Number(simulationAny.minResourceFee ?? 0);
    if (Number.isFinite(minResourceFee) && minResourceFee > 0) {
      transaction.fee = String(minResourceFee);
    }

    const txData = simulationAny.transactionData as { sorobanData?: unknown } | undefined;
    if (typeof txData?.sorobanData === 'string') {
      transaction.sorobanData = xdr.SorobanTransactionData.fromXDR(
        txData.sorobanData,
        'base64',
      );
    }

    const estimatedFee =
      Number.isFinite(minResourceFee) && minResourceFee > 0
        ? minResourceFee / 10000000
        : calculateEstimatedFee(simulationAny as { cost?: SimulationCost });

    const result: SimulationResult = {
      success: true,
      cost,
      footprint,
      result: simulationAny.result,
      estimatedFee,
      requiresRestore: !!(simulationAny.restorePreamble),
    };

    // Validate account balance
    if (result.estimatedFee) {
      const balanceCheck = await validateAccountBalance(
        accountAddress,
        network,
        result.estimatedFee,
      );

      if (!balanceCheck.sufficient) {
        const errorMessage = `Insufficient balance. Required: ${formatStellarAmount(balanceCheck.required)} XLM, Available: ${formatStellarAmount(balanceCheck.balance)} XLM`;
        result.success = false;
        result.error = errorMessage;
        emitState(observer, 'failed', { error: errorMessage, simulation: result });
        return result;
      }

      // Add balance info to result
      result.accountBalance = balanceCheck.balance;
    }

    // Cache successful simulation result
    simulationCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    // Emit simulation success with details
    emitState(observer, 'simulating', { simulation: result });

    return result;
  } catch (error) {
    const errorMessage = parseContractError(error);
    const result: SimulationResult = {
      success: false,
      error: errorMessage,
    };
    
    emitState(observer, 'failed', { error: errorMessage, simulation: result });
    return result;
  }
}


async function signTransactionWithFreighter(
  transactionXdr: string,
  network: Network,
  observer: TransactionObserver | undefined,
): Promise<string> {
  emitState(observer, 'signed');

  const result = await signWithFreighter({ transactionXdr, network });

  if (!result.ok) {
    const message = result.message || `Signing failed: ${result.code}`;
    emitState(observer, 'failed', { error: message, code: result.code });
    throw new Error(`Signing failed: ${message}`);
  }

  return result.signedXdr;
}


async function submitTransaction(
  server: Server,
  signedXdr: string,
  observer: TransactionObserver | undefined,
): Promise<string> {
  emitState(observer, 'submitted');

  try {
    const envelopeXdr = xdr.TransactionEnvelope.fromXDR(signedXdr, 'base64');
    const signedTransaction = TransactionBuilder.fromXDR(
      envelopeXdr.toXDR('base64'),
      // network passphrase is embedded in the XDR; TransactionBuilder.fromXDR
      // accepts a base64 envelope directly
      '*', // wildcard passphrase — we are only re-submitting, not re-signing
    ) as Transaction;

    const response = await sorobanQueue.enqueue(
      () => server.sendTransaction(signedTransaction),
      { retry: false },
    );

    if (response.errorResult) {
      const errorMessage = parseContractError(response.errorResult);
      emitState(observer, 'failed', { error: errorMessage });
      throw new Error(`Transaction submission failed: ${errorMessage}`);
    }

    // hash is always present on BaseSendTransactionResponse
    return response.hash;
  } catch (error) {
    const errorMessage = parseContractError(error);
    emitState(observer, 'failed', { error: errorMessage });
    throw error;
  }
}

export async function mintWrap(options: MintWrapOptions): Promise<MintResult> {
  const { accountAddress, period, archetype, dataHash, signature, network, observer } = options;

  emitState(observer, 'pending');

  const startTime = Date.now();

  try {
    const { transaction } = await buildMintTransaction(
    accountAddress,
    { period, archetype, dataHash, signature },
    network,
  );

    const server = getSorobanServer(network);

    // 3. Simulate transaction
    const simulationResult = await simulateTransaction(
      server,
      transaction,
      accountAddress,
      network,
      observer,
    );

    // Only proceed if simulation succeeded
    if (!simulationResult.success) {
      throw new Error(
        simulationResult.error || 'Transaction simulation failed',
      );
    }

    const transactionXdr = transaction.toXDR();

    const signedXdr = await signTransactionWithFreighter(transactionXdr, network, observer);

    const transactionHash = await submitTransaction(server, signedXdr, observer);

    const { ledger } = await waitForConfirmation(server, transactionHash, observer, startTime);

    return { transactionHash, ledger, state: 'confirmed' };
  } catch (error) {
    const errorMessage = parseContractError(error);
    emitState(observer, 'failed', { error: errorMessage });
    throw new Error(`Minting failed: ${errorMessage}`);
  }
}

/**
 * Clears the simulation cache (useful for testing or when account balance changes)
 */
export function clearSimulationCache(): void {
  simulationCache.clear();
}
