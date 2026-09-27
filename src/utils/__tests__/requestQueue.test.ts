import { RequestQueue } from "../requestQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("RequestQueue", () => {
  it("starts tasks in FIFO order", async () => {
    const queue = new RequestQueue({ name: "test", maxConcurrency: 1 });
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3].map((n) =>
        queue.enqueue(async () => {
          order.push(n);
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3]);
  });

  it("never exceeds the concurrency cap", async () => {
    const queue = new RequestQueue({ name: "test", maxConcurrency: 2 });
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    const results = gates.map((gate) =>
      queue.enqueue(async () => {
        running++;
        peak = Math.max(peak, running);
        await gate.promise;
        running--;
      }),
    );

    await flush();
    expect(queue.running).toBe(2);
    expect(queue.pending).toBe(3);
    gates.forEach((gate) => gate.resolve());
    await Promise.all(results);
    expect(peak).toBe(2);
  });

  it("retries retryable failures with backoff", async () => {
    const onRetry = jest.fn();
    const queue = new RequestQueue({
      name: "test",
      initialBackoffMs: 1,
      classifyError: () => ({ retryable: true }),
      onRetry,
    });
    const factory = jest
      .fn()
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce("ok");

    await expect(queue.enqueue(factory)).resolves.toBe("ok");
    expect(factory).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, 1, expect.any(Error));
  });

  it("does not retry when retry is disabled", async () => {
    const queue = new RequestQueue({
      name: "test",
      classifyError: () => ({ retryable: true }),
    });
    const factory = jest.fn().mockRejectedValue(new Error("503"));
    await expect(queue.enqueue(factory, { retry: false })).rejects.toThrow("503");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("rejects queued tasks on abort without running them", async () => {
    const queue = new RequestQueue({ name: "test", maxConcurrency: 1 });
    const gate = deferred<void>();
    const first = queue.enqueue(() => gate.promise);
    const controller = new AbortController();
    const queuedFactory = jest.fn().mockResolvedValue("late");
    const queued = queue.enqueue(queuedFactory, { signal: controller.signal });

    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    gate.resolve();
    await first;
    await flush();
    expect(queuedFactory).not.toHaveBeenCalled();
  });

  it("rejects an in-flight task whose result arrives after abort", async () => {
    const queue = new RequestQueue({ name: "test" });
    const gate = deferred<string>();
    const controller = new AbortController();
    const result = queue.enqueue(() => gate.promise, { signal: controller.signal });

    await flush();
    controller.abort();
    gate.resolve("stale");
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const queue = new RequestQueue({ name: "test" });
    const controller = new AbortController();
    controller.abort();
    const factory = jest.fn();
    await expect(queue.enqueue(factory, { signal: controller.signal })).rejects.toBeDefined();
    expect(factory).not.toHaveBeenCalled();
  });

  it("clear rejects pending tasks", async () => {
    const queue = new RequestQueue({ name: "test", maxConcurrency: 1 });
    const gate = deferred<void>();
    const first = queue.enqueue(() => gate.promise);
    const second = queue.enqueue(async () => "never");
    queue.clear();
    await expect(second).rejects.toThrow("test request queue cleared");
    gate.resolve();
    await first;
  });
});
