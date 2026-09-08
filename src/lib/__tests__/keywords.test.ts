import { describe, expect, it } from "vitest";
import { coverageRatio, keywordCoverage, keywordCoverageInText } from "../keywords";
import { makeResume } from "./fixtures";

describe("keywordCoverage", () => {
  it("finds keywords and reports where they appear", () => {
    const [python] = keywordCoverage(makeResume(), ["Python"]);
    expect(python.present).toBe(true);
    expect(python.locations).toContain("Skills");
  });

  it("matches case- and punctuation-insensitively", () => {
    expect(keywordCoverage(makeResume(), ["etl pipeline"])[0].present).toBe(true);
  });

  it("keeps symbol-bearing keywords intact", () => {
    const resume = makeResume({ skills: [{ category: "Languages", items: ["C++", "C#", "Node.js"] }] });
    const hits = keywordCoverage(resume, ["C++", "Node.js"]);
    expect(hits.every((hit) => hit.present)).toBe(true);
  });

  it("does not match a keyword inside a longer word", () => {
    const resume = makeResume({ summary: "Worked on Javanese linguistics." });
    expect(keywordCoverage(resume, ["Java"])[0].present).toBe(false);
  });

  it("reports absent keywords with no locations", () => {
    const hit = keywordCoverage(makeResume(), ["Kubernetes"])[0];
    expect(hit.present).toBe(false);
    expect(hit.locations).toEqual([]);
  });

  it("computes a percentage", () => {
    expect(coverageRatio(keywordCoverage(makeResume(), ["Python", "Kubernetes"]))).toBe(50);
    expect(coverageRatio([])).toBe(0);
  });
});

describe("keywordCoverageInText", () => {
  it("matches against raw resume text", () => {
    const text = "Ada Lovelace\nBuilt an ETL pipeline in Go and Python.";
    const hits = keywordCoverageInText(text, ["Go", "Kubernetes"]);
    expect(hits[0]).toEqual({ keyword: "Go", present: true, locations: ["Resume"] });
    expect(hits[1]).toEqual({ keyword: "Kubernetes", present: false, locations: [] });
  });

  it("uses the same whole-word rule as the structured matcher", () => {
    expect(keywordCoverageInText("Worked on Javanese linguistics.", ["Java"])[0].present).toBe(false);
  });
});
