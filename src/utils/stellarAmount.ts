/**
 * Utilities for formatting and parsing Stellar asset amounts with 7 decimal precision (Stroops).
 *
 * 1 XLM = 10,000,000 Stroops (10^7).
 * Stellar limits and balances use a signed 64-bit integer internally.
 * Maximum valid amount: 922,337,203,685.4775807 (i64 max: 9223372036854775807 stroops).
 *
 * NOTE: This is the single canonical amount-conversion module. The former
 * `src/utils/stellarAmounts.ts` (one character apart) has been merged into this
 * file; all importers should reference `src/utils/stellarAmount` only.
 */

export const STROOPS_PER_UNIT = 10_000_000n;
export const MAX_STROOPS = 9223372036854775807n;
export const MAX_STELLAR_LIMIT = "922337203685.4775807";

/**
 * Validates whether a given string is a valid positive Stellar decimal amount
 * with at most 7 decimal places.
 */
export function isValidStellarAmount(amount: string): boolean {
  if (!amount || typeof amount !== "string") {
    return false;
  }
  const trimmed = amount.trim();
  if (trimmed === "" || trimmed.startsWith("-")) {
    return false;
  }

  // Regex matching positive numbers with up to 7 decimal digits
  const regex = /^\d+(\.\d{1,7})?$/;
  if (!regex.test(trimmed)) {
    return false;
  }

  try {
    const stroops = toStroops(trimmed);
    return stroops > 0n && stroops <= MAX_STROOPS;
  } catch {
    return false;
  }
}

/**
 * Converts a decimal Stellar amount string or number to integer Stroops (bigint).
 * Prevents JavaScript IEEE-754 floating point precision inaccuracies.
 *
 * @param amount - Decimal string or number, e.g. "12.3456789"
 * @returns bigint representing the amount in Stroops
 * @throws Error if amount is invalid or negative or exceeds 7 decimals
 */
export function toStroops(amount: string | number): bigint {
  const str = typeof amount === "number" ? amount.toString() : amount.trim();
  if (!str) {
    throw new Error("Amount cannot be empty");
  }

  if (str.startsWith("-")) {
    throw new Error("Negative amounts are not allowed");
  }

  const parts = str.split(".");
  if (parts.length > 2) {
    throw new Error(`Invalid amount format: "${str}"`);
  }

  const wholePart = parts[0] || "0";
  const decimalPart = parts[1] || "";

  if (decimalPart.length > 7) {
    throw new Error(`Amount "${str}" exceeds maximum 7 decimal places for Stellar`);
  }

  if (!/^\d+$/.test(wholePart) || (decimalPart.length > 0 && !/^\d+$/.test(decimalPart))) {
    throw new Error(`Invalid numeric characters in amount: "${str}"`);
  }

  // Pad decimal part to 7 places
  const paddedDecimal = decimalPart.padEnd(7, "0");
  const stroops = BigInt(wholePart) * STROOPS_PER_UNIT + BigInt(paddedDecimal);

  if (stroops > MAX_STROOPS) {
    throw new Error(`Amount "${str}" exceeds maximum Stellar 64-bit integer limit`);
  }

  return stroops;
}

/**
 * Converts an amount in Stroops (bigint or numeric string) to a human-readable
 * 7-decimal Stellar string without trailing unnecessary zeroes if trimTrailingZeroes is true.
 *
 * @param stroops - Integer Stroops as bigint or string
 * @param trimTrailingZeroes - Whether to remove trailing zeroes after decimal point (default: false)
 * @returns Decimal string representation
 */
export function fromStroops(
  stroops: bigint | string | number,
  trimTrailingZeroes = false
): string {
  const value = typeof stroops === "bigint" ? stroops : BigInt(String(stroops).trim());
  if (value < 0n) {
    throw new Error("Stroops cannot be negative");
  }

  const whole = value / STROOPS_PER_UNIT;
  const fraction = value % STROOPS_PER_UNIT;

  let fractionStr = fraction.toString().padStart(7, "0");

  if (trimTrailingZeroes) {
    fractionStr = fractionStr.replace(/0+$/, "");
    if (fractionStr === "") {
      return whole.toString();
    }
  }

  return `${whole.toString()}.${fractionStr}`;
}

/**
 * Formats a Stellar decimal amount for user display.
 *
 * @param amount - Decimal string or number
 * @param maxDecimals - Maximum decimal places to display (defaults to 7)
 */
export function formatStellarAmount(
  amount: string | number | undefined | null,
  maxDecimals = 7
): string {
  if (amount === undefined || amount === null || amount === "") {
    return "0";
  }

  const str = String(amount).trim();
  if (!isValidStellarAmount(str)) {
    return str;
  }

  try {
    const stroops = toStroops(str);
    const fullDecimal = fromStroops(stroops, true);
    const parts = fullDecimal.split(".");
    if (parts.length === 1) {
      return parts[0];
    }
    const dec = parts[1].slice(0, maxDecimals);
    return dec.length > 0 ? `${parts[0]}.${dec}` : parts[0];
  } catch {
    return str;
  }
}

// ---------------------------------------------------------------------------
// XLM ↔ stroops helpers (formerly src/utils/stellarAmounts.ts)
// ---------------------------------------------------------------------------

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
