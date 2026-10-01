/**
 * useFreighterWallet
 *
 * A React hook that manages the full Freighter wallet connection lifecycle
 * for Liquidity Pool interactions.
 *
 * Features
 * ────────
 * - Single entry-point `connect()` to request wallet access
 * - Connection timeout via `AbortController` (default 30 s)
 * - Typed error handling covering every failure mode:
 *     NOT_INSTALLED   – Freighter extension absent
 *     USER_REJECTED   – user dismissed the permission dialog
 *     NETWORK_MISMATCH– wallet is on a different Stellar network
 *     TIMEOUT         – no response within the timeout window
 *     UNKNOWN         – anything else
 * - `retry()` resets error state and re-triggers `connect()`
 * - `disconnect()` clears local state (Freighter has no programmatic
 *   disconnect API, so this only affects client-side state)
 * - `shortKey` — a truncated public key for display (e.g. "GAAZI4…CCWN")
 * - `formattedBalance` — the account's native XLM balance, formatted via
 *   the `stellarAmounts` utilities
 * - Rate-limit awareness: respects `useRateLimitStore`; defers Horizon
 *   account-preview requests when a rate-limit window is active
 * - RPC optimisation: balance fetches are routed through `horizonQueue`
 *   (the project-wide rate-limit-aware request queue) rather than making
 *   raw Horizon calls, preventing 429 errors from impacting the UI.
 *
 * Strict TypeScript — no `any`.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  connectFreighter,
  FreighterNotInstalledError,
  NetworkMismatchError,
} from "../../app/utils/walletConnect";
import { getHorizonServer } from "../../app/utils/stellarClient";
import { horizonQueue } from "../utils/horizonRequestQueue";
import { useRateLimitStore } from "../store/rateLimitStore";
import { truncatePublicKey, formatXlm } from "../utils/stellarAmount";
import type { Network } from "../config";

// ─── Error codes ──────────────────────────────────────────────────────────────

/** Discriminated set of reasons a Freighter connection can fail. */
export type FreighterErrorCode =
  | "NOT_INSTALLED"
  | "USER_REJECTED"
  | "NETWORK_MISMATCH"
  | "TIMEOUT"
  | "UNKNOWN";

/** Structured error returned by the hook. */
export interface FreighterWalletError {
  code: FreighterErrorCode;
  /** Human-readable message suitable for display in the UI. */
  message: string;
  /**
   * Set when `code === "NETWORK_MISMATCH"`. Both sides are exposed so the UI
   * can render a specific "switch to X" prompt.
   */
  mismatch?: {
    expected: Network;
    actual: string;
  };
  /** URL to the Freighter install page, set when `code === "NOT_INSTALLED"`. */
  installUrl?: string;
}

// ─── Hook state ───────────────────────────────────────────────────────────────

/** Connection states for the Freighter wallet. */
export type FreighterConnectionState =
  | "idle"       // No connection attempt yet
  | "connecting" // `requestAccess` in flight
  | "connected"  // Public key obtained; optional balance loading may still be in progress
  | "error";     // Terminal failure; call `retry()` to try again

/** All values returned by `useFreighterWallet`. */
export interface UseFreighterWalletResult {
  /** Current connection state. */
  connectionState: FreighterConnectionState;
  /** The connected Stellar public key, or null if not connected. */
  publicKey: string | null;
  /**
   * Truncated version of `publicKey` for UI display (e.g. "GAAZI4…CCWN").
   * Null when not connected.
   */
  shortKey: string | null;
  /**
   * The account's native XLM balance, formatted with `decimals` dp.
   * Null when not connected or balance not yet loaded.
   */
  formattedBalance: string | null;
  /** True while the account balance is being fetched from Horizon. */
  isLoadingBalance: boolean;
  /** Structured error from the last failed connection attempt, or null. */
  error: FreighterWalletError | null;
  /**
   * Initiates a Freighter connection request.
   * No-op if already `connecting` or `connected`.
   */
  connect: () => Promise<void>;
  /**
   * Clears local state (public key, balance).
   * Freighter has no programmatic disconnect API so this is client-only.
   */
  disconnect: () => void;
  /**
   * Resets the error and calls `connect()` again.
   * No-op if `connectionState !== "error"`.
   */
  retry: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** How long (ms) to wait for Freighter before treating it as a timeout. */
const CONNECTION_TIMEOUT_MS = 30_000;

/** Balance display precision (2 dp is sufficient for the LP UI). */
const BALANCE_DISPLAY_DECIMALS = 2;

// ─── Hook implementation ──────────────────────────────────────────────────────

/**
 * @param network – The Stellar network the app is configured for.
 *   Defaults to "mainnet". If Freighter is on a different network, the hook
 *   sets a `NETWORK_MISMATCH` error rather than returning a key.
 */
export function useFreighterWallet(
  network: Network = "mainnet",
): UseFreighterWalletResult {
  const [connectionState, setConnectionState] =
    useState<FreighterConnectionState>("idle");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [formattedBalance, setFormattedBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [error, setError] = useState<FreighterWalletError | null>(null);

  // Ref so the in-flight request can be aborted when the component unmounts or
  // the user calls disconnect() while a connection is in progress.
  const abortRef = useRef<AbortController | null>(null);

  // Rate-limit store — we skip the Horizon balance fetch when rate-limited.
  const { isRateLimited } = useRateLimitStore();

  // Abort any in-flight connection on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Balance fetcher ────────────────────────────────────────────────────────

  /**
   * Fetches the account's native XLM balance from Horizon via the rate-limit
   * aware `horizonQueue` and updates state.
   *
   * Routes through `horizonQueue` so concurrent balance fetches are batched
   * and automatically retried with exponential backoff on 429s, keeping the UI
   * stable under high-load conditions (acceptance criterion: RPC calls
   * optimised to prevent rate-limiting).
   *
   * Silently skips when the global rate-limit window is active; sets balance
   * to null on any network error so the UI gracefully degrades to showing just
   * the public key.
   */
  const fetchBalance = useCallback(
    async (address: string, signal: AbortSignal): Promise<void> => {
      if (isRateLimited) {
        // Defer: the UI will re-render when rate-limit clears, and the caller
        // can invoke fetchBalance again at that point.
        return;
      }

      setIsLoadingBalance(true);
      try {
        const server = getHorizonServer(network === "testnet" ? "testnet" : "mainnet");

        // Route through the shared request queue so this call participates in
        // the project's global rate-limiting and retry strategy.
        const account = await horizonQueue.enqueue(() =>
          server.loadAccount(address),
        );

        if (signal.aborted) return;

        const nativeBalance = account.balances.find(
          (b): b is { asset_type: "native"; balance: string } =>
            b.asset_type === "native",
        );

        if (nativeBalance) {
          const formatted = formatXlm(nativeBalance.balance, {
            decimals: BALANCE_DISPLAY_DECIMALS,
            showUnit: true,
            useGrouping: true,
          });
          setFormattedBalance(formatted);
        } else {
          setFormattedBalance(null);
        }
      } catch {
        // Non-fatal: the user is connected even if we can't fetch their balance.
        if (!signal.aborted) {
          setFormattedBalance(null);
        }
      } finally {
        if (!signal.aborted) {
          setIsLoadingBalance(false);
        }
      }
    },
    [network, isRateLimited],
  );

  // ── connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(async (): Promise<void> => {
    if (connectionState === "connecting" || connectionState === "connected") {
      return;
    }

    // Abort any stale controller from a previous attempt.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    // A separate flag to distinguish a timeout-initiated abort from an
    // unmount/disconnect-initiated abort. Both set signal.aborted = true, but
    // only the timeout should surface a TIMEOUT error in the UI.
    let timedOut = false;

    setConnectionState("connecting");
    setError(null);

    // Set up timeout: if Freighter doesn't respond within CONNECTION_TIMEOUT_MS
    // we abort and surface a TIMEOUT error.
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CONNECTION_TIMEOUT_MS);

    try {
      // Race the Freighter call against the abort signal.
      const key = await Promise.race<string>([
        connectFreighter(network),
        new Promise<string>((_, reject) => {
          signal.addEventListener("abort", () =>
            reject(new Error("__TIMEOUT__")),
          );
        }),
      ]);

      if (signal.aborted) return;

      setPublicKey(key);
      setConnectionState("connected");

      // Fire-and-forget balance fetch; it does not block the connection state.
      void fetchBalance(key, signal);
    } catch (err: unknown) {
      if (signal.aborted) {
        // Distinguish timeout (timedOut flag) from unmount/disconnect (silent).
        if (!timedOut) return; // Component unmounted or disconnect() called — stay quiet.
        setConnectionState("error");
        setError({
          code: "TIMEOUT",
          message:
            "Freighter did not respond within 30 seconds. Check the extension is open and try again.",
        });
        return;
      }

      setConnectionState("error");

      if (err instanceof FreighterNotInstalledError) {
        setError({
          code: "NOT_INSTALLED",
          message: "Freighter is not installed. Install it to connect your wallet.",
          installUrl: err.installUrl,
        });
        return;
      }

      if (err instanceof NetworkMismatchError) {
        setError({
          code: "NETWORK_MISMATCH",
          message:
            `Your Freighter wallet is on "${err.actual}" but this app requires "${err.expected}". ` +
            `Please switch Freighter to ${err.expected} and try again.`,
          mismatch: { expected: err.expected, actual: err.actual },
        });
        return;
      }

      if (err instanceof Error) {
        const lower = err.message.toLowerCase();

        // Freighter surfaces rejection in varying message formats across versions.
        if (
          lower.includes("user declined") ||
          lower.includes("rejected") ||
          lower.includes("rejected by user") ||
          lower.includes("connection rejected")
        ) {
          setError({
            code: "USER_REJECTED",
            message: "You declined the connection request. Click Connect to try again.",
          });
          return;
        }

        if (err.message === "__TIMEOUT__") {
          setError({
            code: "TIMEOUT",
            message:
              "Freighter did not respond within 30 seconds. Check the extension is open and try again.",
          });
          return;
        }
      }

      // Catch-all for anything else (e.g. extension internal error).
      setError({
        code: "UNKNOWN",
        message:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while connecting. Please try again.",
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }, [connectionState, network, fetchBalance]);

  // ── disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPublicKey(null);
    setFormattedBalance(null);
    setIsLoadingBalance(false);
    setError(null);
    setConnectionState("idle");
  }, []);

  // ── retry ──────────────────────────────────────────────────────────────────

  const retry = useCallback((): void => {
    if (connectionState !== "error") return;
    setError(null);
    setConnectionState("idle");
    // Use a microtask to let the state update flush before re-calling connect.
    // This prevents the "already connecting" guard from triggering.
    setTimeout(() => void connect(), 0);
  }, [connectionState, connect]);

  // ── derived values ─────────────────────────────────────────────────────────

  const shortKey = publicKey
    ? truncatePublicKey(publicKey, { prefixLength: 6, suffixLength: 4 })
    : null;

  return {
    connectionState,
    publicKey,
    shortKey,
    formattedBalance,
    isLoadingBalance,
    error,
    connect,
    disconnect,
    retry,
  };
}
