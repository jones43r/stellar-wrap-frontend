# Contact List Architecture

This document describes how the Contact List feature is structured, how data
flows through it, and the conventions to follow when maintaining or extending
it.

## Overview

The Contact List lets users view, search, and manage their saved contacts. It
is composed of a small set of decoupled, reusable components backed by a
centralized state layer, so that presentation stays separate from data and
business logic.

## Key Files

| Path | Responsibility |
| --- | --- |
| `components/contact-list/` | Presentational components for the list, rows, and empty/loading states. |
| `components/contact-list/ContactList.tsx` | Top-level container that wires state to the presentational components. |
| `hooks/` | Reusable hooks (e.g. contact fetching, filtering, selection) consumed by the container. |
| `types/` | Shared TypeScript types for contacts and related view models. |

> Adjust the paths above to match the actual locations in this repository. The
> structure is intentionally shallow so components remain easy to find and
> reuse.

## Components

- **Container (`ContactList`)** — owns data fetching and selection state, and
  passes plain props down to children. It contains no presentational markup
  beyond composition.
- **List / Row components** — pure presentational components. They receive
  typed props and render UI only; they never fetch data or hold business logic.
- **Empty / Loading states** — dedicated components rendered by the container
  based on the current request status.

Keeping presentational components pure makes them reusable elsewhere and easy
to test in isolation.

## Data Flow

1. The container triggers a fetch (via a hook or data layer) when it mounts or
   when its inputs change.
2. The data layer returns typed contacts and a status (`idle`, `loading`,
   `success`, `error`).
3. The container derives the visible list (e.g. applying search/filter) and
   passes it to the presentational components.
4. User interactions (select, remove, open) are handled by callbacks passed
   down from the container, which update state and, where needed, call the data
   layer.

Data flows in one direction: state lives in the container (or a shared store),
and children communicate changes upward through callbacks.

## State Management

- Local, feature-specific state (search term, selection, request status) lives
  in the container or a dedicated hook.
- Shared or cross-feature state should live in the project's centralized store
  rather than being duplicated across components.
- All state and props are typed with strict TypeScript types. The use of `any`
  is prohibited.

## Styling

Use the project's centralized styling solution. Do not use inline styles.
Follow the existing conventions in the components you are editing.

## Extending the Contact List

To add a new capability:

1. **Add or extend types** in the shared `types/` module first, so the contract
   is explicit.
2. **Update the data layer / hook** if new data or mutations are required.
3. **Wire the container** to pass the new data or callbacks down as props.
4. **Update presentational components** to render the new UI, keeping them pure
   and prop-driven.
5. **Add tests** covering the new behavior, including loading and error paths.

## Maintenance Conventions

- Keep components decoupled and reusable; avoid reaching into global state from
  presentational components.
- Prefer composition over adding flags to existing components.
- Keep the data flow unidirectional and side effects inside hooks or the data
  layer.
- Ensure all changes pass ESLint and Prettier checks before opening a PR.
- Do not introduce new dependencies unless fully justified and free of known
  security vulnerabilities.
