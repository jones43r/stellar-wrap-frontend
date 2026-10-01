import {
  toStroops,
  fromStroops,
  isValidStellarAmount,
  formatStellarAmount,
  STROOPS_PER_UNIT,
  MAX_STROOPS,
  MAX_STELLAR_LIMIT,
} from "../stellarAmount";

describe("stellarAmount Utilities", () => {
  describe("toStroops", () => {
    it("converts 1 XLM to 10,000,000 Stroops", () => {
      expect(toStroops("1")).toBe(10_000_000n);
      expect(toStroops(1)).toBe(10_000_000n);
    });

    it("handles 7 decimal precision correctly without floating point loss", () => {
      expect(toStroops("0.0000001")).toBe(1n);
      expect(toStroops("123.4567890")).toBe(1_234_567_890n);
      expect(toStroops("0.1234567")).toBe(1_234_567n);
    });

    it("handles MAX_STELLAR_LIMIT correctly", () => {
      expect(toStroops(MAX_STELLAR_LIMIT)).toBe(MAX_STROOPS);
    });

    it("throws when decimals exceed 7 places", () => {
      expect(() => toStroops("1.12345678")).toThrow(/exceeds maximum 7 decimal places/);
    });

    it("throws for negative amounts", () => {
      expect(() => toStroops("-5.0")).toThrow(/Negative amounts are not allowed/);
    });

    it("throws for non-numeric input", () => {
      expect(() => toStroops("abc")).toThrow(/Invalid numeric characters/);
      expect(() => toStroops("1.2.3")).toThrow(/Invalid amount format/);
    });

    it("parses edge-case stroop inputs without precision loss", () => {
      expect(toStroops("0")).toBe(0n);
      expect(toStroops("0.0")).toBe(0n);
      expect(toStroops("0.0000000")).toBe(0n);
      expect(toStroops(".5")).toBe(5_000_000n);
      expect(toStroops("0.5")).toBe(5_000_000n);
      expect(toStroops("1.")).toBe(10_000_000n);
      expect(toStroops("0001.0000000")).toBe(10_000_000n);
      expect(toStroops("0.0000001")).toBe(1n);
      expect(toStroops("922337203685.4775807")).toBe(MAX_STROOPS);
    });

    it("rejects amounts that overflow the i64 stroop range", () => {
      expect(() => toStroops("922337203685.4775808")).toThrow();
      expect(() => toStroops("922337203686")).toThrow();
    });

    it("rejects malformed numeric strings", () => {
      expect(() => toStroops("")).toThrow();
      expect(() => toStroops(" ")).toThrow();
      expect(() => toStroops("1,000")).toThrow();
      expect(() => toStroops("1e7")).toThrow();
      expect(() => toStroops("+1")).toThrow();
    });
  });

  describe("fromStroops", () => {
    it("converts integer Stroops to full 7-decimal string", () => {
      expect(fromStroops(10_000_000n)).toBe("1.0000000");
      expect(fromStroops(1n)).toBe("0.0000001");
      expect(fromStroops(1_234_567_890n)).toBe("123.4567890");
    });

    it("trims trailing zeroes when requested", () => {
      expect(fromStroops(10_000_000n, true)).toBe("1");
      expect(fromStroops(10_500_000n, true)).toBe("1.05");
      expect(fromStroops(1n, true)).toBe("0.0000001");
    });

    it("converts MAX_STROOPS to MAX_STELLAR_LIMIT", () => {
      expect(fromStroops(MAX_STROOPS)).toBe(MAX_STELLAR_LIMIT);
    });

    it("round-trips edge-case stroop values exactly", () => {
      expect(fromStroops(0n)).toBe("0.0000000");
      expect(fromStroops(0n, true)).toBe("0");
      expect(fromStroops(5_000_000n)).toBe("0.5000000");
      expect(fromStroops(5_000_000n, true)).toBe("0.5");
      expect(fromStroops(MAX_STROOPS)).toBe(MAX_STELLAR_LIMIT);
      expect(toStroops(fromStroops(MAX_STROOPS))).toBe(MAX_STROOPS);
    });
  });

  describe("isValidStellarAmount", () => {
    it("returns true for valid decimal strings with <= 7 decimals", () => {
      expect(isValidStellarAmount("100")).toBe(true);
      expect(isValidStellarAmount("0.5")).toBe(true);
      expect(isValidStellarAmount("0.0000001")).toBe(true);
      expect(isValidStellarAmount("922337203685.4775807")).toBe(true);
    });

    it("returns false for invalid strings", () => {
      expect(isValidStellarAmount("")).toBe(false);
      expect(isValidStellarAmount("0")).toBe(false); // zero stroops
      expect(isValidStellarAmount("-1")).toBe(false);
      expect(isValidStellarAmount("1.12345678")).toBe(false); // 8 decimals
      expect(isValidStellarAmount("abc")).toBe(false);
      expect(isValidStellarAmount("999999999999999999.0")).toBe(false); // exceeds i64
    });

    it("rejects edge-case malformed and boundary inputs", () => {
      expect(isValidStellarAmount(" ")).toBe(false);
      expect(isValidStellarAmount("1,000")).toBe(false);
      expect(isValidStellarAmount("1e7")).toBe(false);
      expect(isValidStellarAmount("+1")).toBe(false);
      expect(isValidStellarAmount("922337203685.4775808")).toBe(false);
      expect(isValidStellarAmount("0.0000000")).toBe(false);
    });
  });

  describe("formatStellarAmount", () => {
    it("formats amounts cleanly for user display", () => {
      expect(formatStellarAmount("100.0000000")).toBe("100");
      expect(formatStellarAmount("50.1230000")).toBe("50.123");
      expect(formatStellarAmount("12.3456789", 4)).toBe("12.3456");
      expect(formatStellarAmount(undefined)).toBe("0");
    });

    it("handles edge-case display inputs", () => {
      expect(formatStellarAmount("0.0000000")).toBe("0");
      expect(formatStellarAmount("0.0000001")).toBe("0.0000001");
      expect(formatStellarAmount("1.0000000", 0)).toBe("1");
      expect(formatStellarAmount(null as unknown as string)).toBe("0");
    });
  });
});
