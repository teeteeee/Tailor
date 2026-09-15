import { NextRequest, NextResponse } from "next/server";
import { deleteRun, getRun, setPinned, updateRunPayload } from "@/lib/runs";
import { requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await requireUser(request);
    if (user instanceof NextResponse) return user;

    const run = await getRun(user.id, (await params).id);
    if (!run) return NextResponse.json({ error: "No such run." }, { status: 404 });
    return NextResponse.json({ run });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = await requireUser(request);
    if (user instanceof NextResponse) return user;

    const body = (await request.json()) as { pinned?: boolean; rejected?: string[]; answers?: unknown[] };
    const { id } = await params;

    if (typeof body.pinned === "boolean") {
      const now = await setPinned(user.id, id, body.pinned);
      if (now === null) return NextResponse.json({ error: "No such run." }, { status: 404 });
      return NextResponse.json({ pinned: now });
    }

    // Rejections and answers happen after the run is first saved, so the stored
    // copy is topped up as they change; otherwise reopening a run would show
    // edits as accepted that were rejected.
    if (Array.isArray(body.rejected) || Array.isArray(body.answers)) {
      const saved = await updateRunPayload(user.id, id, {
        rejected: Array.isArray(body.rejected) ? body.rejected.map(String) : undefined,
        answers: Array.isArray(body.answers) ? (body.answers as { question: string; text: string }[]) : undefined,
      });
      if (!saved) return NextResponse.json({ error: "No such run." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await requireUser(request);
    if (user instanceof NextResponse) return user;

    const removed = await deleteRun(user.id, (await params).id);
    if (!removed) return NextResponse.json({ error: "No such run." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
