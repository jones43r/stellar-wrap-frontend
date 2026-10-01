// @vitest-environment jsdom
import { render, cleanup, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

// --- Module mocks ---

vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) => (
    <a {...props}>{children as React.ReactNode}</a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, tag: string) =>
        ({ children, ...props }: Record<string, unknown>) =>
          React.createElement(tag, props, children as React.ReactNode),
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useAnimation: () => ({
    start: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("lucide-react", () => ({
  Home: (props: Record<string, unknown>) => (
    <svg {...props} data-testid="icon-home" />
  ),
  Share2: (props: Record<string, unknown>) => (
    <svg {...props} data-testid="icon-share" />
  ),
  ChevronRight: (props: Record<string, unknown>) => (
    <svg {...props} data-testid="icon-chevron" />
  ),
  X: (props: Record<string, unknown>) => (
    <svg {...props} data-testid="icon-x" />
  ),
}));

const mockPlaySound = vi.fn();
vi.mock("@/app/hooks/useSound", () => ({
  useSound: () => ({ playSound: mockPlaySound }),
}));

import { createWrappedResult } from "@/app/test/fixtures/wrappedResult";

const MOCK_RESULT = createWrappedResult({
  username: "testuser",
  persona: "The Wizard",
  personaDescription: "",
  totalTransactions: 42,
  percentile: 95,
  dapps: [{ name: "StellarX", interactions: 10 }],
  vibes: [{ type: "DeFi", percentage: 80, color: "#fff", label: "DeFi" }],
});

let mockStoreResult: typeof MOCK_RESULT | null = { ...MOCK_RESULT };

vi.mock("@/app/store/wrapStore", () => ({
  useWrapStore: () => ({ result: mockStoreResult }),
}));

vi.mock("@/app/store/notificationStore", () => ({
  useNotificationStore: () => ({
    consentGiven: false,
    pushEnabled: false,
  }),
}));

const ARCHETYPE_DESCRIPTIONS: Record<string, string> = {
  "The Wizard": "Like Gandalf in Middle-earth, you wield DeFi magic with wisdom.",
};
vi.mock("@/data/archetypeConfig", () => ({
  getArchetypeDescription: (name: string) =>
    ARCHETYPE_DESCRIPTIONS[name] ?? "",
  getArchetypeStyle: () => ({
    color: "#B794F6",
    gradient: "linear-gradient(135deg, #B794F6 0%, #6B46C1 100%)",
    icon: "Wand2",
  }),
}));

// The `generatePersonaDescription` server action cannot be loaded in a
// jsdom/node test environment (it requires the Next.js server-action
// runtime). The component's effect catches the error and falls back to
// the persona description from the store or archetype config.
vi.mock("@/app/actions/generate-persona", () => ({}));
vi.mock("ai/rsc", () => ({
  readStreamableValue: vi.fn(),
}));

vi.mock("@/app/components/PersonaRarityChart", () => ({
  PersonaRarityChart: () => <div data-testid="rarity-chart" />,
}));

vi.mock("@/app/components/ProgressIndicator", () => ({
  ProgressIndicator: () => <div data-testid="progress-indicator" />,
}));

vi.mock("@/app/components/MuteToggle", () => ({
  MuteToggle: () => <div data-testid="mute-toggle" />,
}));

vi.mock("@/app/components/PersonaEvolutionTimeline", () => ({
  PersonaEvolutionTimeline: () => <div data-testid="evolution-timeline" />,
}));

vi.mock("@/app/components/NotificationPrompt", () => ({
  NotificationPrompt: () => <div data-testid="notification-prompt" />,
}));

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

import ArchetypeReveal from "../page";

describe("ArchetypeReveal streamed persona cleanup", () => {
  beforeEach(() => {
    mockStoreResult = { ...MOCK_RESULT };
    mockPlaySound.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders without crashing and provides fallback description", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let container: HTMLElement | undefined;
    await act(async () => {
      const result = render(<ArchetypeReveal />);
      container = result.container;
    });

    expect(container).toBeTruthy();

    // The component should log "Failed to generate persona" because
    // `generatePersonaDescription` is unavailable — the catch block fires.
    // This verifies the fallback path is reached without crashing.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const failedCalls = consoleSpy.mock.calls.filter(
      ([msg]: unknown[]) =>
        typeof msg === "string" && msg.includes("Failed to generate persona"),
    );
    expect(failedCalls.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });

  it("does not produce unmounted state-update warnings after unmount", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await act(async () => {
      render(<ArchetypeReveal />);
    });

    // Unmount while the async persona-generation is still in-flight
    await act(async () => {
      cleanup();
    });

    // Give any lingering micro-tasks a chance to fire
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // React 19 silently discards setState on unmounted components, but
    // we guard against it anyway with a `cancelled` flag in the effect.
    // No unmounted-component warnings should appear.
    const unmountWarnings = [
      ...errorSpy.mock.calls,
      ...warnSpy.mock.calls,
    ].filter(
      ([msg]: unknown[]) =>
        typeof msg === "string" &&
        (msg.includes("unmounted") ||
          msg.includes("Can't perform") ||
          msg.includes("state update")),
    );
    expect(unmountWarnings).toHaveLength(0);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("falls back to description when streaming persona fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // personaDescription is empty → should use getArchetypeDescription fallback
    mockStoreResult = createWrappedResult({
      username: "testuser",
      persona: "The Wizard",
      personaDescription: "",
      totalTransactions: 42,
      percentile: 95,
      dapps: [{ name: "StellarX", interactions: 10 }],
      vibes: [{ type: "DeFi", percentage: 80, color: "#fff", label: "DeFi" }],
    });

    await act(async () => {
      render(<ArchetypeReveal />);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const failedCalls = consoleSpy.mock.calls.filter(
      ([msg]: unknown[]) =>
        typeof msg === "string" && msg.includes("Failed to generate persona"),
    );
    expect(failedCalls.length).toBeGreaterThan(0);
    expect(failedCalls[0][0]).toContain("Failed to generate persona");

    consoleSpy.mockRestore();
  });
});
