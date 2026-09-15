import { SESSION_COOKIE, safeEqual, sessionToken } from "./auth";

export type AccessDecision =
  /** Let the request through. */
  | { type: "allow" }
  /** Deployed with no access configured at all — refuse everything. */
  | { type: "closed" }
  /** A page request with no session: send them to the password prompt. */
  | { type: "login" }
  /** An API request with no session: an error, not a login page. */
  | { type: "unauthorized" };

/** Reachable without a session, or there would be no way to sign in. */
const OPEN_PATHS = new Set(["/login", "/api/login"]);

/**
 * The whole access rule, as a pure function so it can be tested.
 *
 * `isPublic` is the operator saying, deliberately, that anyone with the link
 * may use this — and therefore spend the API credits behind it. It is separate
 * from an absent password on purpose: forgetting to set one is an accident and
 * still closes the site, while opening it up has to be stated.
 */
export function decideAccess(input: {
  pathname: string;
  password: string | undefined;
  isPublic: boolean;
  isProduction: boolean;
  cookie: string;
}): AccessDecision {
  const { pathname, password, isPublic, isProduction, cookie } = input;

  if (isPublic) return { type: "allow" };
  if (!password) return isProduction ? { type: "closed" } : { type: "allow" };
  if (OPEN_PATHS.has(pathname)) return { type: "allow" };
  if (safeEqual(cookie, sessionToken(password))) return { type: "allow" };

  return pathname.startsWith("/api/") ? { type: "unauthorized" } : { type: "login" };
}

export { SESSION_COOKIE };
