import { describe, expect, it } from "vitest";
import { decideAccess } from "../access";
import { sessionToken } from "../auth";

const PASSWORD = "correct horse battery";
const VALID_COOKIE = sessionToken(PASSWORD);

const decide = (overrides: Partial<Parameters<typeof decideAccess>[0]> = {}) =>
  decideAccess({
    pathname: "/",
    password: PASSWORD,
    isPublic: false,
    isProduction: true,
    cookie: "",
    ...overrides,
  }).type;

describe("decideAccess", () => {
  describe("with a password set", () => {
    it("allows a request carrying the right session cookie", () => {
      expect(decide({ cookie: VALID_COOKIE })).toBe("allow");
    });

    it("sends a page request with no session to the login page", () => {
      expect(decide()).toBe("login");
    });

    it("answers an API request with 401 rather than a login page", () => {
      expect(decide({ pathname: "/api/tailor" })).toBe("unauthorized");
      expect(decide({ pathname: "/api/export" })).toBe("unauthorized");
    });

    it("always lets the sign-in route through", () => {
      expect(decide({ pathname: "/login" })).toBe("allow");
      expect(decide({ pathname: "/api/login" })).toBe("allow");
    });

    it("rejects a forged or stale cookie", () => {
      expect(decide({ cookie: "a".repeat(64) })).toBe("login");
      expect(decide({ cookie: sessionToken("a different password") })).toBe("login");
      expect(decide({ cookie: PASSWORD })).toBe("login");
    });
  });

  describe("with no password set", () => {
    it("closes the site in production, rather than quietly opening it", () => {
      expect(decide({ password: undefined })).toBe("closed");
      expect(decide({ password: undefined, pathname: "/api/tailor" })).toBe("closed");
      expect(decide({ password: "" })).toBe("closed");
    });

    it("stays open in development, so local work needs no setup", () => {
      expect(decide({ password: undefined, isProduction: false })).toBe("allow");
    });
  });

  describe("when deliberately made public", () => {
    it("allows everything, password or not", () => {
      expect(decide({ isPublic: true, password: undefined })).toBe("allow");
      expect(decide({ isPublic: true, pathname: "/api/tailor" })).toBe("allow");
      expect(decide({ isPublic: true, password: PASSWORD, cookie: "" })).toBe("allow");
    });

    it("is a separate decision from forgetting a password — only an explicit flag opens the site", () => {
      // The accident (no password, not public) must still close.
      expect(decide({ password: undefined, isPublic: false })).toBe("closed");
    });
  });
});
