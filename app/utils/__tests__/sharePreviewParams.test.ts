import { describe, it, expect } from "vitest";
import {
  parseSharePreviewParams,
  buildSharePreviewSearchParams,
  SHARE_PREVIEW_DEFAULTS,
} from "@/app/utils/sharePreviewParams";

describe("sharePreviewParams", () => {
  it("parses valid preview params", () => {
    const params = new URLSearchParams({
      username: "alice",
      transactions: "42",
      persona: "The Wizard",
      topVibe: "Power User",
      vibePercentage: "72",
      archetypeImage: "/archetypes/wizard.png",
    });

    expect(parseSharePreviewParams(params)).toEqual({
      username: "alice",
      transactions: 42,
      persona: "The Wizard",
      topVibe: "Power User",
      vibePercentage: 72,
      archetypeImage: "/archetypes/wizard.png",
    });
  });

  it("rejects malformed values and uses safe defaults", () => {
    const params = new URLSearchParams({
      username: "<script>",
      transactions: "not-a-number",
      vibePercentage: "500",
      archetypeImage: "https://evil.example/logo.png",
    });

    expect(parseSharePreviewParams(params)).toEqual({
      username: SHARE_PREVIEW_DEFAULTS.username,
      transactions: SHARE_PREVIEW_DEFAULTS.transactions,
      persona: SHARE_PREVIEW_DEFAULTS.persona,
      topVibe: SHARE_PREVIEW_DEFAULTS.topVibe,
      vibePercentage: SHARE_PREVIEW_DEFAULTS.vibePercentage,
      archetypeImage: undefined,
    });
  });

  it("round-trips through buildSharePreviewSearchParams", () => {
    const preview = {
      username: "bob",
      transactions: 10,
      persona: "Explorer",
      topVibe: "Steady",
      vibePercentage: 33,
    };
    const parsed = parseSharePreviewParams(buildSharePreviewSearchParams(preview));
    expect(parsed).toEqual({ ...preview, archetypeImage: undefined });
  });

  describe("hostile input", () => {
    it("rejects free-text persona and topVibe not in the known sets", () => {
      const parsed = parseSharePreviewParams(
        new URLSearchParams({
          persona: "Verify your wallet at evil.example",
          topVibe: "Send XLM to claim reward",
        }),
      );
      expect(parsed.persona).toBe(SHARE_PREVIEW_DEFAULTS.persona);
      expect(parsed.topVibe).toBe(SHARE_PREVIEW_DEFAULTS.topVibe);
    });

    it("normalizes known persona and vibe case-insensitively", () => {
      const parsed = parseSharePreviewParams(
        new URLSearchParams({ persona: "the yield farmer", topVibe: "defi sorcerer" }),
      );
      expect(parsed.persona).toBe("The Yield Farmer");
      expect(parsed.topVibe).toBe("DeFi Sorcerer");
    });

    it("truncates overlong usernames instead of rejecting them", () => {
      const parsed = parseSharePreviewParams(
        new URLSearchParams({ username: "a".repeat(200) }),
      );
      expect(parsed.username).toBe("a".repeat(40));
    });

    it("rejects usernames containing whitespace or markup", () => {
      for (const username of ["Official Stellar Support", "<img src=x>", "a\nb"]) {
        expect(parseSharePreviewParams(new URLSearchParams({ username })).username).toBe(
          SHARE_PREVIEW_DEFAULTS.username,
        );
      }
    });

    it("parses numeric params strictly", () => {
      for (const value of ["12abc", "-5", "1e6", "0x10", " "]) {
        const parsed = parseSharePreviewParams(
          new URLSearchParams({ transactions: value, vibePercentage: value }),
        );
        expect(parsed.transactions).toBe(SHARE_PREVIEW_DEFAULTS.transactions);
        expect(parsed.vibePercentage).toBe(SHARE_PREVIEW_DEFAULTS.vibePercentage);
      }
    });

    it("rejects path traversal in archetypeImage", () => {
      const parsed = parseSharePreviewParams(
        new URLSearchParams({ archetypeImage: "/archetypes/../api/secret.png" }),
      );
      expect(parsed.archetypeImage).toBeUndefined();
    });
  });
});
