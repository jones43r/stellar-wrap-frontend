#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, parse } from "node:path";
import sharp from "sharp";

const archetypesDir = process.argv[2] ?? "public/archetypes";
const ogDir = join(archetypesDir, "og");
const responsiveDir = join(archetypesDir, "responsive");

// Ensure target directories exist
await mkdir(ogDir, { recursive: true });
await mkdir(join(responsiveDir, "64"), { recursive: true });
await mkdir(join(responsiveDir, "128"), { recursive: true });
await mkdir(join(responsiveDir, "256"), { recursive: true });

// Read existing images from public/archetypes
const entries = await readdir(archetypesDir, { withFileTypes: true });
const stats = [];

for (const entry of entries) {
  if (!entry.isFile()) continue;
  const ext = entry.name.toLowerCase().slice(entry.name.lastIndexOf("."));
  if (ext !== ".png" && ext !== ".jpg" && ext !== ".jpeg") continue;

  const baseName = parse(entry.name).name;
  if (baseName.endsWith("-og") || baseName.endsWith(".og")) continue;

  const inputPath = join(archetypesDir, entry.name);
  const inputBuffer = await readFile(inputPath);
  const initialSize = inputBuffer.length;

  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const maxDim = Math.min(metadata.width || 512, metadata.height || 512, 512);

  // 1. Generate modern format (.webp) at max 512x512
  const webpBuffer = await sharp(inputBuffer)
    .resize({ width: maxDim, height: maxDim, fit: "cover" })
    .webp({ quality: 82, effort: 6 })
    .toBuffer();
  const webpPath = join(archetypesDir, `${baseName}.webp`);
  await writeFile(webpPath, webpBuffer);

  // 2. Generate optimized fallback (.png) at max 512x512
  const pngBuffer = await sharp(inputBuffer)
    .resize({ width: maxDim, height: maxDim, fit: "cover" })
    .png({ quality: 85, compressionLevel: 9, palette: true })
    .toBuffer();
  // Keep original buffer if it was already valid PNG and smaller
  const finalPngBuffer =
    initialSize < pngBuffer.length &&
    ext === ".png" &&
    inputBuffer.slice(0, 8).toString("hex") === "89504e470d0a1a0a"
      ? inputBuffer
      : pngBuffer;
  const pngPath = join(archetypesDir, `${baseName}.png`);
  await writeFile(pngPath, finalPngBuffer);

  // 3. Generate pre-sized OG asset (200x200 PNG) for OG route
  const ogBuffer = await sharp(inputBuffer)
    .resize({ width: 200, height: 200, fit: "cover" })
    .png({ quality: 85, compressionLevel: 9, palette: true })
    .toBuffer();
  const ogPath = join(ogDir, `${baseName}.png`);
  await writeFile(ogPath, ogBuffer);

  // 4. Generate responsive sizes (64x64, 128x128, 256x256) in webp and png
  for (const size of [64, 128, 256]) {
    const respWebp = await sharp(inputBuffer)
      .resize({ width: size, height: size, fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
    await writeFile(join(responsiveDir, String(size), `${baseName}.webp`), respWebp);

    const respPng = await sharp(inputBuffer)
      .resize({ width: size, height: size, fit: "cover" })
      .png({ quality: 80, compressionLevel: 9, palette: true })
      .toBuffer();
    await writeFile(join(responsiveDir, String(size), `${baseName}.png`), respPng);
  }

  stats.push({
    persona: baseName,
    "original (bytes)": initialSize,
    "fallback PNG (bytes)": pngBuffer.length,
    "WebP (bytes)": webpBuffer.length,
    "OG 200x200 (bytes)": ogBuffer.length,
    "WebP savings": (((initialSize - webpBuffer.length) / initialSize) * 100).toFixed(1) + "%",
  });
}

console.log("\n📦 Archetype Image Optimization Summary:");
console.table(stats);
