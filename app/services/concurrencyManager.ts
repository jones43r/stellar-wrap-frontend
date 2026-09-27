const MAX_CONCURRENT_REQUESTS = 5;

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Indexing cancelled", "AbortError");
  }
}

export class ConcurrencyManager {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent = MAX_CONCURRENT_REQUESTS) {}

  /**
   * Runs `fn` once a slot is free. With a `signal`, a task still waiting for a
   * slot is dropped on abort, and a result that resolves after abort is
   * discarded so it can never be stored for a cancelled run.
   */
  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    while (this.active >= this.maxConcurrent) {
      throwIfAborted(signal);
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          this.queue = this.queue.filter((waiter) => waiter !== wake);
          reject(new DOMException("Indexing cancelled", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        this.queue.push(wake);
      });
    }
    throwIfAborted(signal);

    this.active++;
    try {
      const result = await fn();
      throwIfAborted(signal);
      return result;
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
