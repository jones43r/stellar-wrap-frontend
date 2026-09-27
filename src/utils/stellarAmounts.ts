/**
 * Stellar amount helpers: XLM ↔ stroops conversion and 7-decimal formatting.
 *
 * XLM amounts on Stellar are expressed as stroops (1 XLM = 10,000,000 stroops)
 * with a maximum precision of 7 decimal places. Working in stroops avoids the
 * floating-point drift that naive `number` arithmetic introduces, and keeps
 * signatures, balances, and fees consistent.
 *
 * @module stellarAmounts
 */

import { fromStroops } from "./stellarAmount";

/** Number of stroops in one XLM. */
export const STROOPS_PER_XLM = 10_000_000;

/** Maximum decimal precision of an XLM amount. */
export const XLM_MAX_PRECISION = 7;

/** Largest stroops value storable in a signed 64-bit integer. */
export const MAX_TOTAL_STROOPS = (1n << 63n) - 1n;

export type AmountFailureReason =
  | "invalid"
  | "too-many-decimals"
  | "negative"
  | "overflow";

export type AmountResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: AmountFailureReason };

export type StroopsParseResult = AmountResult<bigint>;

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

/**
 * Converts the decimal string representation of an XLM amount to stroops.
 *
 * Accepts at most `XLM_MAX_PRECISION` fractional digits, rejects negative and
 * non-numeric input, and guards against values that exceed the signed 64-bit
 * stroops range.
 *
 * @param raw - Decimal XLM amount, e.g. "42.1234567"
 * @returns `{ ok: true, value }` on success, or a categorized failure.
 */
export function parseAmountToStroops(raw: string): StroopsParseResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const trimmed = raw.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    return { ok: false, reason: "invalid" };
  }

  const dotIndex = trimmed.indexOf(".");
  const intPart = dotIndex === -1 ? trimmed : trimmed.slice(0, dotIndex);
  const fracPart = dotIndex === -1 ? "" : trimmed.slice(dotIndex + 1);

  if (fracPart.length > XLM_MAX_PRECISION) {
    return { ok: false, reason: "too-many-decimals" };
  }

  const intStroops = BigInt(intPart) * BigInt(STROOPS_PER_XLM);
  const fracStroops =
    fracPart.length === 0 ? 0n : BigInt(fracPart.padEnd(XLM_MAX_PRECISION, "0"));

  const stroops = intStroops + fracStroops;
  if (stroops > MAX_TOTAL_STROOPS) {
    return { ok: false, reason: "overflow" };
  }

  return { ok: true, value: stroops };
}

/**
 * Converts a numeric or decimal-string XLM amount to stroops.
 *
 * Numeric input is normalized to its decimal string first so rounding honors
 * 7-decimal precision regardless of how the caller represents the number.
 *
 * @param amount - XLM amount as a number or decimal string.
 * @returns A result union; never throws for user-provided input.
 */
export function xlmToStroops(amount: number | string): StroopsParseResult {
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) {
      return { ok: false, reason: "invalid" };
    }
    if (amount < 0) {
      return { ok: false, reason: "negative" };
    }
    return parseAmountToStroops(amount.toFixed(XLM_MAX_PRECISION));
  }
  return parseAmountToStroops(amount);
}

/**
 * Converts stroops to a floating-point XLM amount.
 *
 * The fractional component is derived by integer division so no stroop is
 * lost; the returned double is only ever used for display/estimation, never
 * for re-scaling back to stroops.
 *
 * @param stroops - Stroop value as a bigint, number, or numeric string.
 * @returns XLM amount as a number.
 */
export function stroopsToXlm(stroops: bigint | number | string): number {
  const value = toStroopsBigInt(stroops);
  const whole = value / BigInt(STROOPS_PER_XLM);
  const frac = value % BigInt(STROOPS_PER_XLM);
  return Number(whole) + Number(frac) / STROOPS_PER_XLM;
}

/**
 * Formats a stroops value as an XLM string with up to 7 decimal places.
 *
 * `maxFractionDigits` is clamped to `XLM_MAX_PRECISION` and defaults to it, so
 * balances and fees render with consistent precision (matching the `toFixed(7)`
 * convention used elsewhere in the app).
 */
export interface FormatXlmOptions {
  maxFractionDigits?: number;
}

export function formatXlm(
  stroops: bigint | number | string,
  options: FormatXlmOptions = {},
): string {
  const maxFractionDigits = options.maxFractionDigits ?? XLM_MAX_PRECISION;
  const clamped = Math.min(
    Math.max(Math.floor(maxFractionDigits), 0),
    XLM_MAX_PRECISION,
  );
  // Format from the exact bigint so values above Number.MAX_SAFE_INTEGER
  // stroops never pass through a float. Extra digits are truncated, never
  // rounded up, so a displayed amount never exceeds the real balance.
  const [whole, fraction] = fromStroops(toStroopsBigInt(stroops)).split(".");
  return clamped === 0 ? whole : `${whole}.${fraction.slice(0, clamped)}`;
}

/**
 * Coerces a bigint / integer number / integer string into a stroops bigint.
 *
 * Unlike `parseAmountToStroops`, the input here is already a whole stroop
 * count, so it is converted verbatim and only range-checked.
 *
 * @param value - Whole stroops count.
 * @returns The stroops bigint, or throws on negative or out-of-range input.
 */
function toStroopsBigInt(value: bigint | number | string): bigint {
  const big =
    typeof value === "bigint"
      ? value
      : typeof value === "number"
        ? BigInt(Math.trunc(value))
        : BigInt(value.trim() || "0");

  if (big < 0n) {
    throw new RangeError(`Invalid stroops value: ${String(value)}`);
  }
  if (big > MAX_TOTAL_STROOPS) {
    throw new RangeError(`Stroops value exceeds Int64 range: ${String(value)}`);
  }
  return big;
}
