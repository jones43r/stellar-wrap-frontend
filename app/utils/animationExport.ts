/**
 * Animated share export utilities.
 *
 * Supported formats:
 * - PNG: static (via imageExport.ts)
 * - GIF: canvas frames + gifenc (Chrome, Firefox, Safari 16+)
 * - MP4/WebM: MediaRecorder on canvas stream (Chrome, Firefox, Edge)
 *
 * GIF encoding uses gifenc inside a Web Worker so the UI stays responsive,
 * reporting per-frame progress; falls back to static PNG after 15s timeout.
 */

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { downloadShareImage } from "./imageExport";
import { logger } from "./logger";

const log = logger.child("animationExport");

/** Thrown when the device runs out of memory while encoding (e.g. mobile Safari). */
export class ExportOutOfMemoryError extends Error {
  constructor() {
    super(
      "Your device ran out of memory creating the animation. Downloading a static image instead.",
    );
    this.name = "ExportOutOfMemoryError";
  }
}

export interface ShareAnimationData {
  username: string;
  transactions: number;
  persona: string;
  topVibe: string;
  vibePercentage: number;
  themeColor: string;
}

export interface AnimationExportProgress {
  phase: "capturing" | "encoding" | "done";
  progress: number;
  message: string;
}

const ANIMATION_DURATION_MS = 4000;
const FRAME_INTERVAL_MS = 125;
const MAX_EXPORT_TIMEOUT_MS = 15000;
const GIF_MAX_BYTES = 5 * 1024 * 1024;
const VIDEO_MAX_BYTES = 2 * 1024 * 1024;
const CANVAS_SIZE = 540;

function parseRgb(color: string): [number, number, number] {
  const rgb = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return [5, 64, 32];
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function drawAnimatedFrame(
  ctx: CanvasRenderingContext2D,
  data: ShareAnimationData,
  elapsed: number,
): void {
  const [r, g, b] = parseRgb(data.themeColor);
  const w = CANVAS_SIZE;
  const h = CANVAS_SIZE;

  ctx.fillStyle = "#020202";
  ctx.fillRect(0, 0, w, h);

  const pad = w * 0.04;
  const cardR = w * 0.04;
  ctx.beginPath();
  ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, cardR);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.25)`);
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const innerX = pad + w * 0.04;
  let y = pad + h * 0.06;

  ctx.fillStyle = data.themeColor;
  ctx.beginPath();
  ctx.arc(innerX + 6, y + 6, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillText("STELLAR WRAPPED 2026", innerX + 20, y + 10);
  y += h * 0.06;
  ctx.fillStyle = "#fff";
  ctx.font = "900 22px system-ui, sans-serif";
  ctx.fillText(`@${data.username}`, innerX, y);
  y += h * 0.08;

  const txProgress = Math.min(1, elapsed / 1200);
  const txCount = Math.round(data.transactions * easeOutCubic(txProgress));

  const drawStatBox = (label: string, value: string, alpha: number) => {
    if (alpha <= 0) return;
    const boxH = h * 0.14;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.roundRect(innerX, y, w - pad * 2 - w * 0.04, boxH, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillText(label, innerX + 14, y + 22);
    ctx.fillStyle = "#fff";
    ctx.font = "900 36px system-ui, sans-serif";
    ctx.fillText(value, innerX + 14, y + boxH - 14);
    ctx.globalAlpha = 1;
    y += boxH + h * 0.025;
  };

  drawStatBox("Total Transactions", String(txCount), 1);

  const personaAlpha = Math.min(1, Math.max(0, (elapsed - 1200) / 600));
  drawStatBox("Persona", data.persona, personaAlpha);

  const vibeAlpha = Math.min(1, Math.max(0, (elapsed - 2000) / 600));
  drawStatBox("Top Vibe", `${data.vibePercentage}% ${data.topVibe}`, vibeAlpha);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "bold 9px system-ui, sans-serif";
  ctx.fillText("stellar.org/wrapped", innerX, h - pad - h * 0.04);
}

async function captureFrames(
  data: ShareAnimationData,
  onProgress: (p: AnimationExportProgress) => void,
  signal?: AbortSignal,
): Promise<ImageData[]> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not supported");

  const frames: ImageData[] = [];
  const frameCount = Math.ceil(ANIMATION_DURATION_MS / FRAME_INTERVAL_MS);

  for (let i = 0; i < frameCount; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const elapsed = i * FRAME_INTERVAL_MS;
    drawAnimatedFrame(ctx, data, elapsed);
    frames.push(ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE));
    onProgress({
      phase: "capturing",
      progress: Math.round(((i + 1) / frameCount) * 50),
      message: `Capturing frame ${i + 1}/${frameCount}`,
    });
    await new Promise((r) => setTimeout(r, 0));
  }

  return frames;
}

function encodeGifInWorker(
  frames: ImageData[],
  delayMs: number,
  maxBytes: number,
  onEncodeProgress: (fraction: number) => void,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      try {
        let gif = encodeGifSync(frames, delayMs);
        if (gif.byteLength > maxBytes) {
          gif = encodeGifSync(frames.filter((_, i) => i % 2 === 0), delayMs * 2);
        }
        resolve(gif);
      } catch (e) {
        reject(e instanceof RangeError ? new ExportOutOfMemoryError() : e);
      }
      return;
    }

    const worker = new Worker(
      new URL("./gifEncode.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (
      e: MessageEvent<{ gif?: Uint8Array; progress?: number; error?: string; outOfMemory?: boolean }>,
    ) => {
      if (typeof e.data.progress === "number") {
        onEncodeProgress(e.data.progress);
        return;
      }
      worker.terminate();
      if (e.data.outOfMemory) reject(new ExportOutOfMemoryError());
      else if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.gif!);
    };
    // Frame buffers are transferred to the worker, so there is no main-thread
    // retry; an uncaught worker error is most often an allocation failure.
    worker.onerror = () => {
      worker.terminate();
      reject(new ExportOutOfMemoryError());
    };

    try {
      worker.postMessage(
        {
          frames: frames.map((f) => ({
            width: f.width,
            height: f.height,
            data: f.data,
          })),
          delayMs,
          maxBytes,
        },
        frames.map((f) => f.data.buffer),
      );
    } catch (err) {
      worker.terminate();
      reject(err instanceof RangeError ? new ExportOutOfMemoryError() : err);
    }
  });
}

function encodeGifSync(frames: ImageData[], delayMs: number): Uint8Array {
  const gif = GIFEncoder();
  for (const frame of frames) {
    const palette = quantize(frame.data, 256);
    const index = applyPalette(frame.data, palette);
    gif.writeFrame(index, frame.width, frame.height, {
      palette,
      delay: delayMs,
    });
  }
  gif.finish();
  return gif.bytes();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        (timer = setTimeout(() => reject(new Error("Export timeout")), ms)),
      ),
    ]);
  } catch (err) {
    // Out-of-memory needs its own message rather than the timeout fallback.
    if (err instanceof ExportOutOfMemoryError) throw err;
    if (err instanceof RangeError) throw new ExportOutOfMemoryError();
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadAnimatedGif(
  data: ShareAnimationData,
  onProgress: (p: AnimationExportProgress) => void,
  fallbackElement?: HTMLElement,
): Promise<void> {
  const run = async () => {
    const startedAt = performance.now();
    const frames = await captureFrames(data, onProgress);
    const capturedAt = performance.now();
    onProgress({ phase: "encoding", progress: 50, message: "Encoding GIF..." });

    const gifBytes = await encodeGifInWorker(
      frames,
      FRAME_INTERVAL_MS,
      GIF_MAX_BYTES,
      (fraction) =>
        onProgress({
          phase: "encoding",
          progress: 50 + Math.round(fraction * 40),
          message: `Encoding GIF... ${Math.round(fraction * 100)}%`,
        }),
    );
    // Recorded so export-duration regressions are visible in logs/profiles.
    log.info("GIF export timing", {
      captureMs: Math.round(capturedAt - startedAt),
      encodeMs: Math.round(performance.now() - capturedAt),
      bytes: gifBytes.byteLength,
    });

    onProgress({ phase: "encoding", progress: 90, message: "Finalizing..." });
    downloadBlob(
      new Blob([new Uint8Array(gifBytes)], { type: "image/gif" }),
      "stellar-wrapped-2026.gif",
    );
    onProgress({ phase: "done", progress: 100, message: "Done" });
  };

  await withTimeout(run(), MAX_EXPORT_TIMEOUT_MS, async () => {
    if (fallbackElement) await downloadShareImage(fallbackElement);
    throw new Error("GIF export timed out — downloaded PNG instead");
  });
}

export async function downloadAnimatedVideo(
  data: ShareAnimationData,
  onProgress: (p: AnimationExportProgress) => void,
  fallbackElement?: HTMLElement,
): Promise<void> {
  const run = async () => {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder not supported");
    }

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    const stream = canvas.captureStream(1000 / FRAME_INTERVAL_MS);
    const mimeType = MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 1_200_000,
    });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = () => reject(new Error("Recording failed"));
    });

    recorder.start();
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed > ANIMATION_DURATION_MS) {
        recorder.stop();
        return;
      }
      drawAnimatedFrame(ctx, data, elapsed);
      onProgress({
        phase: "capturing",
        progress: Math.min(90, Math.round((elapsed / ANIMATION_DURATION_MS) * 90)),
        message: "Recording video...",
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const blob = await done;
    void VIDEO_MAX_BYTES;
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    downloadBlob(blob, `stellar-wrapped-2026.${ext}`);
    onProgress({ phase: "done", progress: 100, message: "Done" });
  };

  await withTimeout(run(), MAX_EXPORT_TIMEOUT_MS, async () => {
    if (fallbackElement) await downloadShareImage(fallbackElement);
    throw new Error("Video export timed out — downloaded PNG instead");
  });
}
