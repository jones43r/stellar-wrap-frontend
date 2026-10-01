/**
 * DELETE /api/notifications/data  { token }
 *
 * Token-based data deletion so an email recipient can remove their data
 * without connecting a wallet. The token is the email unsubscribe token.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "../_lib/email";
import {
  deleteNotificationData,
  findWalletByUnsubscribeToken,
  sendDeletionConfirmation,
} from "../_lib/deleteNotificationData";
import { logger, maskAddress } from "@/app/utils/logger";
import { apiError, internalApiError } from "@/app/api/_lib/apiError";

const log = logger.child("api:data-delete");

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { token?: unknown };
    if (typeof body.token !== "string" || !body.token) {
      return apiError("INVALID_REQUEST", "Provide an unsubscribe token", 400);
    }

    const wallet = await findWalletByUnsubscribeToken(body.token);
    if (!wallet) {
      return apiError("INVALID_UNSUBSCRIBE_TOKEN", "Token not found", 401);
    }

    const { emailAddress } = await deleteNotificationData(wallet);

    if (emailAddress) {
      await sendDeletionConfirmation(emailAddress, sendEmail).catch((err) => {
        log.warn(`Confirmation email failed for wallet ${maskAddress(wallet)}:`, err);
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return internalApiError(log, err);
  }
}
