/**
 * DELETE /api/notifications/data/:wallet[?token=...]
 *
 * Data deletion request. Uses the same wallet-scoped access as the
 * preferences route; when an email unsubscribe `token` is supplied it must
 * belong to this wallet. Permanently removes the subscription record
 * (including the email address), period index entries, and dispatch logs.
 * See ../../_lib/deleteNotificationData.ts for the dispatch log retention policy.
 *
 * Proof of address control is required: the caller must present a signed
 * challenge from the connected wallet (see ../../_lib/walletAuth.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "../../_lib/email";
import {
  deleteNotificationData,
  findWalletByUnsubscribeToken,
  sendDeletionConfirmation,
} from "../../_lib/deleteNotificationData";
import { verifyWalletAuth } from "../../_lib/walletAuth";
import { logger, maskAddress } from "@/app/utils/logger";
import { apiError, internalApiError } from "@/app/api/_lib/apiError";

const log = logger.child("api:data-delete");

interface RouteParams {
  params: Promise<{ wallet: string }>;
}

function isValidWallet(address: string): boolean {
  return typeof address === "string" && address.startsWith("G") && address.length === 56;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { wallet } = await params;

    if (!isValidWallet(wallet)) {
      return apiError("INVALID_WALLET", "Invalid wallet address", 400);
    }

    const token = request.nextUrl.searchParams.get("token");
    const hasValidToken = token && (await findWalletByUnsubscribeToken(token)) === wallet;

    // Require proof of address control unless the caller presents a valid
    // wallet-scoped unsubscribe token (e.g. from an email link).
    if (!hasValidToken) {
      const auth = await verifyWalletAuth(request, wallet);
      if (!auth.ok) {
        return apiError("UNAUTHENTICATED", "Wallet authentication required", 401);
      }
    }

    const { emailAddress } = await deleteNotificationData(wallet);

    if (emailAddress) {
      await sendDeletionConfirmation(emailAddress, sendEmail).catch((err) => {
        // Non-fatal — log and continue
        log.warn(`Confirmation email failed for wallet ${maskAddress(wallet)}:`, err);
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return internalApiError(log, err);
  }
}
