import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { Job, TailorResult } from "./schema";
import type { KeywordHit } from "./keywords";

/** Everything needed to reopen a past run exactly as it was left. */
export type RunPayload = {
  resumeText: string;
  job: Job;
  result: TailorResult;
  coverage: { before: KeywordHit[]; after: KeywordHit[] };
  rejected: string[];
  answers: Array<{ question: string; text: string }>;
};

export type RunSummary = {
  id: string;
  company: string;
  jobTitle: string;
  matchScore: number;
  pinned: boolean;
  createdAt: string;
};

export type Run = RunSummary & { payload: RunPayload };

type Row = {
  id: string;
  company: string;
  job_title: string;
  match_score: number;
  pinned: boolean;
  created_at: Date;
};

const toSummary = (row: Row): RunSummary => ({
  id: row.id,
  company: row.company,
  jobTitle: row.job_title,
  matchScore: row.match_score,
  pinned: row.pinned,
  createdAt: row.created_at.toISOString(),
});

export async function saveRun(userId: string, payload: RunPayload): Promise<string> {
  const sql = db();
  const id = randomUUID();
  await sql`
    INSERT INTO runs (id, user_id, company, job_title, match_score, payload)
    VALUES (
      ${id}, ${userId}, ${payload.job.company ?? ""}, ${payload.job.title ?? ""},
      ${Math.round(payload.result.matchScore ?? 0)}, ${sql.json(payload as never)}
    )
  `;
  return id;
}

/**
 * Pinned runs first, then newest. `query` matches company or job title; `since`
 * limits to runs after a date. Filtering happens in SQL so a long history stays
 * fast and the page only carries what it shows.
 */
export async function listRuns(
  userId: string,
  options: { query?: string; pinnedOnly?: boolean; since?: Date; limit?: number } = {},
): Promise<RunSummary[]> {
  const sql = db();
  const term = `%${(options.query ?? "").trim()}%`;
  const hasQuery = (options.query ?? "").trim().length > 0;

  const rows = await sql<Row[]>`
    SELECT id, company, job_title, match_score, pinned, created_at
    FROM runs
    WHERE user_id = ${userId}
      ${hasQuery ? sql`AND (company ILIKE ${term} OR job_title ILIKE ${term})` : sql``}
      ${options.pinnedOnly ? sql`AND pinned` : sql``}
      ${options.since ? sql`AND created_at >= ${options.since}` : sql``}
    ORDER BY pinned DESC, created_at DESC
    LIMIT ${Math.min(options.limit ?? 100, 200)}
  `;
  return rows.map(toSummary);
}

export async function getRun(userId: string, id: string): Promise<Run | null> {
  const sql = db();
  const rows = await sql<(Row & { payload: RunPayload })[]>`
    SELECT id, company, job_title, match_score, pinned, created_at, payload
    FROM runs WHERE user_id = ${userId} AND id = ${id}
  `;
  const row = rows[0];
  return row ? { ...toSummary(row), payload: row.payload } : null;
}

/** Returns the new state, so the caller need not guess what it became. */
export async function setPinned(userId: string, id: string, pinned: boolean): Promise<boolean | null> {
  const sql = db();
  const rows = await sql<{ pinned: boolean }[]>`
    UPDATE runs SET pinned = ${pinned} WHERE user_id = ${userId} AND id = ${id} RETURNING pinned
  `;
  return rows[0]?.pinned ?? null;
}

/** Merge the parts of a payload that change after the run was first saved. */
export async function updateRunPayload(
  userId: string,
  id: string,
  patch: { rejected?: string[]; answers?: Array<{ question: string; text: string }> },
): Promise<boolean> {
  const sql = db();
  const merged: Record<string, unknown> = {};
  if (patch.rejected) merged.rejected = patch.rejected;
  if (patch.answers) merged.answers = patch.answers;
  if (Object.keys(merged).length === 0) return false;

  const rows = await sql<{ id: string }[]>`
    UPDATE runs SET payload = payload || ${sql.json(merged as never)}
    WHERE user_id = ${userId} AND id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function deleteRun(userId: string, id: string): Promise<boolean> {
  const sql = db();
  const rows = await sql<{ id: string }[]>`
    DELETE FROM runs WHERE user_id = ${userId} AND id = ${id} RETURNING id
  `;
  return rows.length > 0;
}
