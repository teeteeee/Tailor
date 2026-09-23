import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { MAX_RESUME_CHARS, clearSavedResume, getSavedResume, putSavedResume } from "@/lib/savedResume";
import { requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

/**
 * The signed-in account's resume.
 *
 * A 401 here is not a failure the UI should shout about: it is how the browser
 * learns there is no account behind this deployment, and it falls back to
 * keeping the resume locally, exactly as the app behaved before accounts.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (user instanceof NextResponse) return user;

    await ensureMigrated();
    return NextResponse.json({ resume: await getSavedResume(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (user instanceof NextResponse) return user;

    const body = (await request.json().catch(() => null)) as { text?: unknown; filename?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text : "";
    // Long enough to be a filename, short enough not to be a payload.
    const filename = typeof body?.filename === "string" ? body.filename.slice(0, 200) : "";

    if (text.trim().length === 0) {
      return NextResponse.json({ error: "There is no resume text to save." }, { status: 400 });
    }
    if (text.length > MAX_RESUME_CHARS) {
      return NextResponse.json(
        { error: `That is too long to save (limit ${MAX_RESUME_CHARS.toLocaleString()} characters).` },
        { status: 413 },
      );
    }

    await ensureMigrated();
    return NextResponse.json({ resume: await putSavedResume(user.id, text, filename) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (user instanceof NextResponse) return user;

    await ensureMigrated();
    await clearSavedResume(user.id);
    return NextResponse.json({ resume: null });
  } catch (error) {
    return errorResponse(error);
  }
}
