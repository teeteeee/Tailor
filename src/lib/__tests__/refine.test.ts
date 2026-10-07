import { describe, expect, it } from "vitest";
import { screenRefinement } from "../refine";
import type { Change } from "../schema";

const RESUME = `Titi Adesola
Security Analyst

Northwind Health - Security Analyst, 2021-2024
- Ran Intune compliance reporting across 4,000 endpoints.
- Cut phishing response time from 40 minutes to 9.`;

const change = (over: Partial<Change> = {}): Change => ({
  id: "c1",
  kind: "edit",
  path: "experience.0.bullets.0",
  label: "Northwind Health",
  before: "",
  after: "",
  rationale: "",
  ...over,
});

const screen = (changes: Change[], instruction: string) =>
  screenRefinement(changes, { resumeText: RESUME, instruction });

describe("screenRefinement", () => {
  it("lets through what the candidate actually said", () => {
    const { changes, refused } = screen(
      [change({ kind: "add", after: "Mentored two new analysts through onboarding." })],
      "add that I mentored two new analysts through onboarding",
    );
    expect(changes).toHaveLength(1);
    expect(refused).toEqual([]);
  });

  // The characteristic failure: asked to add a line, the model makes it impressive.
  it("refuses a metric nobody gave it", () => {
    const { changes, refused } = screen(
      [change({ kind: "add", after: "Mentored 3 analysts, cutting onboarding time by 40%." })],
      "add that I mentored the new analysts",
    );
    expect(changes).toEqual([]);
    expect(refused[0]).toContain("3");
    expect(refused[0]).toContain("40");
  });

  it("keeps a number the candidate supplied in the instruction", () => {
    const { changes, refused } = screen(
      [change({ kind: "add", after: "Mentored 3 new analysts." })],
      "add that I mentored 3 new analysts",
    );
    expect(changes).toHaveLength(1);
    expect(refused).toEqual([]);
  });

  // "40 minutes" on the resume must not license a new claim of "40%".
  it("treats a figure and its unit as one claim", () => {
    const { changes, refused } = screen(
      [change({ kind: "add", after: "Cut onboarding time by 40%." })],
      "add a line about onboarding",
    );
    expect(changes).toEqual([]);
    expect(refused[0]).toContain("40%");
  });

  it("accepts percent spelled out against a resume that uses the sign", () => {
    const { changes } = screenRefinement(
      [change({ kind: "add", after: "Improved coverage by 12 percent." })],
      { resumeText: "Improved coverage by 12%.", instruction: "mention the coverage work" },
    );
    expect(changes).toHaveLength(1);
  });

  it("keeps numbers already on the resume, however they are written", () => {
    const { changes } = screen(
      [change({ after: "Reported Intune compliance across 4000 endpoints." })],
      "shorten the first Northwind bullet",
    );
    expect(changes).toHaveLength(1);
  });

  // Rewording a bullet must not lose the figures the bullet already had.
  it("keeps figures carried over from the line being replaced", () => {
    const { changes } = screen(
      [
        change({
          before: "Cut phishing response time from 40 minutes to 9.",
          after: "Cut phishing response from 40 minutes to 9.",
        }),
      ],
      "tighten that bullet",
    );
    expect(changes).toHaveLength(1);
  });

  it("refuses placeholder text outright", () => {
    const { changes, refused } = screen(
      [change({ kind: "add", after: "AI and automation work — to be populated upon hire." })],
      "add something about AI work",
    );
    expect(changes).toEqual([]);
    expect(refused[0]).toContain("placeholder");
  });

  it("screens each change on its own, keeping the good ones", () => {
    const { changes, refused } = screen(
      [
        change({ id: "c1", kind: "add", after: "Mentored new analysts." }),
        change({ id: "c2", kind: "add", after: "Saved the company $2,000,000." }),
      ],
      "add that I mentored the new analysts",
    );
    expect(changes.map((entry) => entry.id)).toEqual(["c1"]);
    expect(refused).toHaveLength(1);
  });

  it("never blocks a removal, which claims nothing", () => {
    const { changes, refused } = screen(
      [change({ kind: "remove", before: "Cut phishing response time from 40 minutes to 9.", after: "" })],
      "drop the phishing bullet",
    );
    expect(changes).toHaveLength(1);
    expect(refused).toEqual([]);
  });

  it("names the change it refused, so the reply is specific", () => {
    const { refused } = screen(
      [change({ label: "Northwind Health", kind: "add", after: "Led a team of 12." })],
      "say I led the team",
    );
    expect(refused[0]).toContain("Northwind Health");
  });
});
