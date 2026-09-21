import { describe, expect, it } from "vitest";
import { passwordMatches, safeEqual, sessionToken } from "../auth";

describe("sessionToken", () => {
  it("is deterministic for a password", () => {
    expect(sessionToken("hunter2")).toBe(sessionToken("hunter2"));
  });

  it("differs between passwords", () => {
    expect(sessionToken("hunter2")).not.toBe(sessionToken("hunter3"));
  });

  it("does not contain the password", () => {
    expect(sessionToken("hunter2")).not.toContain("hunter2");
    expect(sessionToken("hunter2")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("passwordMatches", () => {
  it("accepts the right password", () => {
    expect(passwordMatches("correct horse", "correct horse")).toBe(true);
  });

  it("rejects a wrong password, including a prefix of the real one", () => {
    expect(passwordMatches("wrong", "correct horse")).toBe(false);
    expect(passwordMatches("correct", "correct horse")).toBe(false);
    expect(passwordMatches("", "correct horse")).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compares equal-length strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
  });

  it("is false for different lengths rather than throwing", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "abc")).toBe(false);
  });
});
