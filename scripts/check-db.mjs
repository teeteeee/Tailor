/**
 * Answers one question: can this machine reach the database, and is the schema
 * there? Uses the Postgres client the app already depends on, so it needs no
 * psql and no extra install.
 *
 *   npm run db:check
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();

if (!url) {
  console.error("✖ DATABASE_URL is not set.");
  console.error("");
  console.error("  Add it to .env.local in this folder, in single quotes:");
  console.error("    DATABASE_URL='postgresql://postgres.xxxx:PASSWORD@aws-0-...pooler.supabase.com:6543/postgres'");
  console.error("");
  console.error("  Without it the app still runs — it just has no accounts and no history.");
  process.exit(1);
}

// prepare: false for the same reason the app does it — transaction poolers
// hand each query a different backend, so prepared statements go missing.
const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5, prepare: false });

try {
  const [{ now }] = await sql`SELECT now()`;
  console.log(`✔ Connected. The database says the time is ${new Date(now).toISOString()}.`);

  const expected = ["users", "sessions", "runs"];
  const found = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ${sql(expected)}
  `;
  const names = found.map((row) => row.table_name);
  const missing = expected.filter((table) => !names.includes(table));

  if (missing.length > 0) {
    console.log(`… Missing ${missing.join(", ")}. The app creates these on first use, so this is fine.`);
  } else {
    const [{ users }] = await sql`SELECT count(*)::int AS users FROM users`;
    const [{ runs }] = await sql`SELECT count(*)::int AS runs FROM runs`;
    console.log(`✔ Schema is in place: ${users} account(s), ${runs} tailored resume(s) saved.`);
    if (users === 0) console.log("  Nothing saved yet — sign up at http://localhost:3000 and tailor one.");
  }

  console.log("");
  console.log("Everything checks out. Run `npm run dev` and you should see a sign-up form.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✖ Could not use the database: ${message}`);
  console.error("");

  if (/password authentication failed|SASL|authentication/i.test(message)) {
    console.error("  The password was rejected. Two usual causes:");
    console.error("   • it is wrong — reset it in Supabase and copy the whole string again;");
    console.error("   • it is double-encoded — %25 in the string means a literal %, which is");
    console.error("     usually a sign the password was escaped twice.");
  } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    console.error("  That host could not be found. Check the address was copied whole.");
  } else if (/ETIMEDOUT|ECONNREFUSED|timeout/i.test(message)) {
    console.error("  Nothing answered. Use the Transaction pooler string (port 6543) rather than");
    console.error("  the direct connection, which is IPv6-only on Supabase's free tier.");
  } else if (/does not exist/i.test(message)) {
    console.error("  Connected, but something is missing from the database. The app creates its");
    console.error("  own tables on first use, so try `npm run dev` and sign up.");
  }
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
