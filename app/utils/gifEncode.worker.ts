import { GIFEncoder, quantize, applyPalette } from "gifenc";

interface FramePayload {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface EncodeRequest {
  frames: FramePayload[];
  delayMs: number;
  /** When the first encode exceeds this size, re-encode every other frame. */
  maxBytes?: number;
}

function encode(
  frames: FramePayload[],
  delayMs: number,
  onFrame: (done: number, total: number) => void,
): Uint8Array {
  const gif = GIFEncoder();
  frames.forEach((frame, i) => {
    const palette = quantize(frame.data, 256);
    const index = applyPalette(frame.data, palette);
    gif.writeFrame(index, frame.width, frame.height, { palette, delay: delayMs });
    onFrame(i + 1, frames.length);
  });
  gif.finish();
  return gif.bytes();
}

function isOutOfMemory(err: unknown): boolean {
  return (
    err instanceof RangeError ||
    (err instanceof Error && /out of memory|allocation failed|array buffer/i.test(err.message))
  );
}

self.onmessage = (e: MessageEvent<EncodeRequest>) => {
  try {
    const { frames, delayMs, maxBytes } = e.data;
    // First pass reports 0–0.8, an optional reduced pass reports 0.8–1.
    let gif = encode(frames, delayMs, (done, total) =>
      self.postMessage({ progress: (done / total) * 0.8 }),
    );
    if (maxBytes && gif.byteLength > maxBytes) {
      const reduced = frames.filter((_, i) => i % 2 === 0);
      gif = encode(reduced, delayMs * 2, (done, total) =>
        self.postMessage({ progress: 0.8 + (done / total) * 0.2 }),
      );
    }
    self.postMessage({ gif }, { transfer: [gif.buffer] });
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : "GIF encoding failed",
      outOfMemory: isOutOfMemory(err),
    });
  }
};

export {};
