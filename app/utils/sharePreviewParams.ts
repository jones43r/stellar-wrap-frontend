/**
 * Safe, public-only fields for share / OG preview URLs.
 * Never include wallet addresses, raw transactions, or other private activity.
 */

export interface SharePreviewState {
  username: string;
  transactions: number;
  persona: string;
  topVibe: string;
  vibePercentage: number;
  archetypeImage?: string;
}

export const SHARE_PREVIEW_DEFAULTS: SharePreviewState = {
  username: "StellarUser",
  transactions: 0,
  persona: "Network Pioneer",
  topVibe: "Steady",
  vibePercentage: 0,
};

const MAX_USERNAME_LEN = 40;
const MAX_PERSONA_LEN = 80;
const MAX_VIBE_LEN = 40;
const MAX_ARCHETYPE_PATH_LEN = 120;

const SAFE_TEXT = /^[\w\s.@#+\-/'(),!?&%]+$/u;
// Usernames are handles, federated names, or shortened addresses — no whitespace.
const SAFE_USERNAME = /^[\w.\-*@]+$/;

/** Personas the app can compute; anything else falls back to the default. */
export const KNOWN_PERSONAS = [
  "Network Pioneer",
  "Quiet Wallet",
  "Explorer",
  "The Explorer",
  "The Wizard",
  "The Hodler",
  "The Yield Farmer",
  "The Trader",
  "The Architect",
  "The Patron",
  "The DeFi Patron",
  "The Collector",
] as const;

/** Vibe labels the app can compute; anything else falls back to the default. */
export const KNOWN_VIBES = [
  "Steady",
  "Power User",
  "DeFi Sorcerer",
  "Art Curator",
  "Code Alchemist",
  "DeFi Degen",
] as const;
const SAFE_ARCHETYPE_PATH =
  /^\/archetypes\/(?:(?:og|responsive\/\d+)\/)?[\w-]+\.(png|jpg|jpeg|webp)$/i;

type SearchParamInput = URLSearchParams | Record<string, string | string[] | undefined>;

function readParam(input: SearchParamInput, key: string): string | undefined {
  if (input instanceof URLSearchParams) {
    return input.get(key) ?? undefined;
  }
  const raw = input[key];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function sanitizeText(value: string | undefined, maxLen: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, maxLen);
  if (!trimmed || !SAFE_TEXT.test(trimmed)) return undefined;
  return trimmed;
}

function sanitizeUsername(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Truncate rather than reject so a legitimate long username still renders.
  const trimmed = value.trim().slice(0, MAX_USERNAME_LEN);
  if (!trimmed || !SAFE_USERNAME.test(trimmed)) return undefined;
  return trimmed;
}

function matchKnown(
  value: string | undefined,
  allowed: readonly string[],
  maxLen: number
): string | undefined {
  const text = sanitizeText(value, maxLen)?.toLowerCase();
  if (!text) return undefined;
  return allowed.find((candidate) => candidate.toLowerCase() === text);
}

function parseBoundedInt(value: string | undefined, min: number, max: number): number | undefined {
  if (!value || !/^\d{1,12}$/.test(value.trim())) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return undefined;
  return parsed;
}

/**
 * Parse and validate share preview query params. Invalid fields fall back to defaults.
 */
export function parseSharePreviewParams(input: SearchParamInput): SharePreviewState {
  const username =
    sanitizeUsername(readParam(input, "username")) ?? SHARE_PREVIEW_DEFAULTS.username;
  const persona =
    matchKnown(readParam(input, "persona"), KNOWN_PERSONAS, MAX_PERSONA_LEN) ??
    SHARE_PREVIEW_DEFAULTS.persona;
  const topVibe =
    matchKnown(readParam(input, "topVibe"), KNOWN_VIBES, MAX_VIBE_LEN) ??
    SHARE_PREVIEW_DEFAULTS.topVibe;

  const transactions =
    parseBoundedInt(readParam(input, "transactions"), 0, 10_000_000) ??
    SHARE_PREVIEW_DEFAULTS.transactions;
  const vibePercentage =
    parseBoundedInt(readParam(input, "vibePercentage"), 0, 100) ??
    SHARE_PREVIEW_DEFAULTS.vibePercentage;

  const archetypeRaw = readParam(input, "archetypeImage")?.trim();
  const archetypeImage =
    archetypeRaw &&
    archetypeRaw.length <= MAX_ARCHETYPE_PATH_LEN &&
    SAFE_ARCHETYPE_PATH.test(archetypeRaw)
      ? archetypeRaw
      : undefined;

  return {
    username,
    transactions,
    persona,
    topVibe,
    vibePercentage,
    archetypeImage,
  };
}

export function buildSharePreviewSearchParams(preview: SharePreviewState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("username", preview.username);
  params.set("transactions", String(preview.transactions));
  params.set("persona", preview.persona);
  params.set("topVibe", preview.topVibe);
  params.set("vibePercentage", String(preview.vibePercentage));
  if (preview.archetypeImage) {
    params.set("archetypeImage", preview.archetypeImage);
  }
  return params;
}

export function buildPublicSharePath(preview: SharePreviewState, locale = "en"): string {
  const query = buildSharePreviewSearchParams(preview).toString();
  return `/${locale}/share?${query}`;
}

export function hasSharePreviewParams(input: SearchParamInput): boolean {
  const keys = [
    "username",
    "transactions",
    "persona",
    "topVibe",
    "vibePercentage",
    "archetypeImage",
  ];
  return keys.some((key) => {
    const value = readParam(input, key);
    return value !== undefined && value !== "";
  });
}
