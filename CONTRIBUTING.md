# Contributing to Stellar Wrap

## Contact List architecture

The Contact List is the reusable address book used across the app to
pick, save, and manage frequently used Stellar addresses. It is split
into a small set of decoupled pieces so the same list can be embedded in
different flows (e.g. withdraw) without duplicating logic.

### Key files

- `components/contact-list/` — presentational components for the list,
  rows, and the add/edit form. These are intentionally dumb: they render
  props and emit callbacks, and hold no persistence logic.
- `hooks/use-contact-list.ts` — the single source of truth for Contact
  List state. It owns loading, adding, updating, and removing contacts
  and exposes them to consumers.
- `lib/contact-list.ts` — pure helpers for validation, normalization,
  and (de)serialization of contacts. Keep these free of React and side
  effects so they stay easy to unit test.
- `types/contact.ts` — shared TypeScript types for a contact and the
  hook's return shape.

### Data flow

1. A consumer (e.g. the withdraw page) calls `useContactList()`.
2. The hook reads persisted contacts, exposes them plus mutation
   callbacks, and keeps state in sync after each mutation.
3. Presentational components receive contacts and callbacks as props and
   render the UI. They never read or write storage directly.
4. Pure helpers in `lib/contact-list.ts` validate and normalize input
   before it is persisted.

### State management conventions

- All Contact List state lives in `useContactList`; do not duplicate it
  in components.
- Components stay presentational and reusable — pass data and callbacks
  down, never reach for global state.
- Keep types strict. `any` is prohibited; extend the shared types in
  `types/contact.ts` instead.
- Use the project's centralized styling solution; no inline styles.

### Extending or modifying the Contact List

- **New field on a contact**: add it to `types/contact.ts`, handle it in
  the validation/normalization helpers, then surface it in the form and
  row components.
- **New action (e.g. import/export)**: add the logic to
  `useContactList` and expose a callback; keep the UI components
  presentational.
- **Reusing the list elsewhere**: consume `useContactList` and render the
  existing components — do not fork the list.
- **Tests**: cover pure helpers in `lib/contact-list.ts` and hook
  behavior in `useContactList`; UI components should be tested through
  props and callbacks.

## Handling dependency advisory exceptions

Our CI runs `pnpm audit` on every PR that touches `package.json` or
`pnpm-lock.yaml`, plus a weekly scheduled scan.

If an advisory has no available fix (no patched version exists) and a
maintainer has assessed it as not exploitable in our usage, it can be
suppressed via `pnpm.auditConfig.ignoreCves` in `package.json`:

​```json
{
  "pnpm": {
    "auditConfig": {
      "ignoreCves": ["CVE-2024-XXXXX"]
    }
  }
}
​```

Before adding an entry:
1. Confirm no patched version is available (`pnpm audit` will say so).
2. Document *why* it's safe to ignore in the PR description that adds the
   exception (e.g. "only affects a build-time-only dependency, never
   shipped to production").
3. Revisit ignored CVEs periodically — remove the entry once a fix ships.

Note: this project pins `pnpm@10.25.0`. If upgraded to pnpm v11+, this
field is renamed to `pnpm.auditConfig.ignoreGhsas` and uses GitHub
Advisory IDs (GHSA-xxxx-xxxx-xxxx) instead of CVE numbers.
