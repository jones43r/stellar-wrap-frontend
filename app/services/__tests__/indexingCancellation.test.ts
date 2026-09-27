/**
 * Regression test (#290, #634): cancelling an indexing run must stop queued
 * requests and never deliver a result that resolved after cancellation.
 */
import { ConcurrencyManager } from "../concurrencyManager";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("indexing cancellation", () => {
  it("drops requests still queued behind the concurrency cap", async () => {
    const manager = new ConcurrencyManager(1);
    const controller = new AbortController();
    const gate = deferred<string>();

    const inFlight = manager.run(() => gate.promise, controller.signal);
    const queuedFn = jest.fn().mockResolvedValue("queued");
    const queued = manager.run(queuedFn, controller.signal);

    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });

    gate.resolve("late");
    await expect(inFlight).rejects.toMatchObject({ name: "AbortError" });
    expect(queuedFn).not.toHaveBeenCalled();
  });

  it("discards a fetch that resolves after cancellation", async () => {
    const manager = new ConcurrencyManager();
    const controller = new AbortController();
    const gate = deferred<string>();
    const stored: string[] = [];

    const run = manager
      .run(() => gate.promise, controller.signal)
      .then((value) => stored.push(value));

    controller.abort();
    gate.resolve("stale-account-data");

    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(stored).toEqual([]);
  });

  it("does not start work when already cancelled", async () => {
    const manager = new ConcurrencyManager();
    const controller = new AbortController();
    controller.abort();
    const fn = jest.fn();

    await expect(manager.run(fn, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("releases its slot so later runs proceed", async () => {
    const manager = new ConcurrencyManager(1);
    const controller = new AbortController();
    const gate = deferred<string>();
    const cancelled = manager.run(() => gate.promise, controller.signal);
    const next = manager.run(async () => "next");

    controller.abort();
    gate.resolve("late");
    await expect(cancelled).rejects.toBeDefined();
    await expect(next).resolves.toBe("next");
  });
});
