/**
 * Property tests for stroop conversion (#636).
 *
 * Uses a seeded PRNG so failures are reproducible without an extra
 * dependency. Values are generated as bigints across the full Int64 range so
 * the round trip is checked well above Number.MAX_SAFE_INTEGER.
 */
import { toStroops, fromStroops, MAX_STROOPS } from "../stellarAmount";
import { formatXlm, parseAmountToStroops } from "../stellarAmount";

const RUNS = 5000;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random stroop value in [0, MAX_STROOPS], biased towards edge magnitudes. */
function arbitraryStroops(rand: () => number): bigint {
  const edges = [
    0n,
    1n,
    9_999_999n,
    10_000_000n,
    BigInt(Number.MAX_SAFE_INTEGER),
    BigInt(Number.MAX_SAFE_INTEGER) + 1n,
    MAX_STROOPS - 1n,
    MAX_STROOPS,
  ];
  if (rand() < 0.1) return edges[Math.floor(rand() * edges.length)];
  const hi = BigInt(Math.floor(rand() * 2 ** 31));
  const lo = BigInt(Math.floor(rand() * 2 ** 32));
  const value = (hi << 32n) | lo;
  const bits = BigInt(1 + Math.floor(rand() * 63));
  return value % (1n << bits);
}

function forAll(property: (stroops: bigint) => void, seed = 636) {
  const rand = mulberry32(seed);
  for (let i = 0; i < RUNS; i++) {
    const stroops = arbitraryStroops(rand);
    try {
      property(stroops);
    } catch (error) {
      throw new Error(`Property failed for stroops=${stroops} (seed ${seed}, run ${i}): ${error}`);
    }
  }
}

describe("stroop conversion properties", () => {
  it("stroops -> XLM string -> stroops is lossless across Int64", () => {
    forAll((stroops) => {
      expect(toStroops(fromStroops(stroops))).toBe(stroops);
      expect(toStroops(fromStroops(stroops, true))).toBe(stroops);
    });
  });

  it("agrees with parseAmountToStroops on every round trip", () => {
    forAll((stroops) => {
      expect(parseAmountToStroops(fromStroops(stroops))).toEqual({ ok: true, value: stroops });
    });
  });

  it("is exact above Number.MAX_SAFE_INTEGER stroops (no float path)", () => {
    const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    forAll((stroops) => {
      const value = stroops + unsafe > MAX_STROOPS ? stroops : stroops + unsafe;
      const xlm = fromStroops(value);
      expect(toStroops(xlm)).toBe(value);
      expect(formatXlm(value)).toBe(xlm);
      // A float path would collapse neighbouring stroop values.
      if (value < MAX_STROOPS) {
        expect(formatXlm(value + 1n)).not.toBe(formatXlm(value));
      }
    });
  });

  it("display truncation never exceeds the real amount", () => {
    forAll((stroops) => {
      for (let digits = 0; digits <= 7; digits++) {
        const shown = toStroops(formatXlm(stroops, { maxFractionDigits: digits }));
        expect(shown <= stroops).toBe(true);
        expect(stroops - shown < 10n ** BigInt(7 - digits)).toBe(true);
      }
    });
  });

  it("rejects precision that a transaction amount cannot carry", () => {
    expect(() => toStroops("1.00000001")).toThrow();
    expect(parseAmountToStroops("1.00000001").ok).toBe(false);
    expect(() => toStroops((MAX_STROOPS + 1n).toString())).toThrow();
  });
});
