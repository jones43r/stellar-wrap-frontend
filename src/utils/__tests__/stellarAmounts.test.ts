import {
  STROOPS_PER_XLM,
  XLM_MAX_PRECISION,
  MAX_TOTAL_STROOPS,
  parseAmountToStroops,
  xlmToStroops,
  stroopsToXlm,
  formatXlm,
} from "../stellarAmount";

describe("parseAmountToStroops", () => {
  it("parses whole XLM to stroops", () => {
    const result = parseAmountToStroops("1");
    expect(result).toEqual({ ok: true, value: BigInt(STROOPS_PER_XLM) });
  });

  it("parses 7-decimal precision correctly", () => {
    const result = parseAmountToStroops("0.0000001");
    expect(result).toEqual({ ok: true, value: 1n });
  });

  it("parses mixed whole + fractional amounts", () => {
    const result = parseAmountToStroops("42.5");
    expect(result).toEqual({ ok: true, value: BigInt(42 * STROOPS_PER_XLM + 5_000_000) });
  });

  it("trims surrounding whitespace", () => {
    const result = parseAmountToStroops("  2  ");
    expect(result).toEqual({ ok: true, value: BigInt(2 * STROOPS_PER_XLM) });
  });

  it("rejects more than 7 decimal places", () => {
    expect(parseAmountToStroops("1.12345678")).toEqual({
      ok: false,
      reason: "too-many-decimals",
    });
  });

  it("rejects non-numeric input", () => {
    expect(parseAmountToStroops("abc")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAmountToStroops("")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAmountToStroops("1e3")).toEqual({ ok: false, reason: "invalid" });
    expect(parseAmountToStroops("NaN")).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects negative input", () => {
    expect(xlmToStroops(-1)).toEqual({ ok: false, reason: "negative" });
  });

  it("rejects values beyond Int64 stroops range", () => {
    const bogus = (Number(MAX_TOTAL_STROOPS) / STROOPS_PER_XLM + 1).toString();
    expect(parseAmountToStroops(bogus)).toEqual({ ok: false, reason: "overflow" });
  });
});

describe("xlmToStroops", () => {
  it("converts a number amount honoring 7-digit precision", () => {
    expect(xlmToStroops(0.1)).toEqual({
      ok: true,
      value: BigInt(Math.round(0.1 * STROOPS_PER_XLM)),
    });
  });

  it("rejects non-finite numbers", () => {
    expect(xlmToStroops(Number.NaN)).toEqual({ ok: false, reason: "invalid" });
    expect(xlmToStroops(Number.POSITIVE_INFINITY)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("stroopsToXlm", () => {
  it("converts a bigint to an XLM number", () => {
    expect(stroopsToXlm(BigInt(STROOPS_PER_XLM))).toBe(1);
    expect(stroopsToXlm(1500000n)).toBe(0.15);
  });

  it("converts integer strings and numbers verbatim", () => {
    expect(stroopsToXlm("10000000")).toBe(1);
    expect(stroopsToXlm(10000000)).toBe(1);
  });

  it("throws on negative stroops", () => {
    expect(() => stroopsToXlm(-1n)).toThrow(RangeError);
  });
});

describe("formatXlm", () => {
  it("formats with 7 decimal places by default", () => {
    expect(formatXlm(10000000n)).toBe("1.0000000");
    expect(formatXlm(1500000n)).toBe("0.1500000");
  });

  it("respects maxFractionDigits with clamping", () => {
    expect(formatXlm(10000000n, { maxFractionDigits: 2 })).toBe("1.00");
    expect(formatXlm(10000000n, { maxFractionDigits: 0 })).toBe("1");
    expect(
      formatXlm(10000000n, { maxFractionDigits: XLM_MAX_PRECISION + 3 }),
    ).toBe("1.0000000");
  });

  it("never exceeds 7 decimal precision", () => {
    expect(formatXlm(1n)).toBe("0.0000001");
  });
});
