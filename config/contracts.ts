/*
 * Network-aware Soroban contract configuration
 * Supports per-network addresses with environment variable overrides.
 */

import {
  Account,
  BASE_FEE,
  Operation,
  Server,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { getPublicKey, isConnected, signTransaction } from "@stellar/freighter-api";

import { Network, isValidNetwork } from "../src/config";
import {
  PLACEHOLDER_CONTRACT_ADDRESS,
  isPlaceholderContractAddress,
  isValidContractAddress,
  resolveContractAddress,
} from "./contractAddress";

/** Contract config for a single network */
export interface ContractNetworkConfig {
  contractAddress: string;
  /** Soroban RPC endpoint for this network */
  rpcUrl: string;
  /** Stellar network passphrase for this network */
  networkPassphrase: string;
}

/** Full contract configuration per network */
export type ContractConfig = Record<Network, ContractNetworkConfig>;

export {
  PLACEHOLDER_CONTRACT_ADDRESS,
  isPlaceholderContractAddress,
  isValidContractAddress,
  resolveContractAddress,
} from "./contractAddress";

/** @deprecated Use PLACEHOLDER_CONTRACT_ADDRESS */
const PLACEHOLDER_ADDRESS = PLACEHOLDER_CONTRACT_ADDRESS;

/**
 * Env var name developers must set for a given network.
 */
export function getContractAddressEnvHint(network: Network): string {
  return `NEXT_PUBLIC_CONTRACT_ADDRESS_${network.toUpperCase()}`;
}

/**
 * User-safe + developer-facing error for missing/placeholder contract config.
 */
export class PlaceholderContractAddressError extends Error {
  readonly userMessage: string;
  readonly developerHint: string;
  readonly network: Network;

  constructor(network: Network) {
    const envVar = getContractAddressEnvHint(network);
    const userMessage =
      "This network is not ready for minting yet. Contract configuration is missing.";
    const developerHint = `Set ${envVar} (or NEXT_PUBLIC_CONTRACT_ADDRESS) to a real Soroban contract ID before invoking mint. Placeholder CAAAAA... addresses are rejected.`;
    super(`${userMessage} ${developerHint}`);
    this.name = "PlaceholderContractAddressError";
    this.userMessage = userMessage;
    this.developerHint = developerHint;
    this.network = network;
  }
}

/** Default contract addresses and Soroban RPC endpoints (fallback when env vars are not set) */
const DEFAULT_CONTRACT_CONFIG: ContractConfig = {
  mainnet: {
    contractAddress: PLACEHOLDER_ADDRESS,
    rpcUrl: "https://soroban-mainnet.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  },
  testnet: {
    contractAddress: PLACEHOLDER_ADDRESS,
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  },
};

/** Build config with env overrides (env takes precedence). Legacy env vars used for both networks if set. */
function getContractConfig(): ContractConfig {
  const legacyRpc = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
  const legacyPassphrase = process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE;
  return {
    mainnet: {
      contractAddress: resolveContractAddress("mainnet"),
      rpcUrl:
        process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET ||
        legacyRpc ||
        DEFAULT_CONTRACT_CONFIG.mainnet.rpcUrl,
      networkPassphrase:
        process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE_MAINNET ||
        legacyPassphrase ||
        DEFAULT_CONTRACT_CONFIG.mainnet.networkPassphrase,
    },
    testnet: {
      contractAddress: resolveContractAddress("testnet"),
      rpcUrl:
        process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET ||
        legacyRpc ||
        DEFAULT_CONTRACT_CONFIG.testnet.rpcUrl,
      networkPassphrase:
        process.env.NEXT_PUBLIC_SOROBAN_NETWORK_PASSHRASE_TESTNET ||
        legacyPassphrase ||
        DEFAULT_CONTRACT_CONFIG.testnet.networkPassphrase,
    },
  };
}

/**
 * Get the contract address for the given network.
 * Loads from environment (NEXT_PUBLIC_CONTRACT_ADDRESS_MAINNET / _TESTNET) then config.
 *
 * @param network - 'mainnet' | 'testnet'
 * @returns Contract address for the network
 * @throws Error if network is invalid or contract address format is invalid
 */
export function getContractAddress(network: Network): string {
  if (!isValidNetwork(network)) {
    throw new Error(`Invalid network: ${network}`);
  }
  const config = getContractConfig();
  const address = config[network].contractAddress;
  if (!isValidContractAddress(address)) {
    throw new Error(
      `Invalid contract address for ${network}., address must be passphrase required. Got: ${address.slice(0, 20)}...`
    );
  }
  if (isPlaceholderContractAddress(address)) {
    throw new PlaceholderContractAddressError(network);
  }
  return address;
}

/**
 * Get full contract config (for debugging or tooling).
 */
export function getContractConfigForAllNetworks(): ContractConfig {
  return getContractConfig();
}

/**
 * Get the Soroban RPC URL for the given network.
 * Loads from environment (NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET / _TESTNET) then config.
 *
 * @param network - 'mainnet' | 'testnet'
 * @returns RPC URL for the network
 * @throws Error if network is invalid
 */
export function getRpcUrl(network: Network): string {
  if (!isValidNetwork(network)) {
    throw new Error(`Invalid network: ${network}`);
  }
  return getContractConfig()[network].rpcUrl;
}

/**
 * Get the Stellar network passphrase for the given network.
 * Loads from environment (NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE_MAINNET / _TESTNET) then config.
 *
 * @param network - 'mainnet' | 'testnet'
 * @returns Network passphrase
 * @throws Error if network is invalid
 */
export function getNetworkPassphrase(network: Network): string {
  if (!isValidNetwork(network)) {
    throw new Error(`Invalid network: ${network}`);
  }
  return getContractConfig()[network].networkPassphrase;
}

/**
 * Get the full contract network configuration for a given network.
 * Combines contract address, RPC URL, and passphrase into one object.
 */
export function getContractNetworkConfig(network: Network): ContractNetworkConfig {
  if (!isValidNetwork(network)) {
    throw new Error(`Invalid network: ${network}`);
  }
  const config = getContractConfig();
  const { contractAddress, rpcUrl, networkPassphrase } = config[network];
  if (!isValidContractAddress(contractAddress)) {
    throw new Error(`Invalid contract address for ${network}: ${contractAddress}`);
  }
  return { contractAddress, rpcUrl, networkPassphrase };
}

/*
 * --------------------------------------------------------------------------------------------------------
 * Soroban contract interaction helpers for Multi-sig Setup
 * --------------------------------------------------------------------------------------------------------
 */

/**
 * Parse a Stellar amount (e.g., "12.3456789") to stroops (bigint).
 */
export function parseStellarAmount(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new Error(`Invalid Stellar amount format: ${amount}`);
  }
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * 10000000n + BigInt(fraction.padEnd(7, "0"));
}

/**
 * Format stroops to a Stellar amount string with up to 7 decimals.
 */
export function formatStellarAmount(stroops: bigint): string {
  const whole = stroops / 10000000n;
  const fraction = stroops % 10000000n;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(7, "0").replace(/0+$/, "")}`;
}

/**
 * Wraps a promise with a timeout, rejecting after `ms` milliseconds.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

/**
 * Checks that Freighter is installed, connected, and returns the public key.
 */
export async function getFreighterPublicKey(): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Freighter can only be used in a browser environment.");
  }
  const connected = await isConnected();
  if (!connected) {
    throw new Error("Freighter wallet is not connected.");
  }
  return getPublicKey();
}

/**
 * Create a Soroban RPC Server instance for the given network.
 */
export function getSorobanServer(network: Network): Server {
  const rpcUrl = getRpcUrl(network);
  return new Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
}

export interface SorobanInvocation {
  /** Contract method to call */
  method: string;
  /** SCVal arguments */
  args: xdr.ScVal[];
  /** Source account public key */
  source: string;
}

/**
 * Simulate a Soroban contract invocation and return the result SCVal.
 */
export async function simulateSorobanCall(
  invocation: SorobanInvocation,
  network: Network
): Promise<xdr.ScVal> {
  const server = getSorobanServer(network);
  const contractAddress = getContractAddress(network);
  const networkPassphrase = getNetworkPassphrase(network);

  const source = new Account(invocation.source, "0");
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractAddress,
        function: invocation.method,
        args: invocation.args,
      })
    )
    .setTimeout(30)
    .build();

  const simulation = await withTimeout(server.simulateTransaction(tx), 30000);

  if (!simulation) {
    throw new Error("Soroban simulation failed: no result returned.");
  }
  if (simulation.error) {
    throw new Error(`Soroban simulation error: ${simulation.error}`);
  }
  if (!simulation.result) {
    throw new Error("Soroban simulation returned no result.");
  }
  return simulation.result.retval;
}

/**
 * Simulate, sign (via Freighter), and submit a Soroban contract invocation.
 * Returns the transaction hash.
 */
export async function sendSorobanCall(
  invocation: SorobanInvocation,
  network: Network
): Promise<string> {
  const server = getSorobanServer(network);
  const contractAddress = getContractAddress(network);
  const networkPassphrase = getNetworkPassphrase(network);

  const publicKey = await getFreighterPublicKey();
  const account = await server.getAccount(publicKey);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractAddress,
        function: invocation.method,
        args: invocation.args,
      })
    )
    .setTimeout(30)
    .build();

  try {
    const signedXdr = await signTransaction(tx.toXDR(), networkPassphrase, {
      accountToSign: publicKey,
    });
    const response = await withTimeout(server.sendTransaction(signedXdr), 30000);
    if (!response.hash) {
      throw new Error("Transaction submission did not return a hash.");
    }
    return response.hash;
  } catch (error) {
    if (error instanceof Error && error.message.includes("User rejected")) {
      throw new Error("Transaction signature rejected by user.");
    }
    throw error;
  }
}
