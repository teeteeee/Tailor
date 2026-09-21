import { NextRequest, NextResponse } from "next/server";
import { endSession } from "@/lib/accounts";
import { databaseConfigured } from "@/lib/db";
import { SESSION_COOKIE, clearSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (databaseConfigured()) {
    await endSession(request.cookies.get(SESSION_COOKIE)?.value ?? "").catch(() => {});
  }
  return clearSession(NextResponse.json({ ok: true }));
}
