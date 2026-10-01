# Stellar Wrap  🎨✨

> **Turn your ledger data into social proof. A shareable, monthly summary of your impact on the Stellar network.**

![Stellar Wrap Landing Page](./public/stellar-wrap.png)
[![Lighthouse CI](https://github.com/zintarh/stellar-wrap-frontend/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/zintarh/stellar-wrap-frontend/actions/workflows/lighthouse.yml)

---

## 📖 What is Stellar Wrap?

Stellar Wrap is a "Spotify Wrapped"-style experience built specifically for the Stellar community.

Block explorers are great for data, but terrible for stories. Stellar Wrap takes your raw, complex on-chain history—transactions, smart contract deployments, NFT buys—and transforms it into a beautiful, personalized visual story that anyone can understand and share.

By simply connecting your wallet, you get a dynamic snapshot of your month on Stellar, highlighting your achievements and assigning you a unique on-chain persona based on your activity.

**It’s more than just stats; it’s a tool for builders to prove their contributions and for users to flex their participation in the Stellar ecosystem.**

---

## 💡 Why We Need This

In Web3, your on-chain history is your resume, your identity, and your reputation. But right now, that reputation is hidden behind confusing transaction hashes.

**Stellar Wrap solves the visibility gap:**

* **For Builders & Developers:** It's hard to showcase the immense value of deploying open-source Soroban contracts. Stellar Wrap makes their code contributions visible and shareable to non-technical users.
* **For the Community:** We lack easy, viral loops to share excitement about what’s happening on Stellar. This tool gives everyone a reason to post about their on-chain life on social media.
* **For Users:** It turns isolated transactions into a sense of progress and belonging within the ecosystem.

---

## 🚀 How It Works

1.  **Connect:** Connect your Stellar wallet (e.g., Freighter, xBull) to our web app.
2.  **Analyze:** Our backend crunches your on-chain history for the month, pulling data on payments, DEX trades, Soroban interactions, and NFTs.
3.  **Visualize:** The frontend presents this data as a slick, animated story, highlighting your key stats.
4.  **Persona:** Based on your specific behavior, you get assigned a fun archetype (e.g., *"The Soroban Architect," "The DeFi Patron," "The Diamond Hand"*).
5.  **Share:** Generate a beautiful, branded image card ready for one-click sharing to X (Twitter), Farcaster, etc.

### 🧪 Demo Mode

The **"try demo mode"** link on `/connect` walks through the full experience without a
wallet. Demo mode is **mock-only**:

- It uses the fixture address in [`app/data/demoAccount.ts`](app/data/demoAccount.ts) — a
  real, checksum-valid Stellar public key, so address validation behaves normally.
- Entering demo mode sets a session flag (`markDemoMode()`). The loading screen checks
  `isDemoMode()` and serves generated wrap data, so **demo mode never queries Horizon or
  the indexer**.
- The flag is cleared whenever `/connect` mounts, so a subsequent real wallet connection
  or manually entered address always runs against live data.

---

## 🏗️ Architecture Diagram

This diagram shows the complete data flow from wallet connection through to the share card generation, highlighting where Horizon API and Soroban contract interactions occur.

```mermaid
flowchart TD
    Wallet[("👛 Wallet<br/>(Freighter/Albedo/WalletConnect)")]
    
    subgraph Connect ["📱 Connect Phase"]
        ConnectPage["/connect<br/>Wallet Connection"]
        WalletConnect["WalletConnect<br/>Protocol"]
    end
    
    subgraph Indexing ["⚙️ Indexing Phase"]
        IndexerService["indexerService<br/>/api/wrapped"]
        HorizonAPI["🌐 Horizon API<br/>(Stellar RPC)"]
        IndexedDBCache["💾 IndexedDB Cache"]
    end
    
    subgraph StateManagement ["🗄️ State Management"]
        WrapStore[("useWrapperStore<br/>address, period, network,<br/>status, error, result")]
        RateLimitStore[("useRateLimitStore<br/>isRateLimited, resetTime")]
        TransactionStore[("useTransactionStore<br/>transactionHash, status")]
    end
    
    subgraph PersonaGeneration ["🎭 Persona Generation"]
        PersonaAction["generatePersonaDescription<br/>(AI Server Action)"]
        OpenAI["🤖 OpenAI GPT-4o-mini"]
    end
    
    subgraph SorobanContracts ["📜 Soroban Contracts"]
        ContractBridge["contractBridge.ts<br/>getContractInstance()"]
        SorobanRPC["🔗 Soroban RPC<br/>(Smart Contract Calls)"]
    end
    
    subgraph UIScreens ["🖥️ UI Screens"]
        LoadingPage["/loading<br/>Indexing Progress"]
        TopDapps["/top-daps<br/>DApp Interactions"]
        Transactions["/transactions-of-fury<br/>Transaction History"]
        VibeCheck["/vibe-check<br/>Vibe Analysis"]
        PersonaPage["/persona<br/>Persona Reveal"]
        SharePage["/share<br/>Share Card Generation"]
    end
    
    Wallet -->|"public key"| ConnectPage
    ConnectPage -->|"session"| WalletConnect
    WalletConnect -->|"address, network"| IndexerService
    
    IndexerService -->|"fetch account data"| HorizonAPI
    HorizonAPI -->|"transactions, payments"| IndexerService
    IndexerService -->|"cache results"| IndexedDBCache
    IndexedDBCache -->|"cached data"| IndexerService
    
    IndexerService -->|"wrapped data"| WrapStore
    IndexerService -->|"429 errors"| RateLimitStore
    
    WrapStore -->|"read data"| LoadingPage
    LoadingPage -->|"display progress"| TopDapps
    
    TopDapps -->|"read dapps"| WrapStore
    TopDapps -->|"navigate"| Transactions
    
    Transactions -->|"read transactions"| WrapStore
    Transactions -->|"navigate"| VibeCheck
    
    VibeCheck -->|"read vibes"| WrapStore
    VibeCheck -->|"navigate"| PersonaPage
    
    PersonaPage -->|"read metrics"| WrapStore
    PersonaPage -->|"stream persona"| PersonaAction
    PersonaAction -->|"generate description"| OpenAI
    OpenAI -->|"persona text"| PersonaAction
    PersonaPage -->|"navigate"| SharePage
    
    SharePage -->|"read address, network"| WrapStore
    SharePage -->|"mint action"| ContractBridge
    ContractBridge -->|"contract call"| SorobanRPC
    SorobanRPC -->|"transaction hash"| TransactionStore
    TransactionStore -->|"mint status"| SharePage
    
    classDef wallet fill:#dbeafe,stroke:#2563eb,color:#0f172a
    classDef connect fill:#e0e7ff,stroke:#4f46e5,color:#0f172a
    classDef indexing fill:#fef3c7,stroke:#d97706,color:#0f172a
    classDef state fill:#f8fafc,stroke:#64748b,color:#0f172a
    classDef persona fill:#fce7f3,stroke:#db2777,color:#0f172a
    classDef soroban fill:#ede9fe,stroke:#7c3aed,color:#0f172a
    classDef ui fill:#dcfce7,stroke:#16a34a,color:#0f172a
    
    class Wallet wallet
    class ConnectPage,WalletConnect connect
    class IndexerService,HorizonAPI,IndexedDBCache indexing
    class WrapStore,RateLimitStore,TransactionStore state
    class PersonaAction,OpenAI persona
    class ContractBridge,SorobanRPC soroban
    class LoadingPage,TopDapps,Transactions,VibeCheck,PersonaPage,SharePage ui
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Horizon API** | `src/services/horizonIndexer.ts` | Fetches account data, payments, and transactions from Stellar Horizon |
| **Indexer Service** | `app/services/indexerService.ts` | Orchestrates indexing with caching and rate limiting |
| **Zustand Stores** | `app/store/`, `src/store/` | Manages application state (wrap data, transactions, rate limits) |
| **Contract Bridge** | `app/utils/contractBridge.ts` | Interfaces with Soroban smart contracts for minting |
| **Persona Generator** | `app/actions/generate-persona.ts` | AI-powered persona description generation |

---

## User Journey Diagrams

These Mermaid diagrams are intentionally GitHub-compatible so new contributors can preview the full app journey directly in the README.

### User Flow

```mermaid
flowchart TD
  Landing["Landing<br/>/"]
  Connect["Connect<br/>/connect"]
  Manual["Manual address entry"]
  Freighter["Freighter wallet"]
  Albedo["Albedo wallet"]
  WalletConnect["WalletConnect wallet"]
  InvalidAddress["Invalid address error"]
  WalletDisconnected["Wallet disconnect or rejected connection"]
  Demo["Demo mode shortcut<br/>mock address + mock data"]
  Loading["Loading / Indexing<br/>/loading"]
  RateLimited["Horizon rate limiting<br/>retry / wait state"]
  IndexingFailure["Indexing failure<br/>fallback or recovery"]
  TopDapps["Top Dapps<br/>/top-daps"]
  Transactions["Transactions of Fury<br/>/transactions-of-fury"]
  VibeCheck["Vibe Check<br/>/vibe-check"]
  Persona["Persona Reveal<br/>/persona"]
  Share["Share<br/>/share"]
  Mint["Mint wrapped card<br/>wallet signing"]

  Landing --> Connect
  Connect --> Manual
  Connect --> Freighter
  Connect --> Albedo
  Connect --> WalletConnect
  Connect --> Demo

  Manual -->|valid Stellar address| Loading
  Manual -->|invalid format or failed validation| InvalidAddress
  Freighter -->|public key granted| Loading
  Freighter -->|rejected / unavailable| WalletDisconnected
  Albedo -->|public key granted| Loading
  Albedo -->|rejected / unavailable| WalletDisconnected
  WalletConnect -->|session approved| Loading
  WalletConnect -->|disconnect / rejection| WalletDisconnected
  Demo --> Loading

  Loading -->|7 indexing steps complete| TopDapps
  Loading -->|HTTP 429 from Horizon| RateLimited
  RateLimited -->|retry after reset| Loading
  Loading -->|step error| IndexingFailure
  IndexingFailure -->|retry / fallback mock data| Loading

  TopDapps --> Transactions
  Transactions --> VibeCheck
  VibeCheck --> Persona
  Persona --> Share
  Share --> Mint

  classDef connect fill:#dbeafe,stroke:#2563eb,color:#0f172a
  classDef loading fill:#fef3c7,stroke:#d97706,color:#0f172a
  classDef stats fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef share fill:#ede9fe,stroke:#7c3aed,color:#0f172a
  classDef error fill:#fee2e2,stroke:#dc2626,color:#0f172a

  class Connect,Manual,Freighter,Albedo,WalletConnect,Demo connect
  class Loading,RateLimited,IndexingFailure loading
  class TopDapps,Transactions,VibeCheck,Persona stats
  class Share,Mint share
  class InvalidAddress,WalletDisconnected error
```

### Data Flow

```mermaid
flowchart LR
  ConnectPage["Connect page<br/>/connect"]
  LoadingPage["Loading page<br/>/loading"]
  StatsPages["Stats pages<br/>/top-daps, /transactions-of-fury, /vibe-check"]
  PersonaPage["Persona page<br/>/persona"]
  SharePage["Share page<br/>/share"]
  MintAction["Mint action<br/>wallet signing"]

  WrapStore[("useWrapStore<br/>address, period, network, status, error, result, cacheMeta, indexing progress")]
  RateLimitStore[("useRateLimitStore<br/>isRateLimited, resetTime, retryAttempt, message")]
  TransactionStore[("useTransactionStore<br/>transactionState, transactionHash, transactionError")]
  MockData[("mockData / GOLDEN_USER<br/>demo and fallback data")]
  Indexer["indexAccount + IndexerEventEmitter<br/>Horizon indexing events"]
  PersonaAction["generatePersonaDescription<br/>streamed persona copy"]

  ConnectPage -->|writes address, status, error| WrapStore
  ConnectPage -->|demo shortcut reads| MockData

  LoadingPage -->|reads address, period, network| WrapStore
  LoadingPage -->|writes status, result, cacheMeta, indexing progress, indexingError| WrapStore
  LoadingPage -->|calls| Indexer
  Indexer -->|step progress and completion| WrapStore
  Indexer -->|429 metadata| RateLimitStore
  LoadingPage -->|fallback / demo result| MockData

  StatsPages -->|read result.dapps, transactions, vibes| WrapStore
  PersonaPage -->|reads result persona metrics| WrapStore
  PersonaPage -->|streams description from| PersonaAction
  SharePage -->|reads wallet address and network| WrapStore
  SharePage -->|reads display fallbacks| MockData
  MintAction -->|reads address and network| WrapStore
  MintAction -->|writes transaction lifecycle| TransactionStore
  SharePage -->|renders mint status| TransactionStore

  classDef connect fill:#dbeafe,stroke:#2563eb,color:#0f172a
  classDef loading fill:#fef3c7,stroke:#d97706,color:#0f172a
  classDef stats fill:#dcfce7,stroke:#16a34a,color:#0f172a
  classDef share fill:#ede9fe,stroke:#7c3aed,color:#0f172a
  classDef store fill:#f8fafc,stroke:#64748b,color:#0f172a

  class ConnectPage connect
  class LoadingPage,Indexer,RateLimitStore loading
  class StatsPages,PersonaPage,PersonaAction stats
  class SharePage,MintAction,TransactionStore share
  class WrapStore,MockData store
```

### Indexing State Machine

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Initializing: startIndexing()
  Initializing --> FetchingTransactions: complete initializing
  FetchingTransactions --> FilteringTimeframes: complete fetching-transactions
  FilteringTimeframes --> CalculatingVolume: complete filtering-timeframes
  CalculatingVolume --> IdentifyingAssets: complete calculating-volume
  IdentifyingAssets --> CountingContracts: complete identifying-assets
  CountingContracts --> Finalizing: complete counting-contracts
  Finalizing --> Ready: complete finalizing
  Ready --> [*]

  Initializing --> IndexingError: step error
  FetchingTransactions --> RateLimited: Horizon 429
  FetchingTransactions --> IndexingError: step error
  FilteringTimeframes --> IndexingError: step error
  CalculatingVolume --> IndexingError: step error
  IdentifyingAssets --> IndexingError: step error
  CountingContracts --> IndexingError: step error
  Finalizing --> IndexingError: step error

  RateLimited --> FetchingTransactions: retry after reset
  IndexingError --> Initializing: retry from start
  IndexingError --> Ready: fallback mock data
  Initializing --> Cancelled: cancelIndexing()
  FetchingTransactions --> Cancelled: cancelIndexing()
  FilteringTimeframes --> Cancelled: cancelIndexing()
  CalculatingVolume --> Cancelled: cancelIndexing()
  IdentifyingAssets --> Cancelled: cancelIndexing()
  CountingContracts --> Cancelled: cancelIndexing()
  Finalizing --> Cancelled: cancelIndexing()
  Cancelled --> Idle: resetIndexing()
```

---

## 🎯 Key Metrics Tracked

We look beyond simple payments to capture the full spectrum of Stellar's vibrant ecosystem:

* **🧙‍♂️ Soroban Builder Stats:** Contracts deployed and unique user interactions. (Critical for developer reputation!).
* **🤝 dApp Interactions:** Which ecosystem projects did you support the most?
* **🎨 NFT Activity:** New mints collected and top creators supported.
* **💸 Network Volume:** A summary of your general transaction activity.
* **🏆 Your Monthly Persona:** A gamified badge that reflects your unique contribution style.

---

## 🌟 Ecosystem Impact

This project is designed to support the growth of the Stellar network by:

1.  **Incentivizing Building:** Publicly celebrating developers who ship code creates positive reinforcement. A "Soroban Architect" badge is a social flex that encourages more building.
2.  **Driving Viral Activity:** Every shared Stellar Wrap card is organic marketing for the blockchain, showing the world that Stellar is active and being used.
3.  **Increasing Retention:** Giving users a personalized summary fosters a sense of ownership and encourages them to come back next month to beat their stats.

---

## 🛠️ Tech Stack

* **Frontend:** Next.js, React, TailwindCSS
* **Animations:** Framer Motion
* **Wallet Connection:** Stellar SDK, Freighter integration
* **Image Generation:** `satori` / `html2canvas` for creating shareable social cards.

---

## ⚙️ Configuration

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0

### Install pnpm globally

```bash
npm install -g pnpm@9
````

Or, since this repo pins `packageManager: "pnpm@9.0.0"` in `package.json`, you can use Corepack (bundled with Node.js >= 16.9) instead, which installs the exact pinned version automatically:

```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

### Environment variables

Copy `.env.example` to `.env.local` and set:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CONTRACT_ADDRESS_MAINNET` | Soroban contract address on mainnet (56-char, `C...`). |
| `NEXT_PUBLIC_CONTRACT_ADDRESS_TESTNET` | Soroban contract address on testnet (56-char, `C...`). |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | (Optional) Legacy: used for both networks if the two above are not set. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID (optional). |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Plausible Analytics domain for privacy-friendly page-view tracking (optional). |

Contract addresses are loaded per network; the app uses the selected network (mainnet/testnet) to choose the contract. When you switch networks in the UI, the contract instance is re-loaded for the new network.

```markdown
### Running tests

**Unit & Integration Tests:**

```bash
pnpm install
pnpm test
```

If you see `Cannot find module 'ansi-styles'` when running `pnpm test`, run a clean install:

```bash
rm -rf node_modules && pnpm install
pnpm test
```

**End-to-End (E2E) Tests with Playwright:**

Run the full user journey (landing → connect → loading → persona → share):

```bash
# Run e2e tests headlessly
pnpm e2e

# Run with interactive UI (recommended for development)
pnpm e2e:ui
```

Tests mock the Horizon API and validate:
- Manual wallet address entry
- Wallet connection (Freighter/Albedo)
- Loading/indexing progress
- Persona reveal animation
- Share card download

E2E tests run automatically in CI on pull requests and push to main.

---

See [TESTING.md](./TESTING.md) for full Lighthouse CI documentation, score thresholds, and troubleshooting.

## 📡 API Reference

The application exposes two HTTP API routes. A machine-readable [OpenAPI 3.1 spec](./openapi.yaml) is also available.

TypeScript request/response types live in [`src/types/api.ts`](./src/types/api.ts).

---

### `GET /api/wrapped`

Returns aggregated on-chain statistics for a Stellar address.

**Query parameters**

| Parameter   | Type     | Required | Default    | Description |
|-------------|----------|----------|------------|-------------|
| `accountId` | `string` | ✅ Yes   | —          | Stellar public key (56 chars, starts with `G`) |
| `network`   | `string` | No       | `mainnet`  | `mainnet` or `testnet` |
| `period`    | `string` | No       | `monthly`  | `weekly`, `monthly`, or `yearly` |

**Cache behaviour**: Results are cached in IndexedDB for 60 minutes. Subsequent requests within that window return `cached: true` and may trigger a background re-index (`refreshingInBackground: true`).

**Example request**

```bash
curl "https://stellar-wrap.vercel.app/api/wrapped?accountId=GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN&network=mainnet&period=monthly"
```

**Example response (200)**

```json
{
  "username": "alice.stellar",
  "address": "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
  "totalTransactions": 142,
  "totalVolume": 58432.5,
  "percentile": 87,
  "persona": "The DeFi Patron",
  "personaDescription": "You move capital with purpose across Stellar's DEX.",
  "dapps": [
    { "name": "Stellar DEX", "transactions": 80, "color": "#6366f1", "gradient": "linear-gradient(135deg,#6366f1,#8b5cf6)" }
  ],
  "vibes": [
    { "type": "Power User", "percentage": 72, "color": "#f59e0b", "label": "Power User" }
  ],
  "cached": false,
  "cacheTimestamp": null,
  "refreshingInBackground": false
}
```

**Error responses**

| Status | Meaning |
|--------|---------|
| `400`  | Missing or invalid `accountId`, `network`, or `period` |
| `404`  | Account not found on the specified network |
| `429`  | Horizon rate limit exceeded — retry after a short delay |
| `500`  | Unexpected server or Horizon error |

---

### `GET /api/og`

Returns a **1200 × 1200 PNG** share card image, rendered on Vercel Edge Runtime.

**Query parameters**

| Parameter       | Type     | Required | Default             | Description |
|-----------------|----------|----------|---------------------|-------------|
| `username`      | `string` | No       | `StellarUser`       | Username shown on the card |
| `transactions`  | `string` | No       | `0`                 | Total transaction count |
| `persona`       | `string` | No       | `Network Pioneer`   | Archetype label |
| `topVibe`       | `string` | No       | `Steady`            | Top vibe label |
| `vibePercentage`| `string` | No       | `0`                 | Top vibe percentage (0–100) |
| `archetypeImage`| `string` | No       | *(derived)*         | Path to archetype image under `/public` |

**Cache**: `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800` — CDN-cached for 24 h, stale-while-revalidate for 7 days.

**Example request**

```bash
curl -o share-card.png \
  "https://stellar-wrap.vercel.app/api/og?username=alice&transactions=142&persona=The+DeFi+Patron&topVibe=Power+User&vibePercentage=72"
```

**Response**: Binary PNG (`Content-Type: image/png`).

---

## 🗺️ Roadmap

Our immediate focus is on delivering a polished MVP for the community:

* ✅ Seamless wallet integration (Freighter/Albedo).
* ✅ Core data fetching and aggregation logic for a 30-day period.
* ✅ Developing the persona assignment algorithm.
* ✅ Building the dynamic social media card generator.
* ✅ Live public release for community testing.

---

## 🧾 Commit / CL format

Use a Conventional Commit–style format for all change lists (CLs) in this repo:

```text
<type>(<scope>): <short summary in present tense>

[optional body]

[optional footer(s)]
```

### Types

- **feat**: new user-facing feature (UI, flow, interaction)
- **fix**: bug fix (visual, logic, or integration)
- **refactor**: code refactor that doesn’t change behavior
- **style**: purely visual changes (spacing, colors, typography) with no behavior change
- **chore**: tooling, configs, dependency bumps, project plumbing
- **docs**: documentation only (README, comments)
- **test**: adding or updating tests only

### Scopes (suggested)

Use a small, descriptive scope in parentheses to indicate the area you touched. Examples for this project:

- **landing**: landing hero, CTA (`LandingPage`, `page.tsx`)
- **connect**: `/connect` page and wallet flow
- **loading**: `/loading` page and wrap animation
- **vibe-check**: `/vibe-check` page, vibes visualization
- **persona**: `/persona` archetype reveal
- **share**: `/share` page, share card and menus
- **store**: Zustand stores (`wrapStore`, etc.)
- **theme**: `globals.css`, Tailwind theme tokens
- **layout**: `app/layout.tsx`, root shell and providers
- **utils**: helpers like `walletConnect.ts`

If a scope doesn’t fit, you can omit it: `feat: add keyboard shortcuts`.

### Examples

- **Single-file feature**

```text
feat(landing): add weekly/monthly/yearly period selector
```

- **Cross-page flow change**

```text
feat(flow): wire connect -> loading -> persona with wrap store
```

- **Bug fix**

```text
fix(connect): show error when Freighter is missing instead of hanging
```

- **Visual tweak**

```text
style(persona): align oracle heading with progress indicator
```

- **Tooling / config**

```text
chore(store): introduce canonical wrap store for frontend data
```

### Body and footers (optional)

Use the body to add context when needed:

```text
feat(share): use canonical wrap data in share card

- read wrap data from useWrapStore
- keep mockData only in loading for now
```

For breaking changes or references:

```text
feat(store): consolidate state into wrapStore

BREAKING CHANGE: legacy store exports removed; update imports to useWrapStore.
```

## Handsoff notes

- <!-- handsoff-issue-270 --> #270: feat(persona): prevent repeated confetti bursts on rapid card taps
- <!-- handsoff-issue-412 --> #412: Implement keyboard navigation for Token Swap
- <!-- handsoff-issue-604 --> #604: test(utils): `app/utils` has partial test coverage with no stated standard
