import { describe, expect, it } from "vitest";
import { applyRejections, getAtPath, mergeChanges } from "../apply";
import type { Change } from "../schema";
import { makeResume } from "./fixtures";

const change = (overrides: Partial<Change>): Change => ({
  id: "c1",
  kind: "edit",
  path: "summary",
  label: "Summary",
  before: "old",
  after: "new",
  rationale: "because",
  ...overrides,
});

describe("applyRejections", () => {
  it("leaves the tailored resume untouched when nothing is rejected", () => {
    const tailored = makeResume({ summary: "new" });
    expect(applyRejections(tailored, [change({})], [])).toEqual(tailored);
  });

  it("reverts a rejected string edit to its previous value", () => {
    const tailored = makeResume({ summary: "new" });
    const result = applyRejections(tailored, [change({})], ["c1"]);
    expect(result.summary).toBe("old");
  });

  it("does not mutate the input resume", () => {
    const tailored = makeResume({ summary: "new" });
    applyRejections(tailored, [change({})], ["c1"]);
    expect(tailored.summary).toBe("new");
  });

  it("reverts an edited bullet by index", () => {
    const tailored = makeResume();
    tailored.experience[0].bullets[1] = "Led a team of two";
    const result = applyRejections(
      tailored,
      [change({ path: "experience.0.bullets.1", before: "Mentored two engineers", after: "Led a team of two" })],
      ["c1"],
    );
    expect(result.experience[0].bullets).toEqual(["Built an ETL pipeline", "Mentored two engineers"]);
  });

  it("splits newline-separated values back into list fields", () => {
    const tailored = makeResume({ skills: [{ category: "Languages", items: ["Go", "Python", "Rust"] }] });
    const result = applyRejections(
      tailored,
      [change({ path: "skills.0.items", before: "Python\nGo", after: "Go\nPython\nRust" })],
      ["c1"],
    );
    expect(result.skills[0].items).toEqual(["Python", "Go"]);
  });

  it("removes an added bullet when the addition is rejected", () => {
    const tailored = makeResume();
    tailored.experience[0].bullets.push("Owned the on-call rotation");
    const result = applyRejections(
      tailored,
      [change({ kind: "add", path: "experience.0.bullets.2", before: "", after: "Owned the on-call rotation" })],
      ["c1"],
    );
    expect(result.experience[0].bullets).toHaveLength(2);
  });

  it("removes multiple added bullets without index drift", () => {
    const tailored = makeResume();
    tailored.experience[0].bullets.push("Added A", "Added B");
    const changes = [
      change({ id: "a", kind: "add", path: "experience.0.bullets.2", before: "", after: "Added A" }),
      change({ id: "b", kind: "add", path: "experience.0.bullets.3", before: "", after: "Added B" }),
    ];
    const result = applyRejections(tailored, changes, ["a", "b"]);
    expect(result.experience[0].bullets).toEqual(["Built an ETL pipeline", "Mentored two engineers"]);
  });

  it("restores a bullet the model dropped when the removal is rejected", () => {
    const tailored = makeResume();
    tailored.experience[0].bullets = ["Built an ETL pipeline"];
    const result = applyRejections(
      tailored,
      [change({ kind: "remove", path: "experience.0.bullets.1", before: "Mentored two engineers", after: "" })],
      ["c1"],
    );
    expect(result.experience[0].bullets).toEqual(["Built an ETL pipeline", "Mentored two engineers"]);
  });

  it("ignores changes whose path does not resolve", () => {
    const tailored = makeResume();
    const result = applyRejections(tailored, [change({ path: "experience.9.bullets.0" })], ["c1"]);
    expect(result).toEqual(tailored);
  });
});

describe("getAtPath", () => {
  it("walks objects and arrays", () => {
    const resume = makeResume();
    expect(getAtPath(resume, "experience.0.company")).toBe("Analytical Engines");
    expect(getAtPath(resume, "experience.0.bullets.1")).toBe("Mentored two engineers");
    expect(getAtPath(resume, "experience.5.company")).toBeUndefined();
  });
});

describe("mergeChanges", () => {
  const make = (id: string, path = "summary"): Change => change({ id, path });

  it("appends changes with fresh ids untouched", () => {
    const merged = mergeChanges([make("c1")], [make("g1")]);
    expect(merged.map((c) => c.id)).toEqual(["c1", "g1"]);
  });

  it("renames a colliding id so rejecting one cannot revert another", () => {
    const merged = mergeChanges([make("c1"), make("c2")], [make("c1")]);
    expect(merged.map((c) => c.id)).toEqual(["c1", "c2", "c1-2"]);
    expect(new Set(merged.map((c) => c.id)).size).toBe(3);
  });

  it("keeps renaming when the renamed id also collides", () => {
    const merged = mergeChanges([make("c1"), make("c1-2")], [make("c1"), make("c1")]);
    expect(new Set(merged.map((c) => c.id)).size).toBe(merged.length);
    expect(merged.map((c) => c.id)).toEqual(["c1", "c1-2", "c1-3", "c1-4"]);
  });

  it("leaves the existing log untouched", () => {
    const existing = [make("c1")];
    mergeChanges(existing, [make("c1")]);
    expect(existing).toHaveLength(1);
    expect(existing[0].id).toBe("c1");
  });

  it("keeps a renamed change revertible against the resume", () => {
    const tailored = makeResume({ summary: "new" });
    const merged = mergeChanges([make("c1")], [change({ id: "c1", before: "original", after: "new" })]);
    expect(applyRejections(tailored, merged, [merged[1].id]).summary).toBe("original");
  });
});
