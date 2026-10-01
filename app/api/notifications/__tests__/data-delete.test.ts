import { NextRequest } from "next/server";
import { DELETE as deleteByWallet } from "../data/[wallet]/route";
import { DELETE as deleteByToken } from "../data/route";
import { kvGet, kvKeys, kvReset, kvSAdd, kvSet, LOG_KEY, PERIOD_KEY, SUB_KEY } from "../_lib/kv";
import type { SubscriptionRecord } from "@/app/types/notifications";

jest.mock("../_lib/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

const WALLET = "GDRZZGQDRBLJBAY24O3EMZFDGZ4EY6A7L24OERKQTPLT4T7SZKLUAZVQ";
const OTHER_WALLET = "GBDTABC1234567890123456789012345678901234567890123456789";
const TOKEN = "unsub-token-123";
const periods = { weekly: true, monthly: true, yearly: false };

async function seed(wallet: string, token: string) {
  const record: SubscriptionRecord = {
    walletAddress: wallet,
    consentGiven: true,
    consentTimestamp: new Date().toISOString(),
    email: {
      address: `${wallet.slice(0, 4)}@example.com`,
      status: "active",
      confirmationToken: "",
      unsubscribeToken: token,
      periods,
      createdAt: new Date().toISOString(),
    },
  } as SubscriptionRecord;
  await kvSet(SUB_KEY(wallet), record);
  await kvSAdd(PERIOD_KEY("weekly"), wallet);
  await kvSAdd(PERIOD_KEY("monthly"), wallet);
  await kvSet(LOG_KEY(wallet, "email", "weekly", "2026-W39"), { sentAt: "x" });
}

async function expectNoTrace(wallet: string) {
  expect(await kvGet(SUB_KEY(wallet))).toBeNull();
  expect(await kvKeys(`notif:log:${wallet}:*`)).toHaveLength(0);
  const remaining = JSON.stringify(
    await Promise.all((await kvKeys("*")).map(async (k) => [k, await kvGet(k)])),
  );
  expect(remaining).not.toContain(wallet);
  expect(remaining).not.toContain(`${wallet.slice(0, 4)}@example.com`);
}

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: init?.method ?? "DELETE",
    headers: { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("notification data deletion", () => {
  beforeEach(async () => {
    kvReset();
    await seed(WALLET, TOKEN);
    await seed(OTHER_WALLET, "other-token");
  });

  it("removes the record, period index entries and dispatch logs by wallet", async () => {
    const res = await deleteByWallet(req(`/api/notifications/data/${WALLET}`), {
      params: Promise.resolve({ wallet: WALLET }),
    });
    expect(res.status).toBe(200);
    await expectNoTrace(WALLET);
    expect(await kvGet(SUB_KEY(OTHER_WALLET))).not.toBeNull();
  });

  it("rejects a token that belongs to another wallet", async () => {
    const res = await deleteByWallet(req(`/api/notifications/data/${WALLET}?token=other-token`), {
      params: Promise.resolve({ wallet: WALLET }),
    });
    expect(res.status).toBe(401);
    expect(await kvGet(SUB_KEY(WALLET))).not.toBeNull();
  });

  it("deletes via the email token path without a wallet", async () => {
    const res = await deleteByToken(req("/api/notifications/data", { body: { token: TOKEN } }));
    expect(res.status).toBe(200);
    await expectNoTrace(WALLET);
  });

  it("returns 401 for an unknown token", async () => {
    const res = await deleteByToken(req("/api/notifications/data", { body: { token: "nope" } }));
    expect(res.status).toBe(401);
  });
});
