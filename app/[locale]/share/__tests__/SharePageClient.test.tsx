import { render, screen, fireEvent } from "@testing-library/react";
import SharePageClient from "../SharePageClient";
import { createWrappedResult } from "@/app/api/wrapped/__tests__/fixtures/wrappedResult";

// Mock the dependencies
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/app/data/mockData", () => ({
  mockData: {
    username: "testuser",
    transactions: 100,
    persona: "Explorer",
    vibes: [{ label: "Curious", percentage: 85 }],
  },
}));

jest.mock("@/src/data/mockData", () => ({
  GOLDEN_USER: {
    archetype: { image: "test-image.png" },
  },
}));

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({ color: "green" }),
  themeColors: {
    green: { primary: "#00ff00" },
  },
}));

let mockPeriod = "yearly";
jest.mock("../store/wrapStore", () => ({
  useWrapStore: () => ({
    address: "test-address",
    network: "mainnet",
    period: mockPeriod,
    result: createWrappedResult({
      username: "testuser",
      totalTransactions: 100,
      persona: "Explorer",
      vibes: [{ label: "Curious", percentage: 85 }],
    }),
  }),
  __setMockPeriod: (period: string) => {
    mockPeriod = period;
  },
}));

jest.mock("../../utils/plausible", () => ({
  trackEvent: jest.fn(),
}));

describe("SharePageClient", () => {
  let originalWindow: Window;

  beforeEach(() => {
    originalWindow = global.window;
    global.window = Object.create(window);
    global.window.location = { href: "https://example.com/share" } as any;
    // Mock window.open
    global.window.open = jest.fn();
  });

  afterEach(() => {
    global.window = originalWindow;
    jest.clearAllMocks();
  });

  it("should render share button", () => {
    render(<SharePageClient />);
    const shareButton = screen.getByRole("button");
    expect(shareButton).toBeInTheDocument();
  });

  it("should open share menu when share button is clicked", () => {
    render(<SharePageClient />);
    const shareButton = screen.getByRole("button");
    fireEvent.click(shareButton);

    // Check if share menu items appear
    expect(screen.getByText("x")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Facebook")).toBeInTheDocument();
  });

  it("should call handleShare with correct platform for WhatsApp button", () => {
    render(<SharePageClient />);
    const shareButton = screen.getByRole("button");
    fireEvent.click(shareButton);

    const whatsappButton = screen.getByText("WhatsApp").closest("button");
    fireEvent.click(whatsappButton!);

    expect(global.window.open).toHaveBeenCalledWith(
      expect.stringContaining("wa.me"),
      "_blank",
      expect.any(String)
    );
  });

  it("should call handleShare with correct platform for X button", () => {
    render(<SharePageClient />);
    const shareButton = screen.getByRole("button");
    fireEvent.click(shareButton);

    const xButton = screen.getByText("x").closest("button");
    fireEvent.click(xButton!);

    expect(global.window.open).toHaveBeenCalledWith(
      expect.stringContaining("twitter.com"),
      "_blank",
      expect.any(String)
    );
  });

  it("should generate different share URLs for different platforms", () => {
    render(<SharePageClient />);
    const shareButton = screen.getByRole("button");
    fireEvent.click(shareButton);

    const xButton = screen.getByText("x").closest("button");
    const whatsappButton = screen.getByText("WhatsApp").closest("button");

    fireEvent.click(xButton!);
    const xCall = (global.window.open as jest.Mock).mock.calls[0][0];

    (global.window.open as jest.Mock).mockClear();
    fireEvent.click(whatsappButton!);
    const whatsappCall = (global.window.open as jest.Mock).mock.calls[0][0];

    // Verify URLs are different
    expect(xCall).not.toBe(whatsappCall);
    expect(xCall).toContain("twitter.com");
    expect(whatsappCall).toContain("wa.me");
  });

  it("should prevent platform-to-handler mismatches - WhatsApp should not open Twitter", () => {
    render(<SharePageClient />);
    const shareButton = screen.getByRole("button");
    fireEvent.click(shareButton);

    const whatsappButton = screen.getByText("WhatsApp").closest("button");
    fireEvent.click(whatsappButton!);

    const callUrl = (global.window.open as jest.Mock).mock.calls[0][0];

    // WhatsApp should NOT open Twitter URL
    expect(callUrl).not.toContain("twitter.com");
    expect(callUrl).toContain("wa.me");
  });

  it("should prevent platform-to-handler mismatches - X should not open WhatsApp", () => {
    render(<SharePageClient />);
    const shareButton = screen.getByRole("button");
    fireEvent.click(shareButton);

    const xButton = screen.getByText("x").closest("button");
    fireEvent.click(xButton!);

    const callUrl = (global.window.open as jest.Mock).mock.calls[0][0];

    // X should NOT open WhatsApp URL
    expect(callUrl).not.toContain("wa.me");
    expect(callUrl).toContain("twitter.com");
  });

  it("should include period in share text for weekly", () => {
    const { __setMockPeriod } = require("../store/wrapStore") as any;
    __setMockPeriod("weekly");

    render(<SharePageClient />);
    const shareButton = screen.getByRole("button");
    fireEvent.click(shareButton);

    const xButton = screen.getByText("x").closest("button");
    fireEvent.click(xButton!);

    const callUrl = (global.window.open as jest.Mock).mock.calls[0][0];
    expect(decodeURIComponent(callUrl)).toContain("weekly Stellar Wrapped");
  });

  it("should include period in share text for monthly", () => {
    const { __setMockPeriod } = require("../store/wrapStore") as any;
    __setMockPeriod("monthly");

    render(<SharePageClient />);
    const shareButton = screen.getByRole("button");
    fireEvent.click(shareButton);

    const xButton = screen.getByText("x").closest("button");
    fireEvent.click(xButton!);

    const callUrl = (global.window.open as jest.Mock).mock.calls[0][0];
    expect(decodeURIComponent(callUrl)).toContain("monthly Stellar Wrapped");
  });

  it("should include period in share text for yearly", () => {
    const { __setMockPeriod } = require("../store/wrapStore") as any;
    __setMockPeriod("yearly");

    render(<SharePageClient />);
    const shareButton = screen.getByRole("button");
    fireEvent.click(shareButton);

    const xButton = screen.getByText("x").closest("button");
    fireEvent.click(xButton!);

    const callUrl = (global.window.open as jest.Mock).mock.calls[0][0];
    expect(decodeURIComponent(callUrl)).toContain("yearly Stellar Wrapped");
  });
});
