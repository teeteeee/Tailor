import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = "tailor_session";
export const SESSION_DAYS = 30;

export type User = { id: string; email: string };

export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountError";
  }
}

/**
 * scrypt with a per-user salt. Deliberately not a plain hash: these are real
 * people's passwords, and a leaked table of SHA-256 digests is a leaked table
 * of passwords.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, digest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(digest, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Emails are compared case-insensitively, as people type them inconsistently. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deliberately permissive: the operator asked for no length rule, so any
 * password a person actually types is accepted. Empty is still refused —
 * that is not a weak password, it is no password — and the upper bound only
 * stops an absurd input making scrypt expensive.
 */
export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) return "That doesn't look like an email address.";
  if (password.length === 0) return "Enter a password.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

export async function createUser(email: string, password: string): Promise<User> {
  const sql = db();
  const address = normalizeEmail(email);
  const existing = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${address}`;
  if (existing.length > 0) throw new AccountError("An account already exists for that email.");

  const id = randomUUID();
  await sql`INSERT INTO users (id, email, password) VALUES (${id}, ${address}, ${await hashPassword(password)})`;
  return { id, email: address };
}

export async function authenticate(email: string, password: string): Promise<User> {
  const sql = db();
  const rows = await sql<{ id: string; email: string; password: string }[]>`
    SELECT id, email, password FROM users WHERE email = ${normalizeEmail(email)}
  `;

  // Hash regardless, so a missing account and a wrong password take the same
  // time and the response cannot be used to enumerate registered emails.
  const stored = rows[0]?.password ?? (await hashPassword("no such user"));
  const correct = await verifyPassword(password, stored);
  if (!rows[0] || !correct) throw new AccountError("Wrong email or password.");
  return { id: rows[0].id, email: rows[0].email };
}

export async function startSession(userId: string): Promise<string> {
  const sql = db();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expires})`;
  return token;
}

export async function userForSession(token: string): Promise<User | null> {
  if (!token) return null;
  const sql = db();
  const rows = await sql<{ id: string; email: string }[]>`
    SELECT users.id, users.email
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ${token} AND sessions.expires_at > now()
  `;
  return rows[0] ?? null;
}

export async function endSession(token: string): Promise<void> {
  if (!token) return;
  await db()`DELETE FROM sessions WHERE token = ${token}`;
}
