/**
 * Resilient share-image flow.
 *
 * Client-side export (html2canvas + canvas reads) fails in ordinary conditions:
 * Safari private mode blocks canvas reads, a tainted canvas throws, and the Web
 * Share API is missing on most desktops. Every path here resolves to a working
 * alternative, in order: native share → download → the server-rendered OG
 * image link, which does not depend on client capabilities at all.
 */

import { buildSharePreviewSearchParams, type SharePreviewState } from "./sharePreviewParams";

export type ShareFallbackOutcome =
  | { kind: "shared" }
  | { kind: "cancelled" }
  | { kind: "downloaded" }
  | { kind: "og-link-copied"; url: string }
  | { kind: "og-link"; url: string };

type ShareNavigator = Pick<Navigator, "share" | "canShare" | "clipboard">;

export interface ShareWithFallbackOptions {
  /** Renders the card to a PNG. May throw when canvas reads are blocked. */
  render: () => Promise<{ blob: Blob; filename: string }>;
  /** Saves the rendered image. May throw (e.g. downloads blocked). */
  download: (blob: Blob, filename: string) => void;
  preview: SharePreviewState;
  /** Try the native share sheet before downloading. */
  preferNativeShare?: boolean;
  title?: string;
  text?: string;
  nav?: ShareNavigator;
  origin?: string;
}

export function buildOgImageUrl(preview: SharePreviewState, origin: string): string {
  return `${origin}/api/og?${buildSharePreviewSearchParams(preview).toString()}`;
}

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

async function tryNativeShareFile(
  nav: ShareNavigator | undefined,
  file: File,
  title?: string,
  text?: string,
): Promise<"shared" | "cancelled" | "unavailable"> {
  if (typeof nav?.share !== "function") return "unavailable";
  const data: ShareData = { files: [file], title, text };
  if (typeof nav.canShare === "function" && !nav.canShare(data)) return "unavailable";
  try {
    await nav.share(data);
    return "shared";
  } catch (error) {
    return isAbort(error) ? "cancelled" : "unavailable";
  }
}

/** Never throws: always resolves to an outcome the UI can act on. */
export async function shareImageWithFallback(
  options: ShareWithFallbackOptions,
): Promise<ShareFallbackOutcome> {
  const nav = options.nav ?? (typeof navigator === "undefined" ? undefined : navigator);
  const origin =
    options.origin ?? (typeof window === "undefined" ? "" : window.location.origin);

  let rendered: { blob: Blob; filename: string } | null = null;
  try {
    rendered = await options.render();
  } catch {
    rendered = null;
  }

  if (rendered) {
    if (options.preferNativeShare && typeof File !== "undefined") {
      const file = new File([rendered.blob], rendered.filename, { type: "image/png" });
      const result = await tryNativeShareFile(nav, file, options.title, options.text);
      if (result !== "unavailable") return { kind: result };
    }
    try {
      options.download(rendered.blob, rendered.filename);
      return { kind: "downloaded" };
    } catch {
      // fall through to the OG image
    }
  }

  const url = buildOgImageUrl(options.preview, origin);
  try {
    if (!nav?.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await nav.clipboard.writeText(url);
    return { kind: "og-link-copied", url };
  } catch {
    return { kind: "og-link", url };
  }
}
