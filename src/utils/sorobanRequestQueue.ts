/**
 * Soroban RPC request queue.
 *
 * Serializes and coalesces Soroban RPC calls so bursts of identical requests
 * (e.g. `getAccount` / `simulateTransaction` during transaction build + wallet
 * re-validation) share a single network round-trip and never trigger provider
 * rate limiting. Transient failures (timeouts, 429/408/503/504, connection
 * resets) are retried with exponential backoff.
 *
 * Read-only by design: callers performing state-changing RPCs (sendTransaction)
 * can opt out of auto-retry with `retry: false` and still benefit from the
 * concurrency cap.
 *
 * @module sorobanRequestQueue
 */

import { RequestQueue } from "./requestQueue";

export type { EnqueueOptions } from "./requestQueue";

/**
 * Detects errors worth retrying: rate limits, transient HTTP statuses, and
 * network-level failures. Contract/logic errors are never retried.
 */
export function isRetryableRpcError(error: unknown): boolean {
  const status =
    error !== null &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? String((error as { status: number }).status)
      : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : status;
  const lowered = message.toLowerCase();

  if (
    lowered.includes("429") ||
    lowered.includes("408") ||
    lowered.includes("503") ||
    lowered.includes("504") ||
    lowered.includes("520") ||
    lowered.includes("521") ||
    lowered.includes("522") ||
    lowered.includes("524") ||
    lowered.includes("rate limit") ||
    lowered.includes("timeout") ||
    lowered.includes("timed out") ||
    lowered.includes("econnreset") ||
    lowered.includes("econnrefused") ||
    lowered.includes("fetch failed") ||
    lowered.includes("networkerror") ||
    lowered.includes("network error") ||
    lowered.includes("server busy")
  ) {
    return true;
  }

  return false;
}

const RETRYABLE_BACKOFF_MS = 500;

/** Soroban RPC configuration of the shared {@link RequestQueue}. */
export class SorobanRequestQueue extends RequestQueue {
  constructor(
    maxConcurrency: number = 2,
    maxAttempts: number = 3,
    initialBackoffMs: number = RETRYABLE_BACKOFF_MS,
  ) {
    super({
      name: "Soroban",
      maxConcurrency,
      maxAttempts,
      initialBackoffMs,
      classifyError: (error) => ({ retryable: isRetryableRpcError(error) }),
    });
  }
}

/** Shared singleton for the whole app. */
export const sorobanQueue = new SorobanRequestQueue(2, 3, RETRYABLE_BACKOFF_MS);