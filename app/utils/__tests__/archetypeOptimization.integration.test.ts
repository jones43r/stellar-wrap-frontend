import fs from "node:fs";
import path from "node:path";
import {
  archetypeImagePath,
  archetypeWebpPath,
  archetypeOgImagePath,
  archetypeResponsivePath,
} from "@/src/data/archetypeConfig";
import { fetchOgArchetypeImage } from "@/app/api/og/_lib/ogImageHelper";

describe("Archetype Image Optimization & Budget", () => {
  const archetypesDir = path.join(process.cwd(), "public/archetypes");
  const ogDir = path.join(archetypesDir, "og");
  const responsiveDir = path.join(archetypesDir, "responsive");

  const knownSlugs = ["wizard", "explorer", "hodler", "yield-farmer"];

  it("generates modern WebP and optimized PNG files for all core archetypes", () => {
    for (const slug of knownSlugs) {
      const pngPath = path.join(archetypesDir, `${slug}.png`);
      const webpPath = path.join(archetypesDir, `${slug}.webp`);

      expect(fs.existsSync(pngPath)).toBe(true);
      expect(fs.existsSync(webpPath)).toBe(true);
    }
  });

  it("generates pre-sized OG assets in public/archetypes/og", () => {
    expect(fs.existsSync(ogDir)).toBe(true);
    for (const slug of knownSlugs) {
      const ogPath = path.join(ogDir, `${slug}.png`);
      expect(fs.existsSync(ogPath)).toBe(true);

      const size = fs.statSync(ogPath).size;
      // Pre-sized OG asset must be compact (under 35 KB)
      expect(size).toBeLessThan(35 * 1024);
    }
  });

  it("generates responsive sizes in public/archetypes/responsive", () => {
    for (const size of [64, 128, 256]) {
      const sizeDir = path.join(responsiveDir, String(size));
      expect(fs.existsSync(sizeDir)).toBe(true);

      for (const slug of knownSlugs) {
        expect(fs.existsSync(path.join(sizeDir, `${slug}.webp`))).toBe(true);
        expect(fs.existsSync(path.join(sizeDir, `${slug}.png`))).toBe(true);
      }
    }
  });

  it("enforces single archetype image size budget (<= 150 KB)", () => {
    const MAX_SINGLE_BYTES = 150 * 1024;
    const files = fs.readdirSync(archetypesDir, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile() || !file.name.match(/\.(png|webp)$/i)) continue;
      const size = fs.statSync(path.join(archetypesDir, file.name)).size;
      expect(size).toBeLessThanOrEqual(MAX_SINGLE_BYTES);
    }
  });

  it("enforces total archetype images size budget (<= 450 KB)", () => {
    const TOTAL_BUDGET_BYTES = 450 * 1024;
    const files = fs.readdirSync(archetypesDir, { withFileTypes: true });

    let total = 0;
    for (const file of files) {
      if (!file.isFile() || !file.name.match(/\.(png|webp)$/i)) continue;
      total += fs.statSync(path.join(archetypesDir, file.name)).size;
    }

    expect(total).toBeLessThanOrEqual(TOTAL_BUDGET_BYTES);
  });

  describe("Path Helpers", () => {
    it("returns correct paths for archetype assets", () => {
      expect(archetypeImagePath("The Wizard")).toBe("/archetypes/wizard.png");
      expect(archetypeWebpPath("The Wizard")).toBe("/archetypes/wizard.webp");
      expect(archetypeOgImagePath("The Wizard")).toBe("/archetypes/og/wizard.png");
      expect(archetypeResponsivePath("The Wizard", 64, "webp")).toBe(
        "/archetypes/responsive/64/wizard.webp"
      );
      expect(archetypeResponsivePath("The Explorer", 128, "png")).toBe(
        "/archetypes/responsive/128/explorer.png"
      );
    });
  });

  describe("fetchOgArchetypeImage", () => {
    it("fetches and caches image data correctly", async () => {
      const mockBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === "content-type" ? "image/png" : null),
        },
        arrayBuffer: async () => mockBuffer,
      }) as unknown as typeof fetch;

      try {
        const result1 = await fetchOgArchetypeImage("https://example.com", "The Wizard");
        expect(result1).toMatch(/^data:image\/png;base64,/);

        // Second call should hit the in-memory cache without refetching
        const result2 = await fetchOgArchetypeImage("https://example.com", "The Wizard");
        expect(result2).toBe(result1);
        expect(global.fetch).toHaveBeenCalledTimes(1);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("returns null gracefully when image is not found", async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }) as unknown as typeof fetch;

      try {
        const result = await fetchOgArchetypeImage("https://example.com", "Nonexistent Persona");
        expect(result).toBeNull();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("parseSharePreviewParams archetypeImage validation", () => {
    it("accepts valid archetype paths including og and responsive paths", async () => {
      const { parseSharePreviewParams } = await import("@/app/utils/sharePreviewParams");

      const params1 = new URLSearchParams("archetypeImage=/archetypes/wizard.png");
      expect(parseSharePreviewParams(params1).archetypeImage).toBe("/archetypes/wizard.png");

      const params2 = new URLSearchParams("archetypeImage=/archetypes/og/wizard.png");
      expect(parseSharePreviewParams(params2).archetypeImage).toBe("/archetypes/og/wizard.png");

      const params3 = new URLSearchParams("archetypeImage=/archetypes/responsive/64/wizard.webp");
      expect(parseSharePreviewParams(params3).archetypeImage).toBe(
        "/archetypes/responsive/64/wizard.webp"
      );
    });

    it("rejects malicious or out-of-scope archetype paths", async () => {
      const { parseSharePreviewParams } = await import("@/app/utils/sharePreviewParams");

      const malicious = [
        "https://malicious.com/image.png",
        "/archetypes/../secret.png",
        "/images/avatar.png",
        "/archetypes/invalid.exe",
      ];

      for (const badPath of malicious) {
        const params = new URLSearchParams(`archetypeImage=${encodeURIComponent(badPath)}`);
        expect(parseSharePreviewParams(params).archetypeImage).toBeUndefined();
      }
    });
  });
});
