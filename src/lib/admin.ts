import { normalizeEmail } from "./accounts";

/**
 * Who is an admin is decided by ADMIN_EMAILS, not by a column anyone can reach
 * through the app. There is deliberately no way to grant yourself the role from
 * inside the product: changing the environment variable is the only path, and
 * revoking it is the same edit in reverse.
 *
 *   ADMIN_EMAILS=titi@example.com,someone@else.com
 */
export function adminEmails(raw = process.env.ADMIN_EMAILS): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
}

export function isAdminEmail(email: string, raw = process.env.ADMIN_EMAILS): boolean {
  const address = normalizeEmail(email);
  return address.length > 0 && adminEmails(raw).includes(address);
}
