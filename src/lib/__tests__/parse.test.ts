import { describe, expect, it, vi } from "vitest";
import { parseGapFill, parseTailorResult } from "../parse";
import { makeResume } from "./fixtures";

const change = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  kind: "edit",
  path: "summary",
  label: "Summary",
  before: "old text",
  after: "new text",
  rationale: "serves the posting",
  ...overrides,
});

const result = (changes: unknown[]) =>
  JSON.stringify({
    resume: makeResume(),
    changes,
    matchScore: 70,
    scoreRationale: "fine",
    gaps: [],
    interviewTalkingPoints: [],
  });

describe("parseTailorResult", () => {
  it("parses a well-formed response", () => {
    const parsed = parseTailorResult(result([change()]));
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.matchScore).toBe(70);
  });

  it("keeps an entry whose kind is not one of the three, as the edit it is", () => {
    // The exact failure seen in the wild: the model coined "reorder".
    const parsed = parseTailorResult(result([change({ kind: "reorder" })]));
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].kind).toBe("edit");
    expect(parsed.changes[0].after).toBe("new text");
  });

  it("infers add and remove from an unknown kind by what is missing", () => {
    const parsed = parseTailorResult(
      result([
        change({ id: "a", kind: "insert", before: "" }),
        change({ id: "b", kind: "delete", after: "" }),
      ]),
    );
    expect(parsed.changes.map((c) => [c.id, c.kind])).toEqual([
      ["a", "add"],
      ["b", "remove"],
    ]);
  });

  it("drops an entry too broken to repair, and keeps the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = parseTailorResult(result([change({ id: "good" }), { nonsense: true }, "not even an object"]));
    expect(parsed.changes.map((c) => c.id)).toEqual(["good"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("dropped 2"));
    warn.mockRestore();
  });

  it("still returns the resume when every change is unusable", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = parseTailorResult(result([{ nope: 1 }]));
    expect(parsed.changes).toEqual([]);
    expect(parsed.resume.contact.name).toBe("Ada Lovelace");
    vi.restoreAllMocks();
  });

  it("still fails loudly when the resume itself is malformed", () => {
    const broken = JSON.stringify({ resume: { contact: "not an object" }, changes: [], matchScore: 1, scoreRationale: "", gaps: [], interviewTalkingPoints: [] });
    expect(() => parseTailorResult(broken)).toThrow();
  });

  it("fails on content that is not JSON at all", () => {
    expect(() => parseTailorResult("I'm afraid I can't do that")).toThrow();
  });
});

describe("parseGapFill", () => {
  it("repairs an unknown kind here too", () => {
    const json = JSON.stringify({ resume: makeResume(), changes: [change({ kind: "append" })], note: "" });
    expect(parseGapFill(json).changes[0].kind).toBe("edit");
  });

  it("accepts the refusal case, where nothing changed", () => {
    const json = JSON.stringify({ resume: makeResume(), changes: [], note: "That describes Docker, not Kubernetes." });
    const parsed = parseGapFill(json);
    expect(parsed.changes).toEqual([]);
    expect(parsed.note).toContain("Docker");
  });
});
