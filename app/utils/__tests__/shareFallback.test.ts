import { shareImageWithFallback, buildOgImageUrl } from "@/app/utils/shareFallback";

const preview = {
  username: "alice",
  transactions: 42,
  persona: "The Wizard",
  topVibe: "Steady",
  vibePercentage: 60,
};
const origin = "https://wrap.example";
const blob = new Blob(["png"], { type: "image/png" });
const render = () => Promise.resolve({ blob, filename: "card.png" });
const canvasBlocked = () =>
  Promise.reject(new DOMException("The operation is insecure.", "SecurityError"));

function clipboard(ok = true) {
  return {
    writeText: ok ? jest.fn().mockResolvedValue(undefined) : jest.fn().mockRejectedValue(new Error("denied")),
  } as unknown as Clipboard;
}

describe("shareImageWithFallback", () => {
  it("shares natively when the Web Share API accepts files", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    const download = jest.fn();
    const outcome = await shareImageWithFallback({
      render,
      download,
      preview,
      origin,
      preferNativeShare: true,
      nav: { share, canShare: () => true, clipboard: clipboard() },
    });
    expect(outcome).toEqual({ kind: "shared" });
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads when the Web Share API is absent", async () => {
    const download = jest.fn();
    const outcome = await shareImageWithFallback({
      render,
      download,
      preview,
      origin,
      preferNativeShare: true,
      nav: { clipboard: clipboard() } as never,
    });
    expect(outcome).toEqual({ kind: "downloaded" });
    expect(download).toHaveBeenCalledWith(blob, "card.png");
  });

  it("treats a dismissed share sheet as cancelled, not a failure", async () => {
    const share = jest.fn().mockRejectedValue(new DOMException("", "AbortError"));
    const download = jest.fn();
    const outcome = await shareImageWithFallback({
      render,
      download,
      preview,
      origin,
      preferNativeShare: true,
      nav: { share, canShare: () => true, clipboard: clipboard() },
    });
    expect(outcome).toEqual({ kind: "cancelled" });
    expect(download).not.toHaveBeenCalled();
  });

  it("copies the OG image link when canvas reads are blocked", async () => {
    const cb = clipboard();
    const download = jest.fn();
    const outcome = await shareImageWithFallback({
      render: canvasBlocked,
      download,
      preview,
      origin,
      nav: { clipboard: cb } as never,
    });
    const url = buildOgImageUrl(preview, origin);
    expect(outcome).toEqual({ kind: "og-link-copied", url });
    expect(cb.writeText).toHaveBeenCalledWith(url);
    expect(download).not.toHaveBeenCalled();
    expect(url.startsWith(`${origin}/api/og?`)).toBe(true);
  });

  it("falls back to the OG image when the download itself throws", async () => {
    const outcome = await shareImageWithFallback({
      render,
      download: () => {
        throw new Error("blocked");
      },
      preview,
      origin,
      nav: { clipboard: clipboard() } as never,
    });
    expect(outcome.kind).toBe("og-link-copied");
  });

  it("returns the OG link to open when canvas and clipboard are both blocked", async () => {
    const outcome = await shareImageWithFallback({
      render: canvasBlocked,
      download: jest.fn(),
      preview,
      origin,
      nav: { clipboard: clipboard(false) } as never,
    });
    expect(outcome).toEqual({ kind: "og-link", url: buildOgImageUrl(preview, origin) });
  });
});
