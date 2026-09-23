import { db } from "./db";
import type { SavedResume } from "./storage";

export type { SavedResume };

/**
 * The longest resume that will be stored. A real one runs to a few thousand
 * characters, so this is far above anything genuine; it is here because signup
 * is open, and an open signup should not let anyone park megabytes per account.
 */
export const MAX_RESUME_CHARS = 100_000;

type Row = { text: string; filename: string; updated_at: Date };

const toResume = (row: Row): SavedResume => ({
  text: row.text,
  filename: row.filename,
  savedAt: row.updated_at.getTime(),
});

/**
 * The account's saved resume, or null.
 *
 * Every query here is keyed by user_id and nothing accepts a row id, so there
 * is no shape of request that reads across accounts.
 */
export async function getSavedResume(userId: string): Promise<SavedResume | null> {
  const sql = db();
  const rows = await sql<Row[]>`
    SELECT text, filename, updated_at FROM saved_resumes WHERE user_id = ${userId}
  `;
  return rows[0] ? toResume(rows[0]) : null;
}

/** Replaces whatever was there: the account has one resume, not a collection. */
export async function putSavedResume(userId: string, text: string, filename: string): Promise<SavedResume> {
  const sql = db();
  const rows = await sql<Row[]>`
    INSERT INTO saved_resumes (user_id, text, filename, updated_at)
    VALUES (${userId}, ${text}, ${filename}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET text = EXCLUDED.text, filename = EXCLUDED.filename, updated_at = now()
    RETURNING text, filename, updated_at
  `;
  return toResume(rows[0]);
}

/** True when there was one to forget. */
export async function clearSavedResume(userId: string): Promise<boolean> {
  const sql = db();
  const rows = await sql<{ user_id: string }[]>`
    DELETE FROM saved_resumes WHERE user_id = ${userId} RETURNING user_id
  `;
  return rows.length > 0;
}
