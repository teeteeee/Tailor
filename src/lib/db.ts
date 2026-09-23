import postgres from "postgres";

/**
 * The app runs with or without a database.
 *
 * Without DATABASE_URL there are no accounts and no history, and access falls
 * back to the shared password or the public flag — which is how every existing
 * deployment already works, so adding history does not force a migration on
 * anyone who does not want one.
 */
export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

let client: postgres.Sql | null = null;

export function db(): postgres.Sql {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set, so there is no database to talk to.");
  // One pool per process, created on first use: module load happens during the
  // build, where connecting would be both pointless and fatal.
  client ??= postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Transaction-mode poolers — Supabase's Supavisor, PgBouncer, Neon's pooled
    // endpoint — hand each query to whichever backend is free, so a statement
    // prepared on one connection is missing on the next. postgres.js prepares
    // by default, which connects fine and then fails on the first query, in
    // production only. The cost of turning it off is negligible here: these are
    // a handful of small queries per request.
    prepare: false,
  });
  return client;
}

/** Only for tests, which swap databases between suites. */
export async function resetDbClient(): Promise<void> {
  await client?.end({ timeout: 5 });
  client = null;
  migrated = null;
}

/**
 * Bring the schema up to date. Idempotent, so it is safe to run on every boot —
 * which is how a serverless deployment gets migrated without a separate step.
 */
export async function migrate(): Promise<void> {
  const sql = db();
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      password     TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token        TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS runs (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company      TEXT NOT NULL DEFAULT '',
      job_title    TEXT NOT NULL DEFAULT '',
      match_score  INTEGER NOT NULL DEFAULT 0,
      pinned       BOOLEAN NOT NULL DEFAULT false,
      payload      JSONB NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // One resume per account, hence the primary key on user_id: the app has a
  // single "your saved resume" slot, and an upsert keeps it that way. It lives
  // here rather than in the browser so signing in on another machine finds it.
  await sql`
    CREATE TABLE IF NOT EXISTS saved_resumes (
      user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      text         TEXT NOT NULL,
      filename     TEXT NOT NULL DEFAULT '',
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS runs_user_created ON runs (user_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at)`;

  // On Supabase the public schema is published through PostgREST using a key
  // that is meant to be public, and these tables hold password hashes, session
  // tokens and people's resumes. The app reaches them over a direct Postgres
  // connection and never through that API, so row-level security with no
  // policies is exactly right: it denies the API roles outright, while the
  // owning role the app connects as bypasses RLS and is unaffected.
  await sql`ALTER TABLE users ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE sessions ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE runs ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE saved_resumes ENABLE ROW LEVEL SECURITY`;

  // Those roles exist only on Supabase, hence the guard: plain Postgres has
  // neither, and an unguarded REVOKE would fail the migration there.
  await sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE users, sessions, runs, saved_resumes FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE users, sessions, runs, saved_resumes FROM authenticated;
      END IF;
    END $$
  `;
}

let migrated: Promise<void> | null = null;

/**
 * migrate() for routes that run on an ordinary request rather than a sign-in.
 *
 * The schema only has to be brought up once per process, and a serverless
 * instance serves many requests, so paying eight round trips on each of them
 * would be pure latency. A failure is not cached: the next caller retries.
 */
export function ensureMigrated(): Promise<void> {
  migrated ??= migrate().catch((error) => {
    migrated = null;
    throw error;
  });
  return migrated;
}
