import { NextRequest, NextResponse } from "next/server";
import { AccountError, createUser, startSession, validateCredentials } from "@/lib/accounts";
import { databaseConfigured, migrate } from "@/lib/db";
import { attachSession } from "@/lib/session";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!databaseConfigured()) {
      return NextResponse.json({ error: "This deployment has no database, so it has no accounts." }, { status: 503 });
    }
    await migrate();

    const { email, password } = (await request.json()) as { email?: string; password?: string };
    const problem = validateCredentials(email ?? "", password ?? "");
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const user = await createUser(email!, password!);
    return attachSession(NextResponse.json({ email: user.email }), await startSession(user.id));
  } catch (error) {
    if (error instanceof AccountError) return NextResponse.json({ error: error.message }, { status: 409 });
    return errorResponse(error);
  }
}
