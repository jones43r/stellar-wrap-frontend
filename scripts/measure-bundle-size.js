#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getGzipSize(filePath) {
  const content = fs.readFileSync(filePath);
  return zlib.gzipSync(content).length;
}

function getChunkSizeForManifest(manifestPath) {
  const manifest = readJson(manifestPath);
  const chunkFiles = [...(manifest.rootMainFiles || []), ...(manifest.polyfillFiles || [])];

  return chunkFiles.reduce((total, relativePath) => {
    const fullPath = path.join(process.cwd(), ".next", relativePath);
    return total + (fs.existsSync(fullPath) ? getGzipSize(fullPath) : 0);
  }, 0);
}

function main() {
  const reportPath = path.join(process.cwd(), ".size-limit-report.json");
  const buildManifestPath = path.join(process.cwd(), ".next/build-manifest.json");
  const landingManifestPath = path.join(process.cwd(), ".next/server/app/page/build-manifest.json");
  const shareManifestPath = path.join(
    process.cwd(),
    ".next/server/app/share/page/build-manifest.json"
  );

  if (
    !fs.existsSync(buildManifestPath) ||
    !fs.existsSync(landingManifestPath) ||
    !fs.existsSync(shareManifestPath)
  ) {
    console.error("Build output not found. Run `npm run build` first.");
    process.exit(1);
  }

  // Measure archetype images size
  const archetypesDir = path.join(process.cwd(), "public/archetypes");
  let archetypesTotal = 0;
  let archetypeMax = 0;
  if (fs.existsSync(archetypesDir)) {
    const files = fs.readdirSync(archetypesDir, { withFileTypes: true });
    for (const file of files) {
      if (
        file.isFile() &&
        (file.name.endsWith(".png") ||
          file.name.endsWith(".webp") ||
          file.name.endsWith(".jpg") ||
          file.name.endsWith(".jpeg"))
      ) {
        const size = fs.statSync(path.join(archetypesDir, file.name)).size;
        archetypesTotal += size;
        if (size > archetypeMax) {
          archetypeMax = size;
        }
      }
    }
  }

  const payload = {
    "first-load": getChunkSizeForManifest(buildManifestPath),
    landing: getChunkSizeForManifest(landingManifestPath),
    share: getChunkSizeForManifest(shareManifestPath),
    "archetype-images-total": archetypesTotal,
    "archetype-image-max": archetypeMax,
  };

  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main();
