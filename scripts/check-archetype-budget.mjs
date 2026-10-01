#!/usr/bin/env node
import { readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";

const archetypesDir = join(process.cwd(), "public/archetypes");
const ogDir = join(archetypesDir, "og");
const budgetsPath = join(process.cwd(), ".size-limit.json");

let maxSingleBudget = 150 * 1024; // 150 KB
let totalBudget = 450 * 1024; // 450 KB

try {
  const budgets = JSON.parse(await readFile(budgetsPath, "utf8"));
  if (budgets["archetype-image-max"]) maxSingleBudget = budgets["archetype-image-max"];
  if (budgets["archetype-images-total"]) totalBudget = budgets["archetype-images-total"];
} catch {
  // Use defaults
}

const entries = await readdir(archetypesDir, { withFileTypes: true });
let totalBytes = 0;
let maxSingleBytes = 0;
let maxSingleName = "";
const errors = [];
const imageList = [];

for (const entry of entries) {
  if (!entry.isFile()) continue;
  if (!entry.name.match(/\.(png|webp|jpg|jpeg)$/i)) continue;

  const filePath = join(archetypesDir, entry.name);
  const fileStat = await stat(filePath);
  const size = fileStat.size;

  totalBytes += size;
  if (size > maxSingleBytes) {
    maxSingleBytes = size;
    maxSingleName = entry.name;
  }

  imageList.push({ name: entry.name, size: `${(size / 1024).toFixed(1)} KB` });

  if (size > maxSingleBudget) {
    errors.push(
      `❌ Image "${entry.name}" exceeds single image budget: ${(size / 1024).toFixed(1)} KB > ${(maxSingleBudget / 1024).toFixed(1)} KB`
    );
  }
}

if (totalBytes > totalBudget) {
  errors.push(
    `❌ Total archetype image size exceeds budget: ${(totalBytes / 1024).toFixed(1)} KB > ${(totalBudget / 1024).toFixed(1)} KB`
  );
}

console.log("📊 Archetype Image Budget Check:");
console.table(imageList);
console.log(
  `Total Size: ${(totalBytes / 1024).toFixed(1)} KB / ${(totalBudget / 1024).toFixed(1)} KB`
);
console.log(
  `Largest File (${maxSingleName}): ${(maxSingleBytes / 1024).toFixed(1)} KB / ${(maxSingleBudget / 1024).toFixed(1)} KB`
);

if (errors.length > 0) {
  console.error("\n❌ Archetype image size budget exceeded:");
  errors.forEach((e) => console.error(e));
  process.exit(1);
} else {
  console.log("\n✅ All archetype images are within the size budget!");
}
