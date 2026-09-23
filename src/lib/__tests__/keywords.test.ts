import { describe, expect, it } from "vitest";
import { coverageRatio, keywordCoverage, keywordCoverageInText, normalizeKeywords } from "../keywords";
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

  // A bullet very often ends on the keyword, so a full stop swallowing the
  // match cost real coverage and read as a gap the candidate had to close.
  it("matches a keyword that ends a sentence", () => {
    const resume = makeResume({ summary: "Rolled out Kubernetes." });
    expect(keywordCoverage(resume, ["Kubernetes"])[0].present).toBe(true);
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

  it("is not thrown by the punctuation that ends a bullet", () => {
    const present = (text: string, keyword: string) => keywordCoverageInText(text, [keyword])[0].present;

    // A trailing full stop is punctuation, and used to hide the match.
    expect(present("Used Kubernetes.", "Kubernetes")).toBe(true);
    expect(present("Scaled to 4,000 endpoints.", "endpoints")).toBe(true);
    expect(present("Wrote C#.", "C#")).toBe(true);
    expect(present("Built with Node.js.", "Node.js")).toBe(true);
    expect(present("Migrated to .NET.", ".NET")).toBe(true);
    expect(present("Ran SIEM tuning (Splunk).", "Splunk")).toBe(true);
    expect(present("Owned CI/CD, Terraform, and on-call.", "Terraform")).toBe(true);

    // …and dropping it must not start matching things that are not there.
    expect(present("Worked on Javanese linguistics.", "Java")).toBe(false);
    expect(present("Python3 scripting.", "Python")).toBe(false);
    expect(present("Shipped Node.js services.", "Node")).toBe(false);
  });
});

describe("normalizeKeywords", () => {
  it("removes exact duplicates, keeping the first", () => {
    expect(normalizeKeywords(["Intune", "Go", "Intune"])).toEqual(["Intune", "Go"]);
  });

  it("removes duplicates that differ only in case or spacing", () => {
    expect(normalizeKeywords(["Intune", "intune", " INTUNE "])).toEqual(["Intune"]);
  });

  it("drops blanks", () => {
    expect(normalizeKeywords(["Go", "", "   ", "Kafka"])).toEqual(["Go", "Kafka"]);
  });

  it("keeps genuinely different keywords that look similar", () => {
    expect(normalizeKeywords(["Java", "JavaScript"])).toEqual(["Java", "JavaScript"]);
  });

  it("preserves order", () => {
    expect(normalizeKeywords(["C", "B", "A", "B"])).toEqual(["C", "B", "A"]);
  });
});

describe("coverage with a duplicated keyword list", () => {
  it("returns one hit per keyword, so chip keys stay unique", () => {
    const hits = keywordCoverage(makeResume(), ["Python", "python", "Go", "Python"]);
    expect(hits.map((hit) => hit.keyword)).toEqual(["Python", "Go"]);
    expect(new Set(hits.map((hit) => hit.keyword)).size).toBe(hits.length);
  });

  it("does the same for the raw-text variant, so before and after stay aligned", () => {
    const before = keywordCoverageInText("Ada builds things in Go.", ["Go", "go", "Kafka"]);
    const after = keywordCoverage(makeResume(), ["Go", "go", "Kafka"]);
    expect(before.map((hit) => hit.keyword)).toEqual(after.map((hit) => hit.keyword));
  });
});
