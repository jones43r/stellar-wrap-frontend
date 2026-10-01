import { motion } from "motion/react";
import { Share2, Download, Twitter, Loader2, Sparkles, AlertCircle, Film, ImagePlay, ExternalLink } from "lucide-react";
import { useState, RefObject, useEffect } from "react";
import { useTranslations } from "next-intl";
import { downloadShareImage, downloadImageBlob, renderShareImage } from "../utils/imageExport";
import { shareImageWithFallback } from "../utils/shareFallback";
import {
  downloadAnimatedGif,
  downloadAnimatedVideo,
  ShareAnimationData,
  AnimationExportProgress,
} from "../utils/animationExport";
import { useWrapStore } from "@/app/store/wrapStore";
import { useTransactionStore } from "@/app/store/transactionStore";
import { toast } from "sonner";
import { useSound } from "../hooks/useSound";
import { SOUND_NAMES } from "../utils/soundManager";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useTheme } from "@/app/context/ThemeContext";
import { mintWrap } from "../utils/walletKit";
import { logger } from "../utils/logger";

const log = logger.child("ShareCard");

function isMobileDevice(): boolean {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
interface ShareCardProps {
  username: string;
  transactions: number;
  persona: string;
  topVibe: string;
  vibePercentage: number;
  shareImageRef: RefObject<HTMLDivElement>;
  themeColor?: string;
  cardFormat?: "square" | "stories";
  onFormatChange?: (format: "square" | "stories") => void;
}

export function ShareCard({
  username,
  transactions,
  persona,
  topVibe,
  vibePercentage,
  shareImageRef,
  themeColor = "rgb(5, 64, 32)",
  cardFormat = "square",
  onFormatChange,
}: ShareCardProps) {
  const t = useTranslations("ShareCard");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [usedMainThreadFallback, setUsedMainThreadFallback] = useState(false);
  const [exportLabel, setExportLabel] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<AnimationExportProgress | null>(null);
  const { address, network, period } = useWrapStore();
  const { mode } = useTheme();
  const { playSound } = useSound();
  const isOnline = useOnlineStatus();
  
  const { transactionState, transactionHash, transactionError, resetTransaction, confirmingAttempt, confirmingTimedOut, setConfirmingAttempt, setConfirmingTimedOut } = useTransactionStore();

  const isMinting = [
    "building",
    "simulating",
    "signing",
    "submitting",
    "confirming",
  ].includes(transactionState);
  
  const mintSuccess = transactionState === "confirmed" ? transactionHash : null;
  const mintFailed = transactionState === "failed";

  useEffect(() => {
    if (transactionState === "confirmed" && transactionHash) {
      playSound(SOUND_NAMES.MINT_SUCCESS);
      toast.success(t("mintedSuccessfully"), {
        description: t("viewTransaction"),
        action: {
          label: t("view"),
          onClick: () =>
            window.open(
              `https://stellar.expert/explorer/testnet/tx/${transactionHash}`,
              "_blank",
            ),
        },
      });
    }

    if (transactionState === "failed" && transactionError) {
      // transactionError is already mapped to a friendly message in contractBridge;
      // keep the raw string in diagnostics for support/debugging.
      console.error("[ShareCard] mint failed", { transactionError });
      toast.error(t("mintingFailed"), {
        description: transactionError,
      });
    }
  }, [transactionState, transactionHash, transactionError, playSound, t]);

  const handleDownload = async () => {
    if (!shareImageRef.current || isDownloading) return;

    setIsDownloading(true);
    setDownloadError(null);
    setUsedMainThreadFallback(false);

    const element = shareImageRef.current;
    try {
      // Never throws: falls back native share → download → OG image link.
      const outcome = await shareImageWithFallback({
        render: async () => {
          const result = await renderShareImage(element, {
            onFallbackWarning: () => setUsedMainThreadFallback(true),
            format: cardFormat,
          });
          log.info(
            `Share image generated in ${result.durationMs}ms (scale: ${result.scale}x, worker: ${result.usedWorker})`,
          );
          return result;
        },
        download: downloadImageBlob,
        preview: { username, transactions, persona, topVibe, vibePercentage },
        preferNativeShare: isMobileDevice(),
      });

      if (outcome.kind === "og-link-copied") {
        toast.info(t("imageFallbackCopied"));
      } else if (outcome.kind === "og-link") {
        const url = outcome.url;
        toast.info(t("imageFallbackOpen"), {
          action: { label: t("openImage"), onClick: () => window.open(url, "_blank", "noopener") },
        });
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const animationData: ShareAnimationData = {
    username,
    transactions,
    persona,
    topVibe,
    vibePercentage,
    themeColor,
  };

  const handleAnimatedExport = async (
    type: "gif" | "video",
    label: string,
  ) => {
    setExportLabel(label);
    setExportProgress({ phase: "capturing", progress: 0, message: t("starting") });
    setIsDownloading(true);
    try {
      const onProgress = (p: AnimationExportProgress) => setExportProgress(p);
      const fallback = shareImageRef.current ?? undefined;
      if (type === "gif") {
        await downloadAnimatedGif(animationData, onProgress, fallback);
        toast.success(t("gifDownloaded"), {
          description: t("gifDescription"),
        });
      } else {
        await downloadAnimatedVideo(animationData, onProgress, fallback);
        toast.success(t("videoDownloaded"), {
          description: t("videoDescription"),
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("exportFailed");
      if (msg.includes("PNG")) {
        toast.info(t("staticPng"), { description: msg });
      } else {
        toast.error(t("animationExportFailed"), { description: msg });
        if (shareImageRef.current) {
          await downloadShareImage(shareImageRef.current);
        }
      }
    } finally {
      setIsDownloading(false);
      setExportProgress(null);
      setExportLabel(null);
    }
  };

  const handleShareX = async () => {
    // Open Twitter intent
    const text = `I'm ${persona} on Stellar! 🚀 ${transactions} transactions in 2026. #StellarWrapped. (Upload your Stellar Wrapped Card manually.)`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, "_blank", "width=600,height=500");
  };

  const handleMint = async () => {
    log.debug("Mint attempt", { address });

    if (!isOnline) {
      toast.error(t("mintingOffline"));
      return;
    }

    if (!address) {
      toast.error(t("connectWalletFirst"), {
        action: {
          label: t("connectWallet"),
          onClick: () => (window.location.href = "/connect"),
        },
      });
      return;
    }

    if (transactionState === "failed" || transactionState === "confirmed") {
      resetTransaction();
      setConfirmingAttempt(null);
      setConfirmingTimedOut(false);
    }

    // Transaction state observer
    const observer = (state: string, data?: unknown) => {
      log.debug("Transaction state:", state, data);

      // Track per-tick confirming progress
      if (
        state === 'submitted' &&
        data &&
        typeof data === 'object' &&
        'confirming' in data
      ) {
        const d = data as unknown as { attempt: number; maxAttempts: number };
        setConfirmingAttempt(d.attempt);
        return; // don't propagate as a state change — still "submitted" in the store
      }

      // Detect structured timeout payload
      if (
        state === 'failed' &&
        data &&
        typeof data === 'object' &&
        'code' in data &&
        (data as { code: string }).code === 'CONFIRMATION_TIMEOUT'
      ) {
        setConfirmingTimedOut(true);
        setConfirmingAttempt(null);
      }

      // Handle simulation results
      if (state === 'simulating' && data && typeof data === 'object' && 'simulation' in data) {
        const simulation = (data as { simulation: { success?: boolean; estimatedFee?: number } }).simulation;
        if (simulation?.success && simulation?.estimatedFee) {
          toast.info(t("transactionSimulationSuccessful"), {
            description: t("estimatedFee", { fee: simulation.estimatedFee.toFixed(7) }),
          });
        }
      }
    };

    try {
      await mintWrap({
        userAddress: address,
        network: network || "testnet",
        period,
        archetype: persona,
        observer,
      });
    } catch (error) {
      // Errors are handled by transactionObserver setting state to 'failed'
      // which triggers the useEffect to show a toast, so we just log raw details here.
      log.error("Minting process caught error:", error);
    }
  };

  const getMintButtonText = () => {
    switch (transactionState) {
      case "building":
        return t("buildingTransaction");
      case "simulating":
        return t("simulatingTransaction");
      case "signing":
        return t("awaitingSignature");
      case "submitting":
        return confirmingAttempt !== null
          ? t("confirmingAttempt", { attempt: confirmingAttempt })
          : t("submittingTransaction");
      case "confirming":
        return confirmingAttempt !== null
          ? t("confirmingAttempt", { attempt: confirmingAttempt })
          : t("confirmingTransaction");
      case "confirmed":
        return t("minted");
      case "failed":
        return confirmingTimedOut ? t("retryMint") : t("retryMint");
      default:
        return isOnline ? t("mintWrap") : t("mintUnavailableOffline");
    }
  };
  return (
    <div
      className="relative w-full h-full overflow-hidden flex items-center justify-center transition-colors duration-200"
      style={{ backgroundColor: mode === 'dark' ? "var(--color-theme-background)" : "#ffffff" }}
    >
      {/* Gradient background */}
      <div className="absolute inset-0" style={{ 
        background: mode === 'dark'
          ? 'rgba(0,0,0,0.6)'
          : 'rgba(255,255,255,0.8)'
      }} />

      {/* Diagonal lines pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(var(--color-theme-primary-rgb), 0.5) 20px, rgba(var(--color-theme-primary-rgb), 0.5) 21px)
            `,
          }}
        />
      </div>

      {/* Ambient glow */}
      <motion.div
        className="absolute w-150 h-150 rounded-full blur-[150px]"
        style={{ backgroundColor: "rgba(var(--color-theme-primary-rgb), 0.2)" }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full px-3 sm:px-4 md:px-6 lg:px-12 py-4 sm:py-6 md:py-8 flex flex-col lg:flex-row items-center justify-center gap-6 sm:gap-8 md:gap-12 lg:gap-16 max-w-7xl mx-auto">
        {/* Left: Share card preview */}
        <div className="w-full lg:flex-1 flex flex-col items-center">
            <div className="relative w-full max-w-sm mx-auto">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, rotateY: -20 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                }}
              />

                  <div
                    className="relative aspect-square rounded-[40px] overflow-hidden border backdrop-blur-xl"
                    style={{
                      borderColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                      background: mode === 'dark' 
                        ? `linear-gradient(to bottom right, rgba(var(--color-theme-primary-rgb), 0.2), rgba(0, 0, 0, 0.8))`
                        : `linear-gradient(to bottom right, rgba(var(--color-theme-primary-rgb), 0.1), rgba(255, 255, 255, 0.95))`,
                    }}
                  >
                    {/* Card header */}
                    <div className="p-6 sm:p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <motion.div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: "var(--color-theme-primary)" }}
                          animate={{
                            opacity: [0.5, 1, 0.5],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                          }}
                        />
                        <span className="text-xs sm:text-sm font-black text-white/70 tracking-[0.2em] truncate">
                          {t("stellarWrapped")}
                        </span>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black text-white mb-2 truncate">
                        @{username}
                      </h2>
                    </div>

                    {/* Stats */}
                    <div className="px-6 sm:px-8 space-y-4">
                      <motion.div
                        className="backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10"
                        style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        <p className="text-xs sm:text-sm font-bold text-white/60 mb-2">
                          {t("totalTransactions")}
                        </p>
                        <p className="text-4xl sm:text-6xl font-black text-white break-words">
                          {transactions}
                        </p>
                      </motion.div>

                      <motion.div
                        className="backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10"
                        style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.6 }}
                      >
                        <p className="text-xs sm:text-sm font-bold text-white/60 mb-2">
                          {t("persona")}
                        </p>
                        <p
                          className="text-2xl sm:text-3xl font-black truncate"
                          style={{
                            background: `linear-gradient(to right, #ffffff, var(--color-theme-primary))`,
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                          }}
                        >
                          {persona}
                        </p>
                      </motion.div>

                      <motion.div
                        className="backdrop-blur-sm rounded-2xl p-4 sm:p-6 border border-white/10"
                        style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.7 }}
                      >
                        <p className="text-xs sm:text-sm font-bold text-white/60 mb-2">
                          {t("topVibe")}
                        </p>
                        <p className="text-xl sm:text-2xl font-black text-white break-words">
                          {vibePercentage}% {topVibe}
                        </p>
                      </motion.div>
                    </div>

                    {/* Footer */}
                    <div className="absolute bottom-6 sm:bottom-8 left-4 sm:left-8 right-4 sm:right-8 flex items-center justify-between gap-2">
                      <div className="text-xs font-black text-white/50 truncate">
                        stellar.org/wrapped
                      </div>
                      <motion.div
                        className="w-10 h-10 rounded-xl backdrop-blur-sm flex items-center justify-center border border-white/20 shrink-0"
                        style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
                        animate={{
                          boxShadow: [
                            `0 0 20px rgba(var(--color-theme-primary-rgb), 0)`,
                            `0 0 30px rgba(var(--color-theme-primary-rgb), 0.5)`,
                            `0 0 20px rgba(var(--color-theme-primary-rgb), 0)`,
                          ],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded-lg"
                          style={{ backgroundColor: "var(--color-theme-primary)" }}
                        />
                      </motion.div>
                    </div>
                  </div>
                </div>

          {/* Polling progress bar — shown while awaiting confirmation */}
          {confirmingAttempt !== null && !confirmingTimedOut && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full mt-6 rounded-xl border border-white/10 bg-black/40 p-4"
              aria-live="polite"
              aria-label={`Confirming transaction, attempt ${confirmingAttempt} of 60`}
            >
              <div className="flex justify-between text-xs text-white/60 mb-2">
                <span>Waiting for confirmation on-chain…</span>
                <span>{confirmingAttempt} / 60</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: "var(--color-theme-primary)" }}
                  animate={{ width: `${Math.round((confirmingAttempt / 60) * 100)}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </motion.div>
          )}

          {/* Timeout banner — shown when confirmation window expired */}
          {confirmingTimedOut && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-amber-200">
                    Confirmation is taking longer than expected
                  </p>
                  <p className="text-xs text-amber-200/70 mt-1">
                    Your transaction may still go through — check the explorer before retrying to avoid a duplicate.
                  </p>
                </div>
              </div>
              {transactionHash && (
                <a
                  href={`https://stellar.expert/explorer/${network === "mainnet" ? "public" : "testnet"}/tx/${transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-100 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  View transaction on Stellar.expert
                </a>
              )}
            </motion.div>
          )}

          {/* Mint Button below the card */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
            whileHover={{
              scale: !isOnline || isMinting || !!mintSuccess ? 1 : 1.02,
              transition: { duration: 0.2 },
            }}
            whileTap={{
              scale: !isOnline || isMinting || !!mintSuccess ? 1 : 0.98,
            }}
            className={`w-full group relative mt-8 ${mintFailed ? "animate-pulse" : ""}`}
            onClick={handleMint}
          >
            <motion.div
              className={`absolute -inset-1 rounded-2xl blur-xl transition-opacity ${mintFailed ? "opacity-50" : "opacity-0 group-hover:opacity-100"}`}
              style={{ backgroundColor: mintFailed ? "rgba(239, 68, 68, 0.5)" : "var(--color-theme-primary)" }}
            />
            <div
              className="relative flex items-center justify-center gap-3 sm:gap-4 backdrop-blur-sm text-white px-6 sm:px-8 py-4 sm:py-6 rounded-2xl border border-white/20 transition-colors"
              style={{
                backgroundColor: mintFailed ? "rgba(239, 68, 68, 0.2)" : "rgba(var(--color-theme-primary-rgb), 0.2)",
                borderColor: mintFailed ? "rgba(239, 68, 68, 0.5)" : "rgba(255, 255, 255, 0.2)"
              }}
            >
              {isMinting ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : mintFailed ? (
                <AlertCircle className="w-6 h-6 text-red-500" />
              ) : (
                <Sparkles className="w-6 h-6" />
              )}
              <span className={`text-lg sm:text-2xl font-black tracking-tight ${mintFailed ? "text-red-100" : ""} truncate`}>
                {getMintButtonText()}
              </span>
            </div>
          </motion.button>

          {/* View on Stellar Expert link */}
          {address && (
            <motion.a
              href={`https://stellar.expert/explorer/${network === "mainnet" ? "public" : "testnet"}/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
            >
              View full history on Stellar.expert →
            </motion.a>
          )}
        </div>

        {/* Right: Share options */}
        <div className="flex-1">
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            <h3 className="text-7xl font-black mb-1 tracking-tight leading-none" style={{ color: mode === 'dark' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)' }}>
              SHARE
            </h3>
            <h3
              className="text-8xl font-black mb-6 tracking-tight leading-none"
              style={{
                background: mode === 'dark'
                  ? `linear-gradient(to right, #ffffff, var(--color-theme-primary))`
                  : `linear-gradient(to right, #1a1a1a, var(--color-theme-primary))`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              YOUR WRAP
            </h3>

            {/* Format Toggle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mb-6 flex gap-3"
            >
              <motion.button
                onClick={() => onFormatChange?.("square")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  cardFormat === "square"
                    ? "bg-white text-black"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Film className="w-4 h-4" />
                <span className="text-sm font-bold">{t("square")}</span>
              </motion.button>
              <motion.button
                onClick={() => onFormatChange?.("stories")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  cardFormat === "stories"
                    ? "bg-white text-black"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <ImagePlay className="w-4 h-4" />
                <span className="text-sm font-bold">{t("stories")}</span>
              </motion.button>
            </motion.div>

            <div className="space-y-4">
              <motion.button
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
                whileHover={{
                  scale: 1.05,
                  x: 10,
                  transition: { duration: 0.2 },
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full group relative"
                onClick={handleShareX}
              >
                <motion.div
                  className="absolute -inset-1 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "var(--color-theme-primary)" }}
                />
                <div className="relative flex items-center gap-4 bg-white text-black px-8 py-6 rounded-2xl border border-white/20">
                  <Share2 className="w-6 h-6" aria-hidden="true" />
                  <span className="text-2xl font-black tracking-tight">
                    {t("shareToSocial")}
                  </span>
                </div>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
                whileHover={{
                  scale: 1.05,
                  x: 10,
                  transition: { duration: 0.2 },
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full group relative"
                onClick={handleShareX}
              >
                <motion.div
                  className="absolute -inset-1 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "var(--color-theme-primary)" }}
                />
                <div
                  className="relative flex items-center gap-4 backdrop-blur-sm px-8 py-6 rounded-2xl border"
                  style={{ 
                    backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    color: mode === 'dark' ? '#ffffff' : '#1a1a1a',
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'
                  }}
                >
                  <Twitter className="w-6 h-6" aria-hidden="true" />
                  <span className="text-2xl font-black tracking-tight">
                    {t("postToX")}
                  </span>
                </div>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.95 }}
                whileHover={{
                  scale: 1.05,
                  x: 10,
                  transition: { duration: 0.2 },
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full group relative"
                onClick={() => handleAnimatedExport("gif", "GIF")}
                disabled={isDownloading}
              >
                <motion.div
                  className="absolute -inset-1 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "var(--color-theme-primary)" }}
                />
                <div
                  className="relative flex items-center gap-4 backdrop-blur-sm text-white px-8 py-6 rounded-2xl border border-white/20"
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
                >
                  {isDownloading && exportLabel === "GIF" ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <ImagePlay className="w-6 h-6" />
                  )}
                  <span className="text-2xl font-black tracking-tight">
                    {isDownloading && exportLabel === "GIF"
                      ? exportProgress?.message ?? t("encodingGif")
                      : t("downloadGif")}
                  </span>
                </div>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.0 }}
                whileHover={{
                  scale: 1.05,
                  x: 10,
                  transition: { duration: 0.2 },
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full group relative"
                onClick={() => handleAnimatedExport("video", "Video")}
                disabled={isDownloading}
              >
                <motion.div
                  className="absolute -inset-1 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "var(--color-theme-primary)" }}
                />
                <div
                  className="relative flex items-center gap-4 backdrop-blur-sm text-white px-8 py-6 rounded-2xl border border-white/20"
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
                >
                  {isDownloading && exportLabel === "Video" ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Film className="w-6 h-6" />
                  )}
                  <span className="text-2xl font-black tracking-tight">
                    {isDownloading && exportLabel === "Video"
                      ? exportProgress?.message ?? t("recording")
                      : t("downloadVideo")}
                  </span>
                </div>
              </motion.button>

              {exportProgress && (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                  <div className="flex justify-between text-xs text-white/60 mb-2">
                    <span>{exportProgress.message}</span>
                    <span>{exportProgress.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-theme-primary)] transition-all duration-300"
                      style={{ width: `${exportProgress.progress}%` }}
                    />
                  </div>
                </div>
              )}

              <motion.button
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 }}
                whileHover={{
                  scale: 1.05,
                  x: 10,
                  transition: { duration: 0.2 },
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full group relative"
                onClick={handleDownload}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !isDownloading) {
                    e.preventDefault();
                    handleDownload();
                  }
                }}
                disabled={isDownloading}
                aria-label={isDownloading ? "Generating share image" : "Download share image"}
              >
                <motion.div
                  className="absolute -inset-1 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "var(--color-theme-primary)" }}
                />
                <div
                  className="relative flex items-center gap-4 backdrop-blur-sm px-8 py-6 rounded-2xl border"
                  style={{ 
                    backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    color: mode === 'dark' ? '#ffffff' : '#1a1a1a',
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'
                  }}
                >
                  {isDownloading ? (
                    <Loader2
                      className="w-6 h-6 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Download className="w-6 h-6" aria-hidden="true" />
                  )}
                  <span className="text-2xl font-black tracking-tight">
                    {isDownloading
                      ? t("generatingCard")
                      : t("downloadImage")}
                  </span>
                </div>
              </motion.button>

              {downloadError && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-200/90">{downloadError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="text-sm font-bold text-red-200 hover:text-white transition-colors"
                  >
                    Retry download
                  </button>
                </motion.div>
              )}

              {usedMainThreadFallback && !downloadError && (
                <p className="text-sm text-white/50">
                  Using main-thread encoding because worker support is unavailable.
                </p>
              )}
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="mt-8 text-lg font-bold" style={{ color: mode === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}
            >
              {t("showJourney")}
            </motion.p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
