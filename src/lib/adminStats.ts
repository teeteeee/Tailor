import { db } from "./db";

/**
 * What an admin can see about someone else: how much they have done and when,
 * never what their resume says. The counts and the companies they applied to
 * answer "how is this going"; the resume text is theirs.
 */
export type UserActivity = {
  id: string;
  email: string;
  joinedAt: string;
  total: number;
  today: number;
  lastSevenDays: number;
  lastActiveAt: string | null;
};

export type ApplicationSummary = {
  id: string;
  company: string;
  jobTitle: string;
  matchScore: number;
  createdAt: string;
};

export type DailyCount = { day: string; count: number };

type ActivityRow = {
  id: string;
  email: string;
  created_at: Date;
  total: string;
  today: string;
  week: string;
  last_active: Date | null;
};

export type ActivitySort = "recent" | "most" | "email";

export async function listUserActivity(
  options: { query?: string; sort?: ActivitySort; limit?: number } = {},
): Promise<UserActivity[]> {
  const sql = db();
  const term = `%${(options.query ?? "").trim()}%`;
  const searching = (options.query ?? "").trim().length > 0;

  const order =
    options.sort === "most"
      ? sql`count(runs.id) DESC, users.email ASC`
      : options.sort === "email"
        ? sql`users.email ASC`
        : sql`max(runs.created_at) DESC NULLS LAST, users.email ASC`;

  const rows = await sql<ActivityRow[]>`
    SELECT
      users.id,
      users.email,
      users.created_at,
      count(runs.id)                                                            AS total,
      count(runs.id) FILTER (WHERE runs.created_at >= date_trunc('day', now())) AS today,
      count(runs.id) FILTER (WHERE runs.created_at >= now() - interval '7 days') AS week,
      max(runs.created_at)                                                      AS last_active
    FROM users
    LEFT JOIN runs ON runs.user_id = users.id
    ${searching ? sql`WHERE users.email ILIKE ${term}` : sql``}
    GROUP BY users.id, users.email, users.created_at
    ORDER BY ${order}
    LIMIT ${Math.min(options.limit ?? 200, 500)}
  `;

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    joinedAt: row.created_at.toISOString(),
    total: Number(row.total),
    today: Number(row.today),
    lastSevenDays: Number(row.week),
    lastActiveAt: row.last_active ? row.last_active.toISOString() : null,
  }));
}

/** One person's applications — company, role, score and when. No resume content. */
export async function listUserApplications(userId: string, limit = 100): Promise<ApplicationSummary[]> {
  const sql = db();
  const rows = await sql<{ id: string; company: string; job_title: string; match_score: number; created_at: Date }[]>`
    SELECT id, company, job_title, match_score, created_at
    FROM runs WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${Math.min(limit, 500)}
  `;
  return rows.map((row) => ({
    id: row.id,
    company: row.company,
    jobTitle: row.job_title,
    matchScore: row.match_score,
    createdAt: row.created_at.toISOString(),
  }));
}

/** Applications per day, newest first — the shape of someone's week. */
export async function dailyCounts(userId: string, days = 14): Promise<DailyCount[]> {
  const sql = db();
  const rows = await sql<{ day: Date; count: string }[]>`
    SELECT date_trunc('day', created_at) AS day, count(*) AS count
    FROM runs
    WHERE user_id = ${userId} AND created_at >= now() - (${days} * interval '1 day')
    GROUP BY 1
    ORDER BY 1 DESC
  `;
  return rows.map((row) => ({ day: row.day.toISOString().slice(0, 10), count: Number(row.count) }));
}
