/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { Footer } from "../Footer";

jest.mock("../../store/wrapStore", () => ({
  useWrapStore: (selector: (state: { network: string }) => unknown) =>
    selector({ network: "testnet" }),
}));

describe("Footer", () => {
  it("renders the footer landmark element", () => {
    render(<Footer />);

    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("renders the brand name and tagline", () => {
    render(<Footer />);

    expect(screen.getByText("Stellar Wrap")).toBeInTheDocument();
    expect(screen.getByText("Your on-chain year in review.")).toBeInTheDocument();
  });

  it("renders the footer navigation landmark with an accessible label", () => {
    render(<Footer />);

    expect(
      screen.getByRole("navigation", { name: "Footer navigation" }),
    ).toBeInTheDocument();
  });

  it("renders the Home link inside the footer navigation", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
  });

  it("renders all social links with correct href, label, and rel attributes", () => {
    render(<Footer />);

    const githubLink = screen.getByRole("link", { name: "GitHub" });
    expect(githubLink).toHaveAttribute(
      "href",
      "https://github.com/zintarh/stellar-wrap-frontend",
    );
    expect(githubLink).toHaveAttribute("target", "_blank");
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer");

    const stellarLink = screen.getByRole("link", { name: "Stellar" });
    expect(stellarLink).toHaveAttribute("href", "https://stellar.org");
    expect(stellarLink).toHaveAttribute("target", "_blank");
    expect(stellarLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders social link text content for screen reader accessibility", () => {
    render(<Footer />);

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Stellar")).toBeInTheDocument();
  });

  it("marks decorative SVG icons as hidden from assistive technology", () => {
    render(<Footer />);

    const svgs = document.querySelectorAll("footer svg[aria-hidden='true']");
    expect(svgs.length).toBe(2);
  });

  it("prevents SVG icons from receiving focus in browsers that support focusable SVGs", () => {
    render(<Footer />);

    const svgs = document.querySelectorAll("footer svg[focusable='false']");
    expect(svgs.length).toBe(2);
  });

  it("applies a visible focus ring to the Home link for keyboard users", () => {
    render(<Footer />);

    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).toHaveClass("focus-visible:ring-2");
    expect(homeLink).toHaveClass("focus-visible:ring-white/60");
  });

  it("applies a visible focus ring to social links for keyboard users", () => {
    render(<Footer />);

    const githubLink = screen.getByRole("link", { name: "GitHub" });
    expect(githubLink).toHaveClass("focus-visible:ring-2");
    expect(githubLink).toHaveClass("focus-visible:ring-white/60");

    const stellarLink = screen.getByRole("link", { name: "Stellar" });
    expect(stellarLink).toHaveClass("focus-visible:ring-2");
    expect(stellarLink).toHaveClass("focus-visible:ring-white/60");
  });

  it("uses a contrast-friendly color for the copyright text", () => {
    render(<Footer />);

    const tagline = screen.getByText("Your on-chain year in review.");
    // text-white/60 is used (not text-white/40) to meet WCAG AA contrast.
    expect(tagline).toHaveClass("text-white/60");
  });

  it("renders the copyright text at a readable size", () => {
    render(<Footer />);

    const tagline = screen.getByText("Your on-chain year in review.");
    expect(tagline).toHaveClass("text-xs");
  });

  it("renders the brand name in a bold, high-contrast style", () => {
    render(<Footer />);

    const brand = screen.getByText("Stellar Wrap");
    expect(brand).toHaveClass("font-semibold");
    expect(brand).toHaveClass("text-white");
  });

  it("has no broken links — all href attributes are non-empty strings", () => {
    render(<Footer />);

    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      const href = link.getAttribute("href");
      expect(href).toBeTruthy();
      expect(typeof href).toBe("string");
      expect(href.length).toBeGreaterThan(0);
    });
  });

  it("renders the footer with the correct border and padding classes", () => {
    render(<Footer />);

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("border-t");
    expect(footer).toHaveClass("border-white/10");
    expect(footer).toHaveClass("px-4");
    expect(footer).toHaveClass("py-8");
  });

  it("renders the footer text at the expected size and color", () => {
    render(<Footer />);

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("text-sm");
    expect(footer).toHaveClass("text-white/60");
  });

  it("shows the active contract address for the current network", () => {
    render(<Footer />);

    expect(screen.getByTestId("active-contract-address")).toHaveTextContent(
      /Testnet contract:/,
    );
  });
});
