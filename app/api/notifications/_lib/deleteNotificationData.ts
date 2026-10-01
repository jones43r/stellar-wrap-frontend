/**
 * Permanently removes every piece of notification data held for a wallet:
 * the subscription record (email address + push endpoint), its period index
 * entries, and all dispatch logs referencing the wallet.
 *
 * Retention: dispatch logs (`notif:log:{wallet}:{channel}:...`) record
 * wallet/channel pairs for de-duplication and are kept for at most 30 days
 * during normal operation. A deletion request removes them immediately.
 */

import { kvGet, kvDel, kvKeys, kvSRem, SUB_KEY, PERIOD_KEY } from "./kv";
import type { SubscriptionRecord } from "@/app/types/notifications";

const PERIODS = ["weekly", "monthly", "yearly"] as const;

export async function deleteNotificationData(
  wallet: string,
): Promise<{ emailAddress: string | null }> {
  const record = await kvGet<SubscriptionRecord>(SUB_KEY(wallet));
  const emailAddress = record?.email?.address ?? null;

  const logKeys = await kvKeys(`notif:log:${wallet}:*`);

  await Promise.all([
    kvDel(SUB_KEY(wallet)),
    ...PERIODS.map((period) => kvSRem(PERIOD_KEY(period), wallet)),
    ...logKeys.map((key) => kvDel(key)),
  ]);

  return { emailAddress };
}

/** Resolves the wallet owning an email unsubscribe token, or null. */
export async function findWalletByUnsubscribeToken(token: string): Promise<string | null> {
  const keys = await kvKeys("notif:sub:*");
  for (const key of keys) {
    const record = await kvGet<SubscriptionRecord>(key);
    if (record?.email?.unsubscribeToken === token) {
      return record.walletAddress;
    }
  }
  return null;
}

export async function sendDeletionConfirmation(
  emailAddress: string,
  send: (msg: { to: string; subject: string; html: string }) => Promise<unknown>,
): Promise<void> {
  await send({
    to: emailAddress,
    subject: "Your Stellar Wrapped data has been deleted",
    html: `
          <p>Your notification preferences and personal data have been removed from Stellar Wrapped.</p>
          <p>If you did not request this, please contact us.</p>
        `,
  });
}
