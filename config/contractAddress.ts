/**
 * Single source of truth for which Soroban contract the app talks to.
 *
 * Resolution order per network:
 *   NEXT_PUBLIC_CONTRACT_ADDRESS_<NETWORK> → NEXT_PUBLIC_CONTRACT_ADDRESS → placeholder
 *
 * `scripts/validate-env.js` (run by `validate:env` and `prebuild`) applies the
 * same order and fails the build when the resolved address is absent or
 * malformed. Kept free of SDK imports so it is safe to use in any bundle.
 */

import type { Network } from "../src/config";

/** Placeholder when no contract is configured (56-char Soroban format: C + 55 base32 chars) */
export const PLACEHOLDER_CONTRACT_ADDRESS = "C" + "A".repeat(55);

/** Soroban contract address format: C + 55 base32 chars = 56 total */
const CONTRACT_ADDRESS_REGEX = /^C[A-Z2-7]{55}$/;

/**
 * Validates Soroban contract address format (C-prefix, 56 chars, base32).
 */
export function isValidContractAddress(address: string): boolean {
  if (typeof address !== "string" || address.length !== 56) return false;
  return CONTRACT_ADDRESS_REGEX.test(address);
}

/**
 * True when address is the all-A placeholder (or starts with enough A's to match legacy checks).
 * Format-valid but not a real deployed contract - must never reach wallet signing.
 */
export function isPlaceholderContractAddress(address: string): boolean {
  if (typeof address !== "string" || !address) return true;
  if (address === PLACEHOLDER_CONTRACT_ADDRESS) return true;
  // Legacy / partial placeholders used in older bridges
  return address.startsWith("CAAAAAAA");
}

/**
 * Resolves the configured contract address for a network without validating it.
 * Env vars are read as literals so Next.js can inline them at build time.
 */
export function resolveContractAddress(network: Network): string {
  const legacy = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const perNetwork =
    network === "mainnet"
      ? process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_MAINNET
      : process.env.NEXT_PUBLIC_CONTRACT_ADDRESS_TESTNET;
  return perNetwork || legacy || PLACEHOLDER_CONTRACT_ADDRESS;
}
