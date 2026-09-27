/**
 * Shared rate-limited request queue.
 *
 * One implementation of "serialize and throttle requests against a
 * rate-limited endpoint", parameterized by endpoint name, concurrency cap and
 * retry policy. `horizonRequestQueue` and `sorobanRequestQueue` are thin
 * configurations of this class so both endpoints get identical backoff,
 * concurrency and cancellation behaviour.
 *
 * `useRateLimit` is the client-side half of the same mechanism: it paces
 * wallet RPC calls from React and reads the shared `rateLimitStore` that this
 * queue updates via the `onRetry` / `onRateLimit` hooks.
 *
 * @module requestQueue
 */

export interface RetryDecision {
  /** Whether the failure is transient and should be retried. */
  retryable: boolean;
  /** Error to reject with when not retrying. Defaults to the original error. */
  error?: unknown;
  /** Server-provided delay before retrying, overriding exponential backoff. */
  retryAfterMs?: number;
  /** Epoch ms until which the whole queue must pause (global rate limit). */
  rateLimitResetMs?: number;
}

export interface RequestQueueOptions {
  /** Endpoint name, used in error messages. */
  name: string;
  maxConcurrency?: number;
  maxAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** Classifies a failure. Async so callers can parse response bodies. */
  classifyError?: (error: unknown) => RetryDecision | Promise<RetryDecision>;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  onGiveUp?: (error: unknown) => void;
  /** Called with the reset time when paused, and `null` when resumed. */
  onRateLimit?: (resetMs: number | null) => void;
}

export interface EnqueueOptions {
  /** Whether transient failures should be retried with backoff. Default true. */
  retry?: boolean;
  /** Aborting rejects the task if queued, waiting to retry, or in flight. */
  signal?: AbortSignal;
}

interface QueueItem<T> {
  factory: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  attempts: number;
  retry: boolean;
  signal?: AbortSignal;
  settled: boolean;
}

function abortError(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

export class RequestQueue {
  private queue: QueueItem<unknown>[] = [];
  private active = 0;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private rateLimitReset: number | null = null;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  readonly name: string;
  private readonly maxConcurrency: number;
  private readonly maxAttempts: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly options: RequestQueueOptions;

  constructor(options: RequestQueueOptions) {
    this.options = options;
    this.name = options.name;
    this.maxConcurrency = options.maxConcurrency ?? 2;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.initialBackoffMs = options.initialBackoffMs ?? 500;
    this.maxBackoffMs = options.maxBackoffMs ?? 16_000;
  }

  enqueue<T>(factory: () => Promise<T>, options: EnqueueOptions = {}): Promise<T> {
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(abortError(signal));

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = {
        factory,
        resolve,
        reject,
        attempts: 0,
        retry: options.retry ?? true,
        signal,
        settled: false,
      };

      signal?.addEventListener(
        "abort",
        () => {
          this.queue = this.queue.filter((queued) => queued !== item);
          this.settle(item, false, abortError(signal));
          this.pump();
        },
        { once: true },
      );

      this.queue.push(item as QueueItem<unknown>);
      this.pump();
    });
  }

  /**
   * Deduplicates concurrent identical calls. While a request for `key` is in
   * flight, subsequent calls for the same key receive the same promise.
   */
  coalesce<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const cached = this.inFlight.get(key);
    if (cached !== undefined) return cached as Promise<T>;

    const promise = this.enqueue(factory);
    this.inFlight.set(key, promise);
    promise.then(
      () => this.inFlight.delete(key),
      () => this.inFlight.delete(key),
    );
    return promise;
  }

  /** Number of tasks waiting to start. */
  get pending(): number {
    return this.queue.length;
  }

  /** Number of tasks currently executing. */
  get running(): number {
    return this.active;
  }

  clear(): void {
    const items = this.queue;
    this.queue = [];
    items.forEach((item) =>
      this.settle(item, false, new Error(`${this.name} request queue cleared`)),
    );
    this.inFlight.clear();
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
    if (this.rateLimitReset !== null) this.options.onRateLimit?.(null);
    this.rateLimitReset = null;
  }

  private settle(item: QueueItem<unknown>, ok: boolean, value: unknown): void {
    if (item.settled) return;
    item.settled = true;
    if (ok) item.resolve(value);
    else item.reject(value);
  }

  private pump(): void {
    if (this.rateLimitReset !== null) {
      const wait = this.rateLimitReset - Date.now();
      if (wait > 0) {
        if (!this.pauseTimer) {
          this.pauseTimer = setTimeout(() => {
            this.pauseTimer = null;
            this.pump();
          }, wait);
        }
        return;
      }
      this.rateLimitReset = null;
      this.options.onRateLimit?.(null);
    }

    while (this.active < this.maxConcurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      if (item.settled) continue;
      this.active++;
      void this.execute(item).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async execute(item: QueueItem<unknown>): Promise<void> {
    try {
      const result = await item.factory();
      // A cancelled task must not deliver a result that resolved after abort.
      if (item.signal?.aborted) {
        this.settle(item, false, abortError(item.signal));
        return;
      }
      this.settle(item, true, result);
    } catch (error) {
      if (item.settled) return;
      if (item.signal?.aborted) {
        this.settle(item, false, abortError(item.signal));
        return;
      }

      const decision = this.options.classifyError
        ? await this.options.classifyError(error)
        : { retryable: false };

      if (item.retry && decision.retryable && item.attempts < this.maxAttempts) {
        item.attempts++;
        if (decision.rateLimitResetMs !== undefined) {
          this.rateLimitReset = decision.rateLimitResetMs;
          this.options.onRateLimit?.(decision.rateLimitResetMs);
        }
        const delay = decision.retryAfterMs ?? this.backoffForAttempt(item.attempts);
        this.options.onRetry?.(item.attempts, delay, decision.error ?? error);
        setTimeout(() => {
          if (item.settled) return;
          this.queue.push(item);
          this.pump();
        }, delay);
        return;
      }

      this.options.onGiveUp?.(decision.error ?? error);
      this.settle(item, false, decision.error ?? error);
    }
  }

  private backoffForAttempt(attempt: number): number {
    return Math.min(this.initialBackoffMs * 2 ** (attempt - 1), this.maxBackoffMs);
  }
}
