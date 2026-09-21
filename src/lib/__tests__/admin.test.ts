import { describe, expect, it } from "vitest";
import { adminEmails, isAdminEmail } from "../admin";

describe("adminEmails", () => {
  it("reads a comma-separated list", () => {
    expect(adminEmails("a@x.com,b@y.com")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("tolerates spaces, newlines and stray commas", () => {
    expect(adminEmails(" a@x.com ,, \n b@y.com  ")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("is empty when unset", () => {
    expect(adminEmails(undefined)).toEqual([]);
    expect(adminEmails("")).toEqual([]);
  });
});

describe("isAdminEmail", () => {
  it("matches regardless of case or surrounding space", () => {
    expect(isAdminEmail("Titi@Example.com", "titi@example.com")).toBe(true);
    expect(isAdminEmail(" titi@example.com ", "TITI@EXAMPLE.COM")).toBe(true);
  });

  it("does not match anyone else", () => {
    expect(isAdminEmail("someone@else.com", "titi@example.com")).toBe(false);
  });

  it("grants nobody when the list is unset — the safe default", () => {
    expect(isAdminEmail("titi@example.com", undefined)).toBe(false);
    expect(isAdminEmail("titi@example.com", "")).toBe(false);
  });

  it("never treats an empty email as an admin", () => {
    expect(isAdminEmail("", "")).toBe(false);
    expect(isAdminEmail("", "titi@example.com,")).toBe(false);
  });

  it("does not match on a prefix or a substring", () => {
    expect(isAdminEmail("titi@example.com.attacker.net", "titi@example.com")).toBe(false);
    expect(isAdminEmail("nottiti@example.com", "titi@example.com")).toBe(false);
  });
});
