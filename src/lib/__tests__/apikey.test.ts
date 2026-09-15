import { describe, expect, it } from "vitest";
import { apiKeyProblem, normalizeApiKey } from "../claude";

const VALID = "sk-ant-api03-" + "a".repeat(80);

describe("normalizeApiKey", () => {
  it("strips the trailing newline a heredoc or echo leaves behind", () => {
    expect(normalizeApiKey(`${VALID}\n`)).toBe(VALID);
  });

  it("strips a stray trailing space", () => {
    expect(normalizeApiKey(`${VALID}  `)).toBe(VALID);
  });

  it("strips wrapping quotes of either kind", () => {
    expect(normalizeApiKey(`"${VALID}"`)).toBe(VALID);
    expect(normalizeApiKey(`'${VALID}'`)).toBe(VALID);
  });

  it("leaves a clean key alone", () => {
    expect(normalizeApiKey(VALID)).toBe(VALID);
  });

  it("does not strip quotes that are not a matched wrapping pair", () => {
    expect(normalizeApiKey(`"${VALID}`)).toBe(`"${VALID}`);
  });
});

describe("apiKeyProblem", () => {
  it("passes a well-formed key", () => {
    expect(apiKeyProblem(VALID)).toBeNull();
  });

  it("catches the placeholder from .env.example", () => {
    expect(apiKeyProblem("sk-ant-...")).toMatch(/\.\.\./);
  });

  it("catches a key abbreviated for display with an ellipsis character", () => {
    expect(apiKeyProblem("sk-ant-api03-abcd…wxyz")).toBeTruthy();
  });

  it("catches a credential that is not an Anthropic API key", () => {
    expect(apiKeyProblem("ghp_" + "a".repeat(60))).toMatch(/sk-ant-/);
  });

  it("catches a truncated key and says how short it is", () => {
    expect(apiKeyProblem("sk-ant-api03-tooshort")).toMatch(/21 characters/);
  });
});
