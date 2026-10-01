import type { WrappedResult } from "@/types/wrapped";

/**
 * Canonical fixture factory for a wrapped result.
 *
 * The type is derived from the production `WrappedResult` type so that a
 * schema change to the aggregate breaks this fixture at compile time rather
 * than silently diverging from the real shape.
 */
export type WrappedResultFixture = WrappedResult;

export interface WrappedResultOverrides {
  [key: string]: unknown;
}

const baseWrappedResult: WrappedResult = {
  id: "wrapped-fixture-0001",
  userId: "user-fixture-0001",
  year: 2024,
  generatedAt: "2024-12-31T23:59:59.000Z",
  summary: {
    totalTransactions: 3,
    totalVolume: 300,
    totalFees: 3,
    uniqueCounterparties: 2,
    activeDays: 3,
  },
  highlights: [
    {
      id: "highlight-fixture-0001",
      kind: "top-counterparty",
      title: "Most frequent counterparty",
      description: "You transacted with alice the most this year.",
      value: "alice",
    },
  ],
  persona: {
    id: "persona-fixture-0001",
    name: "The Steady Builder",
    tagline: "Consistent, deliberate, and always moving forward.",
    description:
      "You kept a steady rhythm all year, building momentum one transaction at a time.",
  },
  shareCard: {
    id: "share-card-fixture-0001",
    imageUrl: "https://example.com/share/wrapped-fixture-0001.png",
    title: "Your 2024 Wrapped",
    subtitle: "The Steady Builder",
  },
  transactions: [
    {
      id: "tx-fixture-0001",
      timestamp: "2024-01-15T12:00:00.000Z",
      amount: 100,
      fee: 1,
      counterparty: "alice",
      direction: "outgoing",
    },
    {
      id: "tx-fixture-0002",
      timestamp: "2024-06-15T12:00:00.000Z",
      amount: 100,
      fee: 1,
      counterparty: "bob",
      direction: "incoming",
    },
    {
      id: "tx-fixture-0003",
      timestamp: "2024-12-15T12:00:00.000Z",
      amount: 100,
      fee: 1,
      counterparty: "alice",
      direction: "outgoing",
    },
  ],
};

/**
 * Build a valid wrapped result, with optional overrides for specific cases.
 */
export function createWrappedResult(
  overrides: WrappedResultOverrides = {},
): WrappedResult {
  return {
    ...baseWrappedResult,
    ...overrides,
  } as WrappedResult;
}

/**
 * Edge case: an account with no activity at all.
 */
export function createEmptyWrappedResult(
  overrides: WrappedResultOverrides = {},
): WrappedResult {
  return createWrappedResult({
    summary: {
      totalTransactions: 0,
      totalVolume: 0,
      totalFees: 0,
      uniqueCounterparties: 0,
      activeDays: 0,
    },
    highlights: [],
    transactions: [],
    ...overrides,
  });
}

/**
 * Edge case: an account with exactly one transaction.
 */
export function createSingleTransactionWrappedResult(
  overrides: WrappedResultOverrides = {},
): WrappedResult {
  const [firstTransaction] = baseWrappedResult.transactions;

  return createWrappedResult({
    summary: {
      totalTransactions: 1,
      totalVolume: firstTransaction.amount,
      totalFees: firstTransaction.fee,
      uniqueCounterparties: 1,
      activeDays: 1,
    },
    transactions: [firstTransaction],
    ...overrides,
  });
}

/**
 * Edge case: a maximal account with many transactions and highlights.
 */
export function createMaximalWrappedResult(
  overrides: WrappedResultOverrides = {},
): WrappedResult {
  const transactions = Array.from({ length: 50 }, (_, index) => ({
    id: `tx-fixture-max-${String(index + 1).padStart(4, "0")}`,
    timestamp: new Date(
      Date.UTC(2024, index % 12, (index % 27) + 1, 12, 0, 0),
    ).toISOString(),
    amount: 100 + index,
    fee: 1 + (index % 5),
    counterparty: `counterparty-${index % 10}`,
    direction: index % 2 === 0 ? "outgoing" : "incoming",
  }));

  const highlights = Array.from({ length: 10 }, (_, index) => ({
    id: `highlight-fixture-max-${String(index + 1).padStart(4, "0")}`,
    kind: "top-counterparty",
    title: `Highlight ${index + 1}`,
    description: `A notable moment from your year, number ${index + 1}.`,
    value: `counterparty-${index % 10}`,
  }));

  return createWrappedResult({
    summary: {
      totalTransactions: transactions.length,
      totalVolume: transactions.reduce((sum, tx) => sum + tx.amount, 0),
      totalFees: transactions.reduce((sum, tx) => sum + tx.fee, 0),
      uniqueCounterparties: 10,
      activeDays: 27,
    },
    highlights,
    transactions,
    ...overrides,
  });
}
