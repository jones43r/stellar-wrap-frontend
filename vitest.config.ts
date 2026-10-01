import { defineConfig } from "vitest/config";
import path from "path";

// Single runner for the unit and integration suites (issue #595).
// Jest previously handled `test:unit` while Vitest handled `test:integration`
// and `test:hooks`; the split was accidental, so everything now runs under
// Vitest. This config covers the node environment (unit + integration);
// component tests keep their own jsdom config in vitest.hooks.config.ts.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "**/__tests__/**/*.test.[jt]s?(x)",
      "**/__tests__/**/*.comprehensive.test.[jt]s?(x)",
      "**/__tests__/**/*.edge.test.[jt]s?(x)",
      "**/__tests__/**/*.integration.test.[jt]s?(x)",
    ],
    exclude: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "**/*.hooks.test.[jt]s?(x)",
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '.next/**',
        'coverage/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/**',
      ],
    },
  },
  resolve: {
    alias: [
      { find: "@/data", replacement: path.resolve(__dirname, "./src/data") },
      { find: "@", replacement: path.resolve(__dirname, "./") },
    ],
  },
});
