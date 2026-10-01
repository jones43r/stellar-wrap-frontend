/**
 * Regression tests for fatal indexer failures on the loading screen (#218).
 *
 * The bug: the loading screen caught an unrecoverable indexer error, set the
 * error state, and then navigated to /persona anyway after a short delay. That
 * rendered an empty wrap and hid the real failure, leaving the user with no
 * retry affordance.
 */

import { shouldNavigateToPersona, toIndexerErrorMessage } from "../indexerFailure";

describe("shouldNavigateToPersona", () => {
  it("does not navigate when a fatal failure left no result", () => {
    // Fatal indexer failure: nothing was produced, so the user must stay on the
    // error/retry UI rather than being pushed to an empty persona screen.
    expect(shouldNavigateToPersona(null)).toBe(false);
    expect(shouldNavigateToPersona(undefined)).toBe(false);
  });

  it("navigates when real indexer result data is available", () => {
    const result = { username: "stellar_legend", totalTransactions: 420 };

    expect(shouldNavigateToPersona(result)).toBe(true);
  });

  it("navigates when the mock/cached fallback produced a result", () => {
    const fallback = { username: "demo", totalTransactions: 42 };

    expect(shouldNavigateToPersona(fallback)).toBe(true);
  });
});

describe("toIndexerErrorMessage", () => {
  it("surfaces the underlying indexer error message", () => {
    expect(toIndexerErrorMessage(new Error("Horizon request timed out"))).toBe(
      "Horizon request timed out"
    );
  });

  it("falls back to a generic message for non-Error throws", () => {
    expect(toIndexerErrorMessage("boom")).toBe("Failed to load wrap data");
    expect(toIndexerErrorMessage(new Error(""))).toBe("Failed to load wrap data");
  });

  it.each<unknown>([
    null,
    undefined,
    0,
    false,
    42n,
    Symbol("failure"),
    () => undefined,
    [],
    { message: "not an Error" },
    Object.create(null),
  ])("falls back safely for unexpected values (%s)", (error) => {
    expect(toIndexerErrorMessage(error)).toBe("Failed to load wrap data");
  });

  it("preserves a non-empty Error message verbatim", () => {
    expect(toIndexerErrorMessage(new TypeError("  invalid response  "))).toBe(
      "  invalid response  "
    );
  });
});
