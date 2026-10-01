import {
  Compass,
  Crown,
  Gem,
  Hammer,
  Leaf,
  Sparkles,
  Vault,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export interface ArchetypeStyle {
  color: string;
  gradient: string;
  icon: LucideIcon;
}

export interface ArchetypeConfig {
  style: ArchetypeStyle;
  description: string;
}

const DEFAULT_STYLE: ArchetypeStyle = {
  color: "#8AB4F8",
  gradient: "linear-gradient(135deg, #8AB4F8 0%, #4A6CF7 100%)",
  icon: Sparkles,
};

export const DEFAULT_ARCHETYPE_DESCRIPTION =
  "A unique on-chain journey that defies easy categorization — your Stellar activity writes its own story.";

export const ARCHETYPES: Record<string, ArchetypeConfig> = {
  "The Wizard": {
    style: {
      color: "#B794F6",
      gradient: "linear-gradient(135deg, #B794F6 0%, #6B46C1 100%)",
      icon: Wand2,
    },
    description:
      "Like Gandalf in Middle-earth, you wield DeFi magic with wisdom. The blockchain bends to your will.",
  },
  "The Explorer": {
    style: {
      color: "#4FACFE",
      gradient: "linear-gradient(135deg, #4FACFE 0%, #00F2FE 100%)",
      icon: Compass,
    },
    description:
      "You venture into uncharted territories, discovering new dApps and protocols. Adventure calls, and you answer.",
  },
  "The Architect": {
    style: {
      color: "#43E97B",
      gradient: "linear-gradient(135deg, #43E97B 0%, #38F9D7 100%)",
      icon: Hammer,
    },
    description:
      "Builder. Creator. You don't just use the network—you help construct it. Your Soroban contracts are your legacy.",
  },
  "The Patron": {
    style: {
      color: "#FF6B9D",
      gradient: "linear-gradient(135deg, #FF6B9D 0%, #C44569 100%)",
      icon: Crown,
    },
    description:
      "You hold the line. With significant holdings and patient conviction, you're the backbone of the ecosystem.",
  },
  "The Collector": {
    style: {
      color: "#FFD93D",
      gradient: "linear-gradient(135deg, #FFD93D 0%, #FF6B35 100%)",
      icon: Gem,
    },
    description:
      "Diversity is your strength. You've accumulated a treasure trove of assets across the network.",
  },
  "The Trader": {
    style: {
      color: "#00D4FF",
      gradient: "linear-gradient(135deg, #00D4FF 0%, #0099CC 100%)",
      icon: Sparkles,
    },
    description:
      "You live for the swap. Every price movement is an opportunity, and your reflexes are sharp.",
  },
  /** Yield Farmer: active on DEX with high swap/offer volume and LP positions */
  "The Yield Farmer": {
    style: {
      color: "#22C55E",
      gradient: "linear-gradient(135deg, #22C55E 0%, #15803D 100%)",
      icon: Leaf,
    },
    description:
      "You tend the liquidity pools like fertile fields. Every swap and every position is cultivated for the harvest.",
  },
  /** Hodler: long-term, low-activity wallet that prefers holding over trading */
  "The Hodler": {
    style: {
      color: "#EAB308",
      gradient: "linear-gradient(135deg, #EAB308 0%, #92400E 100%)",
      icon: Vault,
    },
    description:
      "Patience is your edge. While others chase every candle, you hold steady and let conviction do the work.",
  },
};

// Legacy style map for backward compatibility
export const ARCHETYPE_STYLES: Record<string, ArchetypeStyle> = Object.entries(ARCHETYPES).reduce(
  (acc, [key, config]) => {
    acc[key] = config.style;
    return acc;
  },
  {} as Record<string, ArchetypeStyle>
);

export function getArchetypeStyle(name: string): ArchetypeStyle {
  return ARCHETYPES[name]?.style ?? DEFAULT_STYLE;
}

export function getArchetypeDescription(name: string): string {
  return ARCHETYPES[name]?.description || DEFAULT_ARCHETYPE_DESCRIPTION;
}

export function archetypeImagePath(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, "-");
  return `/archetypes/${slug}.png`;
}

export function archetypeWebpPath(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, "-");
  return `/archetypes/${slug}.webp`;
}

export function archetypeOgImagePath(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, "-");
  return `/archetypes/og/${slug}.png`;
}

export function archetypeResponsivePath(
  name: string,
  size: 64 | 128 | 256,
  format: "png" | "webp" = "webp"
): string {
  const slug = name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, "-");
  return `/archetypes/responsive/${size}/${slug}.${format}`;
}

/**
 * Maps each archetype data key (used in API responses / wrapStore) to the
 * corresponding next-intl translation sub-key inside the `Persona.archetypes`
 * namespace.  This keeps archetype identification stable as a plain English
 * string while allowing the display name to be fully translated.
 *
 * Usage in a component:
 *   const t = useTranslations('Persona');
 *   const displayName = t(`archetypes.${ARCHETYPE_TRANSLATION_KEYS[archetypeKey] ?? 'theWizard'}`);
 */
export const ARCHETYPE_TRANSLATION_KEYS: Record<string, string> = {
  "The Wizard": "theWizard",
  "The Explorer": "theExplorer",
  "The Architect": "theArchitect",
  "The Patron": "thePatron",
  "The Collector": "theCollector",
  "The Trader": "theTrader",
  "The Yield Farmer": "theYieldFarmer",
  "The Hodler": "theHodler",
};
