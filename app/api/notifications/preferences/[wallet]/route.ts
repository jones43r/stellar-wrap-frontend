/**
 * GET  /api/notifications/preferences/:wallet  — read subscription record
 * PUT  /api/notifications/preferences/:wallet  — update subscription record
 *
 * Both methods require proof of address control: the caller must present a
 * signed challenge (see `_lib/auth`) proving they own the wallet. The email
 * address in the record is personal data and is never returned to an
 * unauthenticated caller.
 */

import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet, SUB_KEY } from "../../_lib/kv";
import { logger } from "@/app/utils/logger";
import type { SubscriptionRecord } from "@/app/types/notifications";
import { apiError, internalApiError } from "@/app/api/_lib/apiError";
import { verifyWalletChallenge } from "../../_lib/auth";

const log = logger.child("api:preferences");

interface RouteParams {
  params: Promise<{ wallet: string }>;
}

function isValidWallet(address: string): boolean {
  return typeof address === "string" && address.startsWith("G") && address.length === 56;
}

/**
 * Strip personal data (email) from a record before returning it to a caller
 * that has not proven control of the wallet.
 */
function redactRecord(record: SubscriptionRecord): SubscriptionRecord {
  return { ...record, email: undefined };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { wallet } = await params;

    if (!isValidWallet(wallet)) {
      return apiError("INVALID_WALLET", "Invalid wallet address", 400);
    }

    const record = await kvGet<SubscriptionRecord>(SUB_KEY(wallet));

    if (!record) {
      return apiError("NOT_FOUND", "No subscription found", 404);
    }

    const authenticated = await verifyWalletChallenge(request, wallet);

    if (!authenticated) {
      return NextResponse.json(redactRecord(record), { status: 200 });
    }

    return NextResponse.json(record, { status: 200 });
  } catch (err) {
    return internalApiError(log, err);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { wallet } = await params;

    if (!isValidWallet(wallet)) {
      return apiError("INVALID_WALLET", "Invalid wallet address", 400);
    }

    const authenticated = await verifyWalletChallenge(request, wallet);

    if (!authenticated) {
      return apiError(
        "UNAUTHORIZED",
        "Proof of wallet ownership required",
        401,
      );
    }

    const body = (await request.json()) as Partial<SubscriptionRecord>;

    const existing = await kvGet<SubscriptionRecord>(SUB_KEY(wallet));

    if (!existing) {
      return apiError("NOT_FOUND", "No subscription found", 404);
    }

    // Merge only allowed fields — never overwrite walletAddress
    const updated: SubscriptionRecord = {
      ...existing,
      ...(body.push !== undefined && { push: body.push }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.consentGiven !== undefined && { consentGiven: body.consentGiven }),
    };

    await kvSet(SUB_KEY(wallet), updated);

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    return internalApiError(log, err);
  }
}
