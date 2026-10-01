"use client";

import React, { JSX, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { Home, Share2, ChevronRight, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { readStreamableValue } from "ai/rsc";
import {
  getArchetypeDescription,
  archetypeImagePath,
  ARCHETYPE_TRANSLATION_KEYS,
} from "@/src/data/archetypeConfig";
import { useReducedMotion, reducedMotionTransition } from "@/app/hooks/useReducedMotion";
import { isZeroActivityResult } from "@/app/utils/zeroActivity";
import { ZeroActivityEmptyState } from "@/app/components/ZeroActivityEmptyState";
import { getStellarExpertAccountUrl } from "@/app/utils/stellarExpert";
import { useWrapStore } from "@/app/store/wrapStore";
import { useNotificationStore } from "@/app/store/notificationStore";
import { useSound } from "@/app/hooks/useSound";
import { SOUND_NAMES } from "@/app/utils/soundManager";
import { ProgressIndicator } from "@/app/components/ProgressIndicator";
import { MuteToggle } from "@/app/components/MuteToggle";
import { NotificationPrompt } from "@/app/components/NotificationPrompt";
import { generatePersonaDescription } from "@/app/actions/generate-persona";
import { AssetList } from "@/app/components/AssetList";
import { CsvExportButton } from "@/app/components/CsvExportButton";

const PersonaEvolutionTimeline = lazy(() =>
  import("@/app/components/PersonaEvolutionTimeline").then((m) => ({
    default: m.PersonaEvolutionTimeline,
  }))
);

const PersonaRarityChart = lazy(() =>
  import("@/app/components/PersonaRarityChart").then((m) => ({
    default: m.PersonaRarityChart,
  }))
);

// Removed theme system - using standard CSS variables from globals.css
const useConfetti = (color?: string, enabled = true) => {
  return async () => {
    if (!enabled) return;
    // canvas-confetti (~40 KB) is loaded on demand — only when the card reveal
    // animation fires — so it never enters the initial landing-page bundle.
    const confetti = (await import("canvas-confetti")).default;

    const end = Date.now() + 1200;
    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: [color ?? "var(--color-theme-primary)", "#ffffff"],
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: [color ?? "var(--color-theme-primary)", "#ffffff"],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  };
};

type GlowingStarProps = {
  className?: string;
  delay?: number;
  reducedMotion?: boolean;
};
const GlowingStar: React.FC<GlowingStarProps> = ({
  className = "",
  delay = 0,
  reducedMotion = false,
}) => (
  <motion.div
    initial={{ opacity: 0.2, scale: 0.8 }}
    animate={
      reducedMotion
        ? { opacity: 0.7, scale: 1 }
        : {
            opacity: [0.4, 1, 0.4],
            scale: [0.8, 1.2, 0.8],
            boxShadow: [
              "0 0 5px var(--accent)",
              "0 0 15px var(--accent-light)",
              "0 0 5px var(--accent)",
            ],
          }
    }
    transition={reducedMotionTransition(reducedMotion, {
      duration: 3,
      repeat: Infinity,
      delay,
    })}
    className={`absolute h-1.5 w-1.5 rounded-full ${className}`}
    style={{ backgroundColor: "var(--color-theme-primary)" }}
  />
);

const useTypewriter = (text: string, speed = 30, startDelay = 0) => {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    // 1. Reset text immediately when text source changes
    setDisplayedText("");

    let i = 0;
    let timer: NodeJS.Timeout;

    const startTimeout = setTimeout(() => {
      timer = setInterval(() => {
        // Use functional update to ensure we aren't using stale 'i'
        setDisplayedText(text.slice(0, i + 1));
        i++;

        if (i >= text.length) {
          clearInterval(timer);
        }
      }, speed);
    }, startDelay);

    // 2. IMPORTANT: Cleanup function clears BOTH timeout and interval
    // This prevents multiple "ghost" typewriters from misspelling words
    return () => {
      clearTimeout(startTimeout);
      if (timer) clearInterval(timer);
    };
  }, [text, speed, startDelay]);

  return displayedText;
};

import {
  XIcon,
  WhatsAppIcon,
  FacebookIcon,
  LinkedInIcon,
  TelegramIcon,
} from "@/app/components/SocialIcons";

const SocialIcons = {
  X: XIcon,
  WhatsApp: WhatsAppIcon,
  Facebook: FacebookIcon,
  LinkedIn: LinkedInIcon,
  Telegram: TelegramIcon,
};

export default function ArchetypeReveal(): JSX.Element {
  const controls: ReturnType<typeof useAnimation> = useAnimation();
  const prefersReducedMotion = useReducedMotion();
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [streamedDescription, setStreamedDescription] = useState<string>("");
  const [showTooltip, setShowTooltip] = useState<boolean>(false);
  const { playSound } = useSound();

  // i18n
  const t = useTranslations("Persona");
  const locale = useLocale();

  // Menu states
  const [shareOpen, setShareOpen] = useState<boolean>(false); // Share menu

  // Refs
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const { result, address, network } = useWrapStore();
  const stellarExpertUrl = getStellarExpertAccountUrl(address, network);
  const showZeroActivity = isZeroActivityResult(result);
  const notificationStore = useNotificationStore();
  const [showNotifPrompt, setShowNotifPrompt] = useState<boolean>(true);
  const archetypeKey = result?.persona || "The Wizard";
  // Translate the archetype display name — falls back to the raw key if not found
  const archetypeTranslationKey = ARCHETYPE_TRANSLATION_KEYS[archetypeKey] ?? "theWizard";
  const translatedArchetypeName = t(
    `archetypes.${archetypeTranslationKey}` as Parameters<typeof t>[0]
  );

  // Suppress prompt if dismissed this session
  useEffect(() => {
    if (sessionStorage.getItem("notif-prompt-dismissed")) {
      setShowNotifPrompt(false);
    }
  }, []);

  // Use streamed description if available, otherwise fall back to stored or default
  const data = {
    description:
      streamedDescription || result?.personaDescription || getArchetypeDescription(archetypeKey),
  };

  const displayedDescription = useTypewriter(data.description, 25, 2200);

  // Generate persona description on mount if not already streamed
  useEffect(() => {
    let cancelled = false;

    const generatePersona = async () => {
      if (streamedDescription || !result) return;

      try {
        const metrics = {
          username: result.username,
          topDapp: result.dapps?.[0]?.name,
          transactionCount: result.totalTransactions,
          favoriteChain: "Stellar", // You can extract this from result if available
          percentile: result.percentile,
          vibes: result.vibes,
          totalDapps: result.dapps?.length,
        };

        const response = await generatePersonaDescription(metrics, locale);

        let fullText = "";
        for await (const chunk of readStreamableValue(response)) {
          if (cancelled) break;
          if (chunk) {
            fullText += chunk;
            setStreamedDescription(fullText);
          }
        }
      } catch (error) {
        if (cancelled) return;
        log.error("Failed to generate persona:", error);
        // Fall back to existing description
        setStreamedDescription(result?.personaDescription || data.description);
      }
    };

    generatePersona();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omits `streamedDescription` and stable setters; re-running on those would cause an infinite loop
  }, [result]);

  const handleShareKeyDown = (platform: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleShare(platform);
    }
  };

  const toggleShareKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setShareOpen(!shareOpen);
    }
    if (e.key === "Escape" && shareOpen) {
      setShareOpen(false);
    }
  };

  // click-outside to close share menu and tooltip
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      // Close Share Menu
      if (
        shareOpen &&
        !shareMenuRef.current?.contains(target) &&
        !shareBtnRef.current?.contains(target)
      ) {
        setShareOpen(false);
      }

      // Close Tooltip
      if (
        showTooltip &&
        !tooltipRef.current?.contains(target) &&
        !cardRef.current?.contains(target)
      ) {
        setShowTooltip(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && shareOpen) {
        setShareOpen(false);
      }
      if (e.key === "Escape" && showTooltip) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [shareOpen, showTooltip]);

  const triggerConfetti = useConfetti(undefined, !prefersReducedMotion);

  const runRevealAnimation = useCallback(async () => {
    setIsFlipped(false);
    await controls.start({
      rotateY: 0,
      transition: { duration: 0 },
    });

    await controls.start({
      y: 0,
      scale: 1,
      opacity: 1,
      transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.8, type: "spring" },
    });

    playSound(SOUND_NAMES.CARD_FLIP);

    if (!prefersReducedMotion) {
      await controls.start({
        x: [0, -4, 4, -4, 4, 0],
        rotateZ: [0, -1, 1, -1, 1, 0],
        transition: { duration: 0.4 },
      });
    }

    setIsFlipped(true);
    await triggerConfetti();

    await controls.start({
      rotateY: 180,
      transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.8, ease: "easeInOut" },
    });
  }, [controls, playSound, prefersReducedMotion, triggerConfetti]);

  useEffect(() => {
    runRevealAnimation();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once on mount; runRevealAnimation is stable via useCallback
  }, []);

  const handleCardTap = () => {
    void runRevealAnimation();
  };

  // --- Share Functionality ---
  const handleShare = (platform: string) => {
    const url = window.location.href;
    const text = `I got ${translatedArchetypeName} in the Archetype Reveal! ${data.description}`;
    let shareUrl = "";

    switch (platform) {
      case "x":
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        break;
      case "whatsapp":
        shareUrl = `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`;
        break;
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      case "linkedin":
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        break;
      case "telegram":
        shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        break;
    }

    if (shareUrl) {
      window.open(shareUrl, "_blank", "width=600,height=500");
    }
    setShareOpen(false);
  };

  if (showZeroActivity) {
    return (
      <div
        className="flex w-full items-center justify-center bg-[#020202] md:min-h-screen"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "pan-y" }}
      >
        <ProgressIndicator currentStep={5} totalSteps={6} showNext={false} />
        <ZeroActivityEmptyState />
        {stellarExpertUrl && (
          <a
            href={stellarExpertUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-6 left-6 z-30 flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-medium text-white/60 backdrop-blur-xl transition-all hover:border-white/30 hover:text-white/90"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {t("viewHistoryLink")}
          </a>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="flex w-full items-center justify-center bg-[#020202] selection:bg-[var(--selection-color)] md:min-h-screen"
        style={{ WebkitTapHighlightColor: "transparent", touchAction: "pan-y" }}
      >
        {/* Progress Indicator */}
        <ProgressIndicator currentStep={5} totalSteps={6} showNext={false} />

        <main id="main-content">
          <div className="flex min-h-screen w-96 flex-col items-center justify-center gap-4 overflow-hidden bg-[#020202] p-4 text-white sm:min-h-0 sm:gap-8 sm:p-12 md:w-full md:max-w-[1330px]">
            {/* Background Layer (ring wave + ambient) */}
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
              <div
                className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[120px] sm:h-[900px] sm:w-[900px]"
                style={{ background: "var(--accent-dark)" }}
              />
              <div
                className="absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 blur-[80px] sm:h-[500px] sm:w-[500px]"
                style={{ background: "var(--accent-dark)" }}
              />

              {!prefersReducedMotion &&
                [...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute top-1/2 left-1/2 rounded-full border"
                    style={{
                      transform: "translate(-50%, -50%)",
                      borderColor: "var(--accent)",
                      opacity: 0.28,
                      willChange: "transform, width, height, opacity",
                    }}
                    initial={{ width: "0px", height: "0px", opacity: 0 }}
                    animate={{
                      width: ["0px", "1800px"],
                      height: ["0px", "1800px"],
                      opacity: [0, 0.3, 0],
                    }}
                    transition={{
                      duration: 15,
                      repeat: Infinity,
                      delay: i * 0.8,
                      ease: "linear",
                    }}
                  />
                ))}

              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.2] mix-blend-overlay" />
            </div>

            {/* --- TOP ROW --- */}
            {/* Home Button - Absolute positioned like share page */}
            <Link href="/" aria-label={t("goHomeAriaLabel")}>
              <motion.button
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    window.location.href = "/";
                  }
                }}
                className="group absolute top-6 left-6 z-30 md:top-8 md:left-8"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label={t("homeButtonAriaLabel")}
              >
                <div
                  className="flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 backdrop-blur-xl md:px-4 md:py-3"
                  style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
                >
                  <Home
                    className="h-4 w-4 text-white/80 transition-colors group-hover:text-white md:h-5 md:w-5"
                    aria-hidden="true"
                  />
                  <span className="hidden text-xs font-black text-white/80 transition-colors group-hover:text-white sm:inline md:text-sm">
                    {t("homeLabel")}
                  </span>
                </div>
              </motion.button>
            </Link>

            <motion.div
              className="absolute top-6 right-6 z-30 md:top-8 md:right-8"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <MuteToggle />
            </motion.div>

            {/* Center Title */}
            <div className="absolute top-16 left-1/2 z-30 -translate-x-1/2 md:top-20">
              <div className="relative">
                <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-1.5 opacity-95 sm:gap-3">
                  <div
                    className="h-[3px] w-8 rounded-full sm:h-[4px] sm:w-14"
                    style={{
                      background: "var(--color-theme-primary)",
                      boxShadow: `0 6px 20px rgba(var(--color-theme-primary-rgb), 0.4)`,
                    }}
                  />
                  <div
                    className="h-[3px] w-12 rounded-full sm:h-[4px] sm:w-20"
                    style={{
                      background: "var(--color-theme-primary)",
                      boxShadow: `0 6px 20px rgba(var(--color-theme-primary-rgb), 0.4)`,
                    }}
                  />
                  <div
                    className="h-[3px] w-6 rounded-full sm:h-[4px] sm:w-10"
                    style={{
                      background: "var(--color-theme-primary)",
                      boxShadow: `0 6px 20px rgba(var(--color-theme-primary-rgb), 0.4)`,
                    }}
                  />
                </div>
                <h3 className="relative text-xs font-bold tracking-[0.3em] whitespace-nowrap text-gray-200 uppercase mix-blend-screen sm:text-2xl sm:tracking-[0.7em]">
                  {t("oracleHeading")}
                </h3>
              </div>
            </div>

            {/* --- CENTER: 3D CARD --- */}
            <div
              className="relative z-10 flex w-full flex-1 items-center justify-center"
              style={{ perspective: "1500px" }}
            >
              <GlowingStar
                className="-top-6 left-4 sm:-top-12 sm:left-10"
                delay={0.2}
                reducedMotion={prefersReducedMotion}
              />
              <GlowingStar
                className="-top-6 right-4 sm:-top-12 sm:right-10"
                delay={0.5}
                reducedMotion={prefersReducedMotion}
              />

              <motion.div
                ref={cardRef}
                role="button"
                tabIndex={0}
                aria-label={`${translatedArchetypeName} persona reveal card. ${result?.totalTransactions ?? 0} transactions, ${result?.percentile ?? 0} percentile. Tap to replay persona reveal. Long press or hover to see archetype description.`}
                onClick={(e) => {
                  if (isFlipped && !showTooltip) {
                    setShowTooltip(true);
                    e.stopPropagation();
                  } else {
                    handleCardTap();
                  }
                }}
                onMouseEnter={() => isFlipped && setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (isFlipped && !showTooltip) {
                      setShowTooltip(true);
                    } else {
                      handleCardTap();
                    }
                  }
                }}
                initial={{ y: 40, scale: 0.95, opacity: 0, rotateY: 0 }}
                animate={controls}
                className="relative h-[200px] w-full max-w-[800px] cursor-pointer sm:h-[280px]"
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* FRONT */}
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-3xl border border-white/10 backdrop-blur-md sm:rounded-[48px]"
                  style={{
                    backgroundColor: "rgba(var(--color-theme-primary-rgb), 0.1)",
                    backfaceVisibility: "hidden",
                  }}
                >
                  <div className="animate-pulse text-6xl font-black text-white/50 sm:text-8xl">
                    ?
                  </div>
                </div>

                {/* BACK */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-3xl border px-2 sm:rounded-[48px] sm:px-4"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    background: `linear-gradient(to bottom right, rgba(var(--color-theme-primary-rgb), 0.2), rgba(var(--color-theme-primary-rgb), 0.05), rgba(0,0,0,0.12))`,
                    boxShadow: `0 0 100px rgba(var(--color-theme-primary-rgb), 0.4)`,
                  }}
                >
                  <GlowingStar
                    className="top-1/4 left-8 sm:left-16"
                    delay={0.1}
                    reducedMotion={prefersReducedMotion}
                  />
                  <GlowingStar
                    className="bottom-1/4 left-12 sm:left-24"
                    delay={0.8}
                    reducedMotion={prefersReducedMotion}
                  />
                  <GlowingStar
                    className="top-1/3 right-10 sm:right-20"
                    delay={0.4}
                    reducedMotion={prefersReducedMotion}
                  />
                  <GlowingStar
                    className="right-8 bottom-1/3 sm:right-16"
                    delay={1.2}
                    reducedMotion={prefersReducedMotion}
                  />

                  <div
                    className="absolute top-4 left-4 h-6 w-6 rounded-tl-md border-t-[3px] border-l-[3px] sm:top-8 sm:left-8 sm:h-8 sm:w-8 sm:border-t-[4px] sm:border-l-[4px]"
                    style={{ borderColor: "var(--color-theme-primary)" }}
                  />
                  <div
                    className="absolute top-4 right-4 h-6 w-6 rounded-tr-md border-t-[3px] border-r-[3px] sm:top-8 sm:right-8 sm:h-8 sm:w-8 sm:border-t-[4px] sm:border-r-[4px]"
                    style={{ borderColor: "var(--color-theme-primary)" }}
                  />
                  <div
                    className="absolute bottom-4 left-4 h-6 w-6 rounded-bl-md border-b-[3px] border-l-[3px] sm:bottom-8 sm:left-8 sm:h-8 sm:w-8 sm:border-b-[4px] sm:border-l-[4px]"
                    style={{ borderColor: "var(--color-theme-primary)" }}
                  />
                  <div
                    className="absolute right-4 bottom-4 h-6 w-6 rounded-br-md border-r-[3px] border-b-[3px] sm:right-8 sm:bottom-8 sm:h-8 sm:w-8 sm:border-r-[4px] sm:border-b-[4px]"
                    style={{ borderColor: "var(--color-theme-primary)" }}
                  />

                  <div className="z-10 flex flex-col items-center justify-center gap-3 px-4 sm:flex-row sm:gap-6">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white/5 shadow-2xl backdrop-blur-sm sm:h-20 sm:w-20 md:h-24 md:w-24">
                      <Image
                        src={archetypeImagePath(archetypeKey)}
                        alt={`${translatedArchetypeName} persona emblem`}
                        fill
                        sizes="(max-width: 640px) 56px, (max-width: 768px) 80px, 96px"
                        priority
                        className="object-cover"
                      />
                    </div>
                    <h1
                      data-story-heading="true"
                      tabIndex={-1}
                      className="bg-clip-text text-center text-4xl leading-none font-black tracking-tighter text-transparent drop-shadow-[0_0_30px_rgba(0,0,0,0.5)] filter focus:outline-none sm:text-left sm:text-7xl md:text-8xl"
                      style={{
                        backgroundImage:
                          "linear-gradient(to bottom, #fff, var(--color-theme-primary), rgba(var(--color-theme-primary-rgb), 0.6))",
                      }}
                    >
                      {translatedArchetypeName}
                    </h1>
                  </div>
                </div>
              </motion.div>

              {/* Tooltip / Explanation Panel */}
              <AnimatePresence>
                {showTooltip && (
                  <motion.div
                    ref={tooltipRef}
                    role="tooltip"
                    id="archetype-tooltip"
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-1/2 z-20 mt-4 w-[280px] max-w-[90vw] -translate-x-1/2 sm:w-[500px]"
                  >
                    <div className="relative rounded-lg border border-white/20 bg-black/70 px-4 py-3 shadow-xl backdrop-blur-md sm:rounded-xl sm:px-6 sm:py-4">
                      <button
                        onClick={() => setShowTooltip(false)}
                        className="absolute top-2 right-2 rounded-md p-1 transition-colors hover:bg-white/10 sm:top-3 sm:right-3"
                        aria-label={t("closeTooltipAriaLabel")}
                      >
                        <X className="h-4 w-4 text-white/80 hover:text-white sm:h-5 sm:w-5" />
                      </button>
                      <p className="pr-6 text-xs leading-relaxed text-gray-200 sm:text-sm">
                        <span className="font-semibold text-white">{t("archetypeRuleLabel")}</span>{" "}
                        {data.description}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Description Text Below Card */}
            <motion.div
              className="absolute top-1/2 left-1/2 z-10 w-[280px] max-w-[65vw] -translate-x-1/2 translate-y-[200px] sm:w-[740px] sm:max-w-[56vw] sm:translate-y-[240px] md:translate-y-[280px]"
              initial={{ opacity: 0, y: 30 }}
              animate={isFlipped ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 1, duration: 0.6 }}
            >
              <div className="relative rounded-xl border border-white/5 bg-black/40 px-6 py-4 shadow-2xl backdrop-blur-sm sm:px-8 sm:py-5 md:rounded-2xl md:px-12 md:py-6">
                <p className="px-4 text-center text-sm leading-relaxed font-semibold text-gray-100 drop-shadow-md sm:px-8 sm:text-lg md:text-xl">
                  {displayedDescription}
                  <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-[var(--color-theme-primary)] align-middle sm:h-6 sm:w-1" />
                </p>
              </div>
            </motion.div>

            {/* Persona evolution timeline */}
            <div className="relative z-10 mt-8 w-full">
              <Suspense
                fallback={
                  <div className="h-32 animate-pulse rounded-2xl bg-white/5" aria-hidden="true" />
                }
              >
                <PersonaEvolutionTimeline useDemo={process.env.NODE_ENV === "development"} />
              </Suspense>
            </div>

            {/* Persona rarity / archetype comparison */}
            {isFlipped && (
              <motion.div
                className="relative z-10 mt-4 w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
              >
                <Suspense
                  fallback={
                    <div className="h-48 animate-pulse rounded-2xl bg-white/5" aria-hidden="true" />
                  }
                >
                  <PersonaRarityChart userArchetype={archetypeKey} />
                </Suspense>
              </motion.div>
            )}

            {/* Asset List - wallet holdings */}
            {isFlipped && (
              <motion.div
                className="relative z-10 mt-6 w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.6 }}
              >
                <AssetList showSelection={false} />

                {/* CSV Export Button */}
                <div className="mt-4 flex justify-center">
                  <CsvExportButton />
                </div>
              </motion.div>
            )}

            {/* --- BOTTOM ROW --- */}
            {/* Notification Prompt — shown after final wrap screen */}
            {showNotifPrompt &&
              !notificationStore.consentGiven &&
              !notificationStore.pushEnabled && (
                <motion.div
                  className="absolute bottom-24 left-1/2 z-30 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2 }}
                >
                  <NotificationPrompt onDismiss={() => setShowNotifPrompt(false)} />
                </motion.div>
              )}

            {/* Share Popup Implementation - Absolute positioned like share page */}
            <div className="absolute bottom-6 left-6 z-30 md:bottom-8 md:left-8">
              <div className="relative">
                <AnimatePresence>
                  {" "}
                  {shareOpen && (
                    <motion.div
                      ref={shareMenuRef}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      /* Added items-center to center buttons and py-6 for vertical padding */ className="absolute bottom-18 left-0 z-50 flex h-[350px] w-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-[#232325] bg-[#060607] p-2 shadow-2xl"
                      style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.8)" }}
                      role="menu"
                      aria-label="Share this wrap"
                    >
                      {" "}
                      {/* X / Twitter */}{" "}
                      <button
                        onClick={() => handleShare("x")}
                        role="menuitem"
                        className="flex h-15 w-42 cursor-pointer items-center justify-center gap-3 rounded-xl bg-[#0F0F10] p-2 transition-colors hover:bg-[#1a1a1c]"
                      >
                        {" "}
                        <div className="relative left-5 flex items-center gap-3">
                          {" "}
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black">
                            {" "}
                            <SocialIcons.X />{" "}
                          </div>{" "}
                          <span className="font-bold tracking-wide text-white"> x </span>{" "}
                        </div>{" "}
                      </button>{" "}
                      {/* WhatsApp */}{" "}
                      <button
                        onClick={() => handleShare("whatsapp")}
                        className="flex h-15 w-42 cursor-pointer items-center justify-center gap-3 rounded-xl bg-[#0F0F10] p-2 transition-colors hover:bg-[#1a1a1c]"
                        role="menuitem"
                      >
                        {" "}
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]">
                          {" "}
                          <SocialIcons.WhatsApp />{" "}
                        </div>{" "}
                        <span className="font-bold tracking-wide text-white"> WhatsApp </span>{" "}
                      </button>{" "}
                      {/* Facebook */}{" "}
                      <button
                        onClick={() => handleShare("facebook")}
                        className="flex h-15 w-42 cursor-pointer items-center justify-center gap-3 rounded-xl bg-[#0F0F10] p-2 transition-colors hover:bg-[#1a1a1c]"
                        role="menuitem"
                      >
                        {" "}
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1877F2]">
                          {" "}
                          <SocialIcons.Facebook />{" "}
                        </div>{" "}
                        <span className="font-bold tracking-wide text-white"> Facebook </span>{" "}
                      </button>{" "}
                      {/* LinkedIn */}{" "}
                      <button
                        onClick={() => handleShare("linkedin")}
                        className="flex h-15 w-42 cursor-pointer items-center justify-center gap-3 rounded-xl bg-[#0F0F10] p-2 transition-colors hover:bg-[#1a1a1c]"
                        role="menuitem"
                      >
                        {" "}
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0077B5]">
                          {" "}
                          <SocialIcons.LinkedIn />{" "}
                        </div>{" "}
                        <span className="font-bold tracking-wide text-white"> LinkedIn </span>{" "}
                      </button>{" "}
                      {/* Telegram */}{" "}
                      <button
                        onClick={() => handleShare("telegram")}
                        className="flex h-15 w-42 cursor-pointer items-center justify-center gap-3 rounded-xl bg-[#0F0F10] p-2 transition-colors hover:bg-[#1a1a1c]"
                        role="menuitem"
                      >
                        {" "}
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#229ED9]">
                          {" "}
                          <SocialIcons.Telegram />{" "}
                        </div>{" "}
                        <span className="font-bold tracking-wide text-white"> Telegram </span>{" "}
                      </button>{" "}
                    </motion.div>
                  )}{" "}
                </AnimatePresence>

                <button
                  ref={shareBtnRef}
                  onClick={() => setShareOpen(!shareOpen)}
                  onKeyDown={toggleShareKeyDown}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur-md transition hover:bg-white/5 sm:h-16 sm:w-16"
                  aria-expanded={shareOpen}
                  aria-haspopup="menu"
                  aria-label="Share this wrap"
                >
                  <motion.div
                    animate={{ rotate: shareOpen ? 50 : 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                  >
                    <Share2 className="h-5 w-5 cursor-pointer sm:h-7 sm:w-7" aria-hidden="true" />
                  </motion.div>
                </button>
              </div>
            </div>

            {/* Transaction history explorer — hidden when address is missing */}
            {stellarExpertUrl && (
              <a
                href={stellarExpertUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-6 left-6 z-30 flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-medium text-white/60 backdrop-blur-xl transition-all hover:border-white/30 hover:text-white/90 md:bottom-8 md:left-8"
                style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
                data-testid="persona-stellar-expert-link"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {t("viewHistoryLink")}
              </a>
            )}

            {/* Skip/Next Button - Absolute positioned like share page */}
            <Link href="/share" aria-label={t("goToShareAriaLabel")}>
              <motion.button
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    window.location.href = "/share";
                  }
                }}
                className="group absolute right-6 bottom-6 z-30 md:right-8 md:bottom-8"
                aria-label={t("goToShareAriaLabel")}
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reducedMotionTransition(prefersReducedMotion, {
                  delay: 1,
                })}
                whileHover={prefersReducedMotion ? undefined : { scale: 1.1 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur-md transition hover:bg-white/5 sm:h-16 sm:w-16">
                  <ChevronRight className="h-6 w-6 sm:h-9 sm:w-9" aria-hidden="true" />
                </div>
              </motion.button>
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
