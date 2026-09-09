import { ChangeSchema, GapFillSchema, TailorResultSchema, type Change, type GapFill, type TailorResult } from "./schema";
import { z } from "zod";

/**
 * The change list is validated entry by entry rather than as a whole.
 *
 * Structured outputs guide generation but a single malformed field should not
 * throw away a response that took half a minute to write — losing one entry
 * from the review list is a far smaller failure than losing the resume.
 */
const LenientTailorResult = TailorResultSchema.extend({ changes: z.array(z.unknown()) });
const LenientGapFill = GapFillSchema.extend({ changes: z.array(z.unknown()) });

/**
 * An unrecognised `kind` is the failure worth repairing: the model coins a verb
 * for an operation the schema does not name (a reorder, say). Such an entry
 * still carries a path and its before and after text, which is everything
 * accepting or rejecting it needs, so infer the kind from that shape.
 */
function repairChange(value: unknown): Change | null {
  const direct = ChangeSchema.safeParse(value);
  if (direct.success) return direct.data;

  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const before = typeof candidate.before === "string" ? candidate.before : "";
  const after = typeof candidate.after === "string" ? candidate.after : "";
  const kind = before.trim() === "" ? "add" : after.trim() === "" ? "remove" : "edit";

  const repaired = ChangeSchema.safeParse({ ...candidate, kind });
  return repaired.success ? repaired.data : null;
}

function usableChanges(raw: unknown[], context: string): Change[] {
  const changes = raw.map(repairChange).filter((change): change is Change => change !== null);
  const lost = raw.length - changes.length;
  if (lost > 0) console.warn(`[resume-tailor] dropped ${lost} unreadable change(s) from ${context}`);
  return changes;
}

export function parseTailorResult(json: string): TailorResult {
  const base = LenientTailorResult.parse(JSON.parse(json));
  return { ...base, changes: usableChanges(base.changes, "tailoring") };
}

export function parseGapFill(json: string): GapFill {
  const base = LenientGapFill.parse(JSON.parse(json));
  return { ...base, changes: usableChanges(base.changes, "closing a gap") };
}
