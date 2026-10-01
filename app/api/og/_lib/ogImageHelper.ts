/**
 * Module-level in-memory cache for pre-sized archetype OG assets.
 * Caches base64 data URLs across warm edge/serverless invocations to avoid redundant RTT and CPU cycles.
 */
const ogImageCache = new Map<string, string>();

/**
 * Resolves and fetches a pre-sized archetype image for OG routes.
 * Prefers the pre-sized 200x200 asset (/archetypes/og/${slug}.png) rather than fetching a large source image,
 * falling back to the standard image path if necessary.
 */
export async function fetchOgArchetypeImage(
  baseUrl: string,
  persona: string,
  explicitPath?: string
): Promise<string | null> {
  const slug = persona
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, "-");

  let preferredPath = `/archetypes/og/${slug}.png`;
  let fallbackPath = `/archetypes/${slug}.png`;

  if (explicitPath) {
    if (explicitPath.includes("/og/")) {
      preferredPath = explicitPath;
    } else {
      const fileName = explicitPath.split("/").pop();
      preferredPath = `/archetypes/og/${fileName}`;
      fallbackPath = explicitPath;
    }
  }

  const cached =
    ogImageCache.get(preferredPath) ?? (fallbackPath ? ogImageCache.get(fallbackPath) : undefined);
  if (cached) return cached;

  const candidatePaths =
    preferredPath === fallbackPath ? [preferredPath] : [preferredPath, fallbackPath];

  for (const path of candidatePaths) {
    try {
      const imgRes = await fetch(`${baseUrl}${path}`);
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        const mime = imgRes.headers.get("content-type") || "image/png";
        const base64String = btoa(
          new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        const dataUri = `data:${mime};base64,${base64String}`;
        ogImageCache.set(path, dataUri);
        return dataUri;
      }
    } catch {
      // Continue to next candidate
    }
  }

  return null;
}
