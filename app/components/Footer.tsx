import Link from "next/link";
import { ActiveContractAddress } from "./ActiveContractAddress";

const SOCIAL_LINKS = [
  { label: "GitHub", href: "https://github.com/zintarh/stellar-wrap-frontend", icon: "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 7.85c.85 0 1.71.12 2.51.35 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" },
  { label: "Stellar", href: "https://stellar.org", icon: "M3 7.5h10.2a3.8 3.8 0 0 1 0 7.6H7a2.2 2.2 0 1 0 0 4.4h10M21 16.5H10.8a3.8 3.8 0 0 1 0-7.6H17a2.2 2.2 0 1 0 0-4.4H7" },
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 px-4 py-8 text-sm text-white/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-white">Stellar Wrap</p>
          <p className="mt-1 text-xs text-white/60">Your on-chain year in review.</p>
          <ActiveContractAddress />
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-4">
          <Link
            className="transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded"
            href="/"
          >
            Home
          </Link>
          {SOCIAL_LINKS.map(({ label, href, icon }) => (
            <a
              key={label}
              aria-label={label}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                aria-hidden="true"
                focusable="false"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
