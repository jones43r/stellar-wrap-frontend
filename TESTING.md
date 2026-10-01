# Testing Strategy

This document records which test runner executes which suite, why the split
exists today, and the target state for consolidating onto a single runner.

## Current state

`package.json` currently wires the suites to two different runners:

| Script | Runner | Config |
| --- | --- | --- |
| `test:unit` | Jest | `jest.config.js` |
| `test:components` | Jest | `jest.config.components.js` |
| `test:integration` | Vitest | `vitest.config.ts` |
| `test:hooks` | Vitest | `vitest.hooks.config.ts` |

That means two mocking APIs (`jest.mock` vs `vi.mock`), two setup files, and
two transform pipelines for what is, in practice, one JavaScript/TypeScript
codebase. A contributor adding a new test has no stated rule for which runner
to reach for.

### Why the split exists

The split is **accidental, not principled**. It grew out of the order in which
suites were added:

- The unit and component suites were written first, when Jest was the default
  in the project template.
- The integration and hook suites were added later by contributors who were
  already using Vitest elsewhere; they brought their own config rather than
  extending the Jest setup.

No suite depends on a capability that is unique to its current runner. The
four configs differ only in `testMatch`/`include` globs, `testEnvironment`, and
setup-file wiring — all of which a single runner can express per-project.

## Target state

**Vitest is the surviving runner for both the unit and integration suites.**

Rationale, based on the actual transform and mocking story rather than
assumption:

- **Transform:** Vitest uses Vite's transform pipeline, which handles the
  project's TypeScript and ESM sources without the extra Babel/SWC layer Jest
  needs. The project is not Vite-based, but the transform story still works:
  Vitest resolves and transforms the same `src/**` modules the suites import,
  and the existing `vitest.config.ts` already proves this for the integration
  and hook suites.
- **Mocking:** `vi.mock`/`vi.fn`/`vi.spyOn` cover the module and timer mocking
  the unit and component suites rely on, so no Jest-only mocking API is
  required.
- **Environment:** Vitest's `environment` option (`node` vs `jsdom`) covers the
  node-only unit tests and the DOM-dependent component tests, so the two Jest
  configs collapse into per-project settings on one config.

## Migration

Migrate in **one pass**, not file by file:

1. Point `test:unit` and `test:components` at Vitest.
2. Convert the Jest suites' `jest.mock`/`jest.fn`/`jest.spyOn` calls to the
   `vi.*` equivalents and import `{ describe, it, expect, vi }` from `vitest`.
3. Replace the Jest setup file with the Vitest setup file so both suites share
   one setup path.
4. Remove `jest.config.js` and `jest.config.components.js` once no suite
   references them.

## Configs after migration

Collapse the four configs to the minimum the surviving runner needs — one
config per genuinely distinct environment:

- `vitest.config.ts` — the single config, with a `node` project for the unit
  suite and a `jsdom` project for the component suite.
- `vitest.hooks.config.ts` — retained only if the hook suite genuinely needs a
  distinct environment from the two above; otherwise fold it into
  `vitest.config.ts` as a third project.

`jest.config.js` and `jest.config.components.js` are deleted.

## Done criteria

- One runner (Vitest) executes the unit and integration suites.
- One config per genuinely distinct environment, with no Jest configs left.
- This document states the boundary so a contributor knows which runner to use
  for a new test.

## Config wiring (issue #596)

Every config file in the repo must be invoked by a script, or deleted. The
current wiring is:

| Config | Invoked by |
| --- | --- |
| `vitest.config.ts` | `test:unit`, `test:components`, `test:integration` |
| `vitest.hooks.config.ts` | `test:hooks` |

`jest.config.js` and `jest.config.components.js` are no longer referenced by
any script and have been deleted, so no config is dead. The component suite
runs under the `jsdom` project in `vitest.config.ts` via `test:components`,
which means the component tests referenced by open issues #418, #420, #422,
and #488 will execute once written — they are picked up by the same
`test:components` script and CI job as the rest of the component suite.

## Visual Regression Tests

Visual regression and E2E tests remain on Playwright, separate from the
unit/integration runner consolidation.

Share card screenshots are tested with Playwright at the card's native
`1080x1080` resolution. The suite covers all five color themes, short and long
persona names, transaction counts of `1`, `100`, and `999,999`, and missing
archetype/vibe data.

```bash
# Run visual comparisons against committed baselines
pnpm test:visual

# Update baselines after an intentional ShareImageCard visual change
pnpm test:visual:update
```

Review the generated image changes before committing updated baselines. Visual
tests fail when the screenshot diff exceeds `0.1%`.

### Visual Regression Workflow

Visual baselines are committed image files, not build artifacts. They live next
to the spec that produces them and are checked into git so a baseline change is
reviewable as an image diff in the pull request:

```
e2e/
├── share-card.spec.ts
└── share-card.spec.ts-snapshots/
    ├── share-card-<theme>-<case>-chromium-linux.png
    └── ...
```

**When to run `pnpm test:visual:update`**

Only run the update command when the visual change is intentional and is the
point of your pull request — for example, a deliberate `ShareImageCard`
redesign, a copy change, or a new theme. Do **not** run it to make an unrelated
red suite go green: a diff caused by a styling change you did not intend to make
is a regression and should be fixed, not re-baselined.

**What a baseline change requires in review**

1. Open a dedicated pull request whose stated purpose is the visual change.
2. Include before/after screenshots (or the committed image diff) in the PR
description so reviewers can see exactly what moved.
3. Call out the affected themes/cases and confirm the change is intentional.
4. Get an explicit approval from a maintainer on the image diff before merging.

**Pinned rendering environment**

Font availability differs between a developer's machine and CI, which is the
usual source of false diffs. Baselines are therefore generated and compared in
the same pinned environment:

- The `visual-chromium` Playwright project runs Chromium on Linux, matching the
  CI runner. Baselines are named with the `-chromium-linux` suffix so a
  platform mismatch is obvious rather than silently passing.
- The container image used by CI pins the font set (including the fonts the
  share card relies on), so text metrics are identical locally and in CI.
- Run visual tests through the same container/CI image when updating baselines
  locally; do not regenerate baselines on macOS or Windows, where system fonts
  differ and would produce environment-driven false positives.

**CI behavior**

Visual tests run in CI against the committed baselines. CI never runs
`test:visual:update`; it only compares, so a stale or missing baseline fails the
build instead of being silently rewritten. If CI reports a visual diff, either
fix the unintended change or, for an intentional change, regenerate the
baselines in the pinned environment and commit them in the same PR.
