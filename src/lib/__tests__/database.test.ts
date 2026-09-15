import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, migrate, resetDbClient } from "../db";
import {
  AccountError,
  authenticate,
  createUser,
  endSession,
  hashPassword,
  normalizeEmail,
  startSession,
  userForSession,
  validateCredentials,
  verifyPassword,
} from "../accounts";
import { deleteRun, getRun, listRuns, saveRun, setPinned, type RunPayload } from "../runs";
import { makeResume } from "./fixtures";

const payload = (company: string, title = "Engineer"): RunPayload => ({
  resumeText: "Ada Lovelace, engineer.",
  job: { title, company, location: "London", seniority: "Mid", summary: "", mustHave: [], niceToHave: [], responsibilities: [], keywords: ["Go"] },
  result: { resume: makeResume(), changes: [], matchScore: 72, scoreRationale: "", gaps: [], interviewTalkingPoints: [] },
  coverage: { before: [], after: [] },
  rejected: [],
  answers: [],
});

describe.runIf(process.env.DATABASE_URL)("database", () => {
  beforeAll(async () => {
    await migrate();
  });
  afterAll(async () => {
    await resetDbClient();
  });
  beforeEach(async () => {
    await db()`TRUNCATE users, sessions, runs CASCADE`;
  });

  describe("passwords", () => {
    it("round-trips a password without storing it", async () => {
      const stored = await hashPassword("correct horse battery");
      expect(stored).not.toContain("correct horse");
      expect(await verifyPassword("correct horse battery", stored)).toBe(true);
      expect(await verifyPassword("wrong", stored)).toBe(false);
    });

    it("salts, so the same password hashes differently each time", async () => {
      expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
    });

    it("rejects a malformed stored value rather than throwing", async () => {
      expect(await verifyPassword("x", "not-a-hash")).toBe(false);
      expect(await verifyPassword("x", "")).toBe(false);
    });
  });

  describe("validateCredentials", () => {
    it("accepts a reasonable pair", () => {
      expect(validateCredentials("ada@example.com", "a-long-enough-password")).toBeNull();
    });

    it("rejects a bad email or a short password", () => {
      expect(validateCredentials("not-an-email", "a-long-enough-password")).toMatch(/email/);
      expect(validateCredentials("ada@example.com", "short")).toMatch(/10 characters/);
    });
  });

  describe("accounts", () => {
    it("creates an account and signs in", async () => {
      const created = await createUser("Ada@Example.com", "a-long-enough-password");
      expect(created.email).toBe("ada@example.com");
      const signedIn = await authenticate("ada@example.com", "a-long-enough-password");
      expect(signedIn.id).toBe(created.id);
    });

    it("treats email case-insensitively when signing in", async () => {
      await createUser("ada@example.com", "a-long-enough-password");
      expect((await authenticate("ADA@EXAMPLE.COM", "a-long-enough-password")).email).toBe("ada@example.com");
      expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    });

    it("refuses a duplicate email", async () => {
      await createUser("ada@example.com", "a-long-enough-password");
      await expect(createUser("ADA@example.com", "another-long-password")).rejects.toThrow(AccountError);
    });

    it("gives the same error for a wrong password and an unknown account", async () => {
      await createUser("ada@example.com", "a-long-enough-password");
      const message = async (email: string) =>
        authenticate(email, "nope-not-it-at-all").then(
          () => "unexpectedly signed in",
          (error: Error) => error.message,
        );
      expect(await message("ada@example.com")).toBe(await message("nobody@example.com"));
    });
  });

  describe("sessions", () => {
    it("resolves a session to its user and forgets it on sign-out", async () => {
      const user = await createUser("ada@example.com", "a-long-enough-password");
      const token = await startSession(user.id);
      expect((await userForSession(token))?.id).toBe(user.id);
      await endSession(token);
      expect(await userForSession(token)).toBeNull();
    });

    it("rejects an unknown or empty token", async () => {
      expect(await userForSession("")).toBeNull();
      expect(await userForSession("a".repeat(64))).toBeNull();
    });

    it("rejects an expired session", async () => {
      const user = await createUser("ada@example.com", "a-long-enough-password");
      const token = await startSession(user.id);
      await db()`UPDATE sessions SET expires_at = now() - interval '1 day' WHERE token = ${token}`;
      expect(await userForSession(token)).toBeNull();
    });

    it("drops sessions when the account goes", async () => {
      const user = await createUser("ada@example.com", "a-long-enough-password");
      const token = await startSession(user.id);
      await db()`DELETE FROM users WHERE id = ${user.id}`;
      expect(await userForSession(token)).toBeNull();
    });
  });

  describe("runs", () => {
    let ada = "";
    let bob = "";
    beforeEach(async () => {
      ada = (await createUser("ada@example.com", "a-long-enough-password")).id;
      bob = (await createUser("bob@example.com", "a-long-enough-password")).id;
    });

    it("saves a run and reads it back whole", async () => {
      const id = await saveRun(ada, payload("Northwind"));
      const run = await getRun(ada, id);
      expect(run?.company).toBe("Northwind");
      expect(run?.matchScore).toBe(72);
      expect(run?.payload.job.title).toBe("Engineer");
      expect(run?.payload.result.resume.contact.name).toBe("Ada Lovelace");
    });

    it("never shows one person another person's runs", async () => {
      const id = await saveRun(ada, payload("Northwind"));
      expect(await getRun(bob, id)).toBeNull();
      expect(await listRuns(bob)).toHaveLength(0);
      expect(await setPinned(bob, id, true)).toBeNull();
      expect(await deleteRun(bob, id)).toBe(false);
      expect(await getRun(ada, id)).not.toBeNull();
    });

    it("lists newest first", async () => {
      const first = await saveRun(ada, payload("First"));
      await db()`UPDATE runs SET created_at = now() - interval '1 day' WHERE id = ${first}`;
      await saveRun(ada, payload("Second"));
      expect((await listRuns(ada)).map((r) => r.company)).toEqual(["Second", "First"]);
    });

    it("floats pinned runs to the top", async () => {
      const older = await saveRun(ada, payload("Older"));
      await db()`UPDATE runs SET created_at = now() - interval '1 day' WHERE id = ${older}`;
      await saveRun(ada, payload("Newer"));
      expect(await setPinned(ada, older, true)).toBe(true);
      expect((await listRuns(ada)).map((r) => r.company)).toEqual(["Older", "Newer"]);
    });

    it("searches company and job title, case-insensitively", async () => {
      await saveRun(ada, payload("Northwind", "Platform Engineer"));
      await saveRun(ada, payload("Acme", "Data Analyst"));
      expect((await listRuns(ada, { query: "north" })).map((r) => r.company)).toEqual(["Northwind"]);
      expect((await listRuns(ada, { query: "ANALYST" })).map((r) => r.company)).toEqual(["Acme"]);
      expect(await listRuns(ada, { query: "nothing here" })).toHaveLength(0);
    });

    it("filters to pinned only, and by date", async () => {
      const old = await saveRun(ada, payload("Old"));
      await db()`UPDATE runs SET created_at = now() - interval '10 days' WHERE id = ${old}`;
      const recent = await saveRun(ada, payload("Recent"));
      await setPinned(ada, recent, true);

      expect((await listRuns(ada, { pinnedOnly: true })).map((r) => r.company)).toEqual(["Recent"]);
      const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect((await listRuns(ada, { since })).map((r) => r.company)).toEqual(["Recent"]);
    });

    it("unpins and deletes", async () => {
      const id = await saveRun(ada, payload("Northwind"));
      await setPinned(ada, id, true);
      expect(await setPinned(ada, id, false)).toBe(false);
      expect(await deleteRun(ada, id)).toBe(true);
      expect(await getRun(ada, id)).toBeNull();
    });

    it("takes a run's history with the account", async () => {
      await saveRun(ada, payload("Northwind"));
      await db()`DELETE FROM users WHERE id = ${ada}`;
      expect(await db()`SELECT id FROM runs WHERE user_id = ${ada}`).toHaveLength(0);
    });
  });
});
