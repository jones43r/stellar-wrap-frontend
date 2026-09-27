/**
 * Server-safe Horizon indexing core (no IndexedDB / browser globals).
 */

import { getHorizonServer } from "@/app/utils/stellarClient";
// Inline types for transaction and operation records
type OperationRecord = {
  type: string;
  amount?: string;
  asset_code?: string;
  memo?: string;
  [key: string]: unknown;
};
type TransactionRecord = {
  created_at: string;
  memo?: string;
  operations: OperationRecord[];
  paging_token?: string;
  [key: string]: unknown;
};
type HorizonTransactionResponse = {
  records: TransactionRecord[];
  _links: {
    self: { href: string };
    next?: { href: string };
    prev?: { href: string };
  };
};
import {
  IndexerResult,
  PERIODS,
  WrapPeriod,
} from "@/app/utils/indexer";
import { calculateAchievements } from "./achievementCalculator";
import { ConcurrencyManager, throwIfAborted } from "./concurrencyManager";
import { IndexerEventEmitter } from "@/app/utils/indexerEventEmitter";
import { INDEXING_STEPS, IndexingStep } from "@/app/types/indexing";
import {
  getIndexingAbortSignal,
  isAbortError,
} from "@/app/utils/indexingAbort";
import { indexerError } from "@/app/utils/indexerDebug";

/**
 * Structured error that preserves the HTTP status code and type from Horizon.
 * Thrown instead of plain Error so callers (e.g. /api/wrapped) can branch
 * on `statusCode` without parsing message strings.
 */
export class HorizonError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorType:
      | "not_found"
      | "rate_limited"
      | "server_error"
      | "timeout"
      | "unknown",
  ) {
    super(message);
    this.name = "HorizonError";
  }
}

const concurrencyManager = new ConcurrencyManager();

/**
 * Runs `workFn` immediately (so we capture the result), then animates step
 * progress smoothly over `estimatedDuration` ms before marking it complete.
 * When background is true, skips all UI emissions.
 */
async function animateStep<T>(
  step: IndexingStep,
  emitter: IndexerEventEmitter,
  workFn: () => T | Promise<T>,
  background: boolean,
): Promise<T> {
  const result = await workFn();
  if (background) return result;

  const duration = INDEXING_STEPS[step].estimatedDuration;
  const startTime = Date.now();
  await new Promise<void>((resolve) => {
    const tickMs = 80;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(95, Math.round((elapsed / duration) * 95));
      emitter.emitStepProgress(step, progress);
      if (elapsed >= duration) {
        clearInterval(interval);
        resolve();
      }
    }, tickMs);
  });
  emitter.emitStepComplete(step);
  return result;
}

/**
 * Internal: run full Horizon indexing. When background is true, no step events are emitted.
 * Returns both the computed result and the raw transactions within the period,
 * so callers can derive narrower timeframes from the wider fetch.
 */
export async function runIndexingCore(
  accountId: string,
  network: "mainnet" | "testnet",
  period: WrapPeriod,
  background: boolean,
): Promise<{ result: IndexerResult; transactions: unknown[] }> {
  const emitter = IndexerEventEmitter.getInstance();
  const server = getHorizonServer(network);
  const days = PERIODS[period];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Captured once: abortIndexingRequests() clears the shared controller, so
  // re-reading it mid-run would miss the cancellation.
  const runSignal = getIndexingAbortSignal();
  let currentEmittedStep: IndexingStep = "initializing";

  const emit = (fn: () => void) => {
    if (!background) fn();
  };

  try {
    currentEmittedStep = "initializing";
    emit(() => emitter.emitStepChange("initializing"));
    await animateStep("initializing", emitter, () => {
      getHorizonServer(network);
    }, background);
    emit(() => emitter.emitStepComplete("initializing"));

    currentEmittedStep = "fetching-transactions";
    emit(() => emitter.emitStepChange("fetching-transactions"));

    const allTransactions: unknown[] = [];
    const seenTokens = new Set<string>();
    const fetchDuration =
      INDEXING_STEPS["fetching-transactions"].estimatedDuration;
    const fetchStart = Date.now();

    let cursor: string | undefined;
    let hasMore = true;
    let pageCount = 0;
    let totalEstimatedTotal: number | null = null;

    while (hasMore) {
      throwIfAborted(runSignal);

      let response: unknown;
      try {
        response = await concurrencyManager.run(async () => {
          // Benchmark: limit=200 is Horizon's maximum page size.
          // Compared to the default of 10 this cuts API round-trips by ~20x
          // (e.g. 2 000 transactions → 200 calls → 10 calls), which sharply
          // reduces total latency and the chance of triggering Horizon's
          // rate-limiter. ConcurrencyManager (MAX_CONCURRENT_REQUESTS=5)
          // still bounds the number of in-flight requests at this page size.
          const builder = server
            .transactions()
            .forAccount(accountId)
            .limit(200);
          if (cursor) {
            builder.cursor(cursor);
          }
          return builder.call();
        }, runSignal);
      } catch (error: unknown) {
        if (isAbortError(error)) {
          throw new DOMException("Indexing cancelled", "AbortError");
        }
        const errorObj = error as {
          response?: { status?: number };
          code?: string;
          name?: string;
          message?: string;
        };
        if (errorObj?.response?.status === 404) {
          throw new HorizonError(
            "Account not found (404). Please check the address.",
            404,
            "not_found",
          );
        } else if (errorObj?.response?.status === 429) {
          throw new HorizonError(
            "Rate limit exceeded (429). Please try again later.",
            429,
            "rate_limited",
          );
        } else if (errorObj?.response?.status === 500) {
          throw new HorizonError(
            "Server error (500). Please try again later.",
            500,
            "server_error",
          );
        } else if (
          errorObj?.code === "ECONNABORTED" ||
          errorObj?.name === "TimeoutError"
        ) {
          throw new HorizonError(
            "Network timeout. Please check your connection.",
            408,
            "timeout",
          );
        } else {
          throw new HorizonError(
            "Unknown error fetching transactions: " +
              (errorObj?.message || String(error)),
            500,
            "unknown",
          );
        }
      }

      const horizonResponse = response as HorizonTransactionResponse;
      const respRecords = horizonResponse.records;
      if (!respRecords || respRecords.length === 0) {
        hasMore = false;
        break;
      }

      pageCount++;
      // Estimate total transactions based on pages
      if (pageCount === 1 && horizonResponse._links.next) {
        totalEstimatedTotal = respRecords.length * 5;
      }

      const timeProgress = Math.round(
        ((Date.now() - fetchStart) / fetchDuration) * 95,
      );
      emit(() =>
        emitter.emitStepProgress(
          "fetching-transactions",
          Math.min(95, Math.max(pageCount * 15, timeProgress)),
        ),
      );

      // Fetch operations for each transaction and attach as array
      const recordsWithOps = await Promise.all(
        respRecords.map(async (tx: TransactionRecord) => {
          const txRecord = tx as {
            operations: () => Promise<{ records: OperationRecord[] }>;
          } & TransactionRecord;
          const opsPage = await txRecord.operations();
          return {
            ...txRecord,
            operations: opsPage.records as OperationRecord[],
          };
        }),
      );
      throwIfAborted(runSignal);
      const recordsInRange = recordsWithOps.filter((tx: TransactionRecord) => {
        return new Date(tx.created_at) >= cutoffDate;
      });
      for (const tx of recordsInRange) {
        const key = String(tx.paging_token ?? (tx as Record<string, unknown>).hash ?? "");
        if (!key || !seenTokens.has(key)) {
          if (key) seenTokens.add(key);
          allTransactions.push(tx);
        }
      }

      // Emit metrics update - transaction count
      emit(() =>
        emitter.emitMetricsUpdate({
          transactionCount: allTransactions.length,
          totalTransactions: totalEstimatedTotal,
        }),
      );

      if (
        recordsWithOps.some((tx: TransactionRecord) => {
          return new Date(tx.created_at) < cutoffDate;
        })
      ) {
        hasMore = false;
        break;
      }

      cursor =
        respRecords.length === 200 &&
        respRecords[respRecords.length - 1].paging_token
          ? String(respRecords[respRecords.length - 1].paging_token)
          : undefined;
      if (!cursor) hasMore = false;
    }

    const fetchElapsed = Date.now() - fetchStart;
    if (!background && fetchElapsed < fetchDuration) {
      const remaining = fetchDuration - fetchElapsed;
      const tickMs = 80;
      await new Promise<void>((resolve) => {
        let spent = 0;
        const interval = setInterval(() => {
          spent += tickMs;
          const progress = Math.min(
            95,
            Math.round(((fetchElapsed + spent) / fetchDuration) * 95),
          );
          emitter.emitStepProgress("fetching-transactions", progress);
          if (spent >= remaining) {
            clearInterval(interval);
            resolve();
          }
        }, tickMs);
      });
    }
    emit(() => emitter.emitStepProgress("fetching-transactions", 100));
    emit(() => emitter.emitStepComplete("fetching-transactions"));

    currentEmittedStep = "filtering-timeframes";
    emit(() => emitter.emitStepChange("filtering-timeframes"));
    const filteredTransactions = await animateStep(
      "filtering-timeframes",
      emitter,
      () => {
        const filtered = allTransactions.filter((tx) => {
          const txData = tx as unknown as Record<string, unknown>;
          return new Date(txData.created_at as string) >= cutoffDate;
        });
        // Emit metrics update - timeframes processed
        emit(() =>
          emitter.emitMetricsUpdate({
            timeframesProcessed: 1,
          }),
        );
        return filtered;
      },
      background,
    );

    currentEmittedStep = "calculating-volume";
    emit(() => emitter.emitStepChange("calculating-volume"));
    await animateStep("calculating-volume", emitter, () => {
      let totalVolume = 0;
      filteredTransactions.forEach((tx) => {
        const txData = tx as Record<string, unknown>;
        (Array.isArray(txData.operations) ? txData.operations : []).forEach(
          (op) => {
            const opData = op as Record<string, unknown>;
            if (opData.type === "payment" && opData.amount) {
              totalVolume += parseFloat(String(opData.amount));
            }
          },
        );
      });
      // Emit metrics update - volume processed
      emit(() =>
        emitter.emitMetricsUpdate({
          volumeProcessed: totalVolume.toFixed(2),
        }),
      );
    }, background);

    currentEmittedStep = "identifying-assets";
    emit(() => emitter.emitStepChange("identifying-assets"));
    const assetMap = await animateStep("identifying-assets", emitter, () => {
      const map = new Map<string, number>();
      filteredTransactions.forEach((tx) => {
        const txData = tx as Record<string, unknown>;
        (Array.isArray(txData.operations) ? txData.operations : []).forEach(
          (op) => {
            const opData = op as Record<string, unknown>;
            if (opData.type === "payment") {
              const key = String(opData.asset_code || "native");
              map.set(key, (map.get(key) || 0) + 1);
            }
          },
        );
      });
      // Emit metrics update - asset count
      emit(() =>
        emitter.emitMetricsUpdate({
          assetCount: map.size,
        }),
      );
      return map;
    }, background);

    currentEmittedStep = "counting-contracts";
    emit(() => emitter.emitStepChange("counting-contracts"));
    const contractCount = await animateStep("counting-contracts", emitter, () => {
      const count = filteredTransactions.reduce((count: number, tx) => {
        const txData = tx as Record<string, unknown>;
        return (
          count +
          (Array.isArray(txData.operations) ? txData.operations : []).filter(
            (op) =>
              (op as Record<string, unknown>).type === "invoke_host_function",
          ).length
        );
      }, 0);
      // Emit metrics update - contract count
      emit(() =>
        emitter.emitMetricsUpdate({
          contractCount: count,
        }),
      );
      return count;
    }, background);

    currentEmittedStep = "finalizing";
    emit(() => emitter.emitStepChange("finalizing"));
    const result = await animateStep("finalizing", emitter, () => {
      const typedTransactions = allTransactions.map((tx) => {
        const txData = tx as Record<string, unknown>;
        return {
          created_at: String(txData.created_at || new Date().toISOString()),
          memo: txData.memo ? String(txData.memo) : undefined,
          operations: Array.isArray(txData.operations) ? txData.operations : [],
        };
      });
      const r = calculateAchievements(typedTransactions);
      r.accountId = accountId;
      // Use assetMap and contractCount for additional metadata if needed
      void assetMap;
      void contractCount;
      return r;
    }, background);

    // Cancellation may land between the last fetch and here; never hand a
    // cancelled run's result to callers that would store it.
    throwIfAborted(runSignal);
    emit(() => emitter.emitIndexingComplete(result));
    return { result, transactions: allTransactions };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error during indexing";
    // Do not log accountId — PII / activity leak in production consoles
    indexerError("Indexing failed", error);
    emit(() => emitter.emitStepError(currentEmittedStep, errorMessage, true));
    throw error;
  }
}
