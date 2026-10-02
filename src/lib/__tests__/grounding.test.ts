import { describe, expect, it } from "vitest";
import { groundResult } from "../grounding";
import { applyRejections } from "../apply";
import type { Change, TailorResult } from "../schema";
import { makeResume } from "./fixtures";

/** The resume the candidate actually wrote. Nothing outside this is theirs. */
const SOURCE = `Titi Adesola
Security Analyst

EXPERIENCE
Northwind Health - Security Analyst, 2021-2024
- Ran Intune compliance reporting across 4,000 endpoints.
- Cut phishing response time from 40 minutes to 9.

EDUCATION
University of Lagos - BSc Computer Science

SKILLS
Python, SQL, Microsoft 365`;

const result = (overrides: Partial<TailorResult["resume"]>, changes: Change[] = []): TailorResult => ({
  resume: makeResume({
    experience: [
      {
        company: "Northwind Health",
        title: "Security Analyst",
        location: "",
        start: "2021",
        end: "2024",
        bullets: ["Ran Intune compliance reporting across 4,000 endpoints."],
      },
    ],
    education: [],
    projects: [],
    certifications: [],
    ...overrides,
  }),
  changes,
  matchScore: 70,
  scoreRationale: "",
  gaps: [],
  interviewTalkingPoints: [],
});

describe("groundResult", () => {
  // The case that prompted this: a resume tailored for Tarpon Health came back
  // with a section headed after the company being applied to.
  it("removes a section invented for the company being applied to", () => {
    const { result: cleaned, dropped } = groundResult(
      result({
        projects: [
          {
            name: "TARPON HEALTH PROJECTS",
            description: "(Internal and client-facing work to be populated upon hire)",
            link: "",
            bullets: [],
          },
        ],
      }),
      SOURCE,
    );

    expect(cleaned.resume.projects).toEqual([]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].section).toBe("projects");
    expect(dropped[0].label).toBe("TARPON HEALTH PROJECTS");
  });

  it("removes an invented job, however plausible", () => {
    const { result: cleaned, dropped } = groundResult(
      result({
        experience: [
          ...result({}).resume.experience,
          {
            company: "Tarpon Health",
            title: "Junior Software Engineer",
            location: "Remote",
            start: "2026",
            end: "Present",
            bullets: ["Maintaining internal automation tools and the company website."],
          },
        ],
      }),
      SOURCE,
    );

    expect(cleaned.resume.experience.map((job) => job.company)).toEqual(["Northwind Health"]);
    expect(dropped.map((entry) => entry.label)).toEqual(["Tarpon Health"]);
  });

  it("leaves a resume with nothing invented completely alone", () => {
    const original = result({
      education: [
        { institution: "University of Lagos", degree: "BSc", field: "Computer Science", start: "", end: "", details: [] },
      ],
    });
    const { result: cleaned, dropped } = groundResult(original, SOURCE);

    expect(dropped).toEqual([]);
    expect(cleaned.resume).toEqual(original.resume);
  });

  // Rewriting bullets is the whole job, so a real role must survive it.
  it("keeps a real role whose bullets were all rewritten", () => {
    const { dropped } = groundResult(
      result({
        experience: [
          {
            company: "Northwind Health",
            title: "Security Analyst",
            location: "",
            start: "2021",
            end: "2024",
            bullets: ["Owned endpoint compliance at scale, reporting on 4,000 devices through Intune."],
          },
        ],
      }),
      SOURCE,
    );
    expect(dropped).toEqual([]);
  });

  // Conservative by design: the name moved, but the work is still theirs.
  it("keeps a role whose employer was retitled, because its bullets trace back", () => {
    const { result: cleaned, dropped } = groundResult(
      result({
        experience: [
          {
            company: "Northwind Health Systems Inc.",
            title: "Analyst",
            location: "",
            start: "2021",
            end: "2024",
            bullets: ["Cut phishing response time from 40 minutes to 9."],
          },
        ],
      }),
      SOURCE,
    );
    expect(dropped).toEqual([]);
    expect(cleaned.resume.experience).toHaveLength(1);
  });

  it("strips a placeholder bullet from a role that is otherwise real", () => {
    const { result: cleaned, dropped } = groundResult(
      result({
        experience: [
          {
            company: "Northwind Health",
            title: "Security Analyst",
            location: "",
            start: "2021",
            end: "2024",
            bullets: [
              "Ran Intune compliance reporting across 4,000 endpoints.",
              "LangChain and retrieval pipeline work — to be added upon hire.",
            ],
          },
        ],
      }),
      SOURCE,
    );

    expect(cleaned.resume.experience[0].bullets).toEqual(["Ran Intune compliance reporting across 4,000 endpoints."]);
    expect(dropped.map((entry) => entry.reason)).toEqual(["Placeholder text, not something you wrote."]);
  });

  it("clears a placeholder summary", () => {
    const { result: cleaned } = groundResult(result({ summary: "[Insert tailored summary here]" }), SOURCE);
    expect(cleaned.resume.summary).toBe("");
  });

  it("does not mistake real wording for a placeholder", () => {
    const source = `${SOURCE}\n- Led the TBA migration and wrote the placeholder service.`;
    const { dropped } = groundResult(
      result({
        experience: [
          {
            company: "Northwind Health",
            title: "Security Analyst",
            location: "",
            start: "2021",
            end: "2024",
            bullets: ["Led the TBA migration and wrote the placeholder service."],
          },
        ],
      }),
      source,
    );
    expect(dropped).toEqual([]);
  });
});

describe("change paths after grounding", () => {
  // The dangerous half. applyRejections reverts by writing `before` back at
  // `path`, so a stale index would revert the wrong line — or put the invented
  // entry back one click after it was removed.
  it("renumbers changes that point past a removed entry", () => {
    const { result: cleaned } = groundResult(
      result(
        {
          projects: [
            { name: "TARPON HEALTH PROJECTS", description: "to be populated upon hire", link: "", bullets: [] },
            { name: "Phishing triage bot", description: "", link: "", bullets: ["Built in Python."] },
          ],
        },
        [
          { id: "c1", kind: "edit", path: "projects.1.bullets.0", label: "Phishing triage bot", before: "Python bot.", after: "Built in Python.", rationale: "" },
        ],
      ),
      `${SOURCE}\nPhishing triage bot - Python bot.`,
    );

    expect(cleaned.resume.projects.map((project) => project.name)).toEqual(["Phishing triage bot"]);
    expect(cleaned.changes.map((change) => change.path)).toEqual(["projects.0.bullets.0"]);
  });

  it("drops a change that pointed at the removed entry itself", () => {
    const { result: cleaned } = groundResult(
      result(
        {
          projects: [{ name: "TARPON HEALTH PROJECTS", description: "to be populated upon hire", link: "", bullets: [] }],
        },
        [{ id: "c1", kind: "add", path: "projects.0", label: "Tarpon projects", before: "", after: "TARPON HEALTH PROJECTS", rationale: "Shows fit." }],
      ),
      SOURCE,
    );
    expect(cleaned.changes).toEqual([]);
  });

  it("renumbers a bullet change after an earlier bullet was stripped", () => {
    const { result: cleaned } = groundResult(
      result(
        {
          experience: [
            {
              company: "Northwind Health",
              title: "Security Analyst",
              location: "",
              start: "2021",
              end: "2024",
              bullets: ["Agentic tooling, TBD.", "Cut phishing response time from 40 minutes to 9."],
            },
          ],
        },
        [
          { id: "c1", kind: "edit", path: "experience.0.bullets.1", label: "Northwind Health", before: "Cut phishing time.", after: "Cut phishing response time from 40 minutes to 9.", rationale: "" },
        ],
      ),
      SOURCE,
    );

    expect(cleaned.resume.experience[0].bullets).toHaveLength(1);
    expect(cleaned.changes[0].path).toBe("experience.0.bullets.0");
  });

  // The proof that the renumbering is right, rather than merely plausible.
  it("reverts the line the reviewer meant, after an entry was removed", () => {
    const { result: cleaned } = groundResult(
      result(
        {
          projects: [
            { name: "TARPON HEALTH PROJECTS", description: "to be populated upon hire", link: "", bullets: [] },
            { name: "Phishing triage bot", description: "", link: "", bullets: ["Built in Python."] },
          ],
        },
        [
          { id: "c1", kind: "edit", path: "projects.1.bullets.0", label: "Phishing triage bot", before: "Python bot.", after: "Built in Python.", rationale: "" },
        ],
      ),
      `${SOURCE}\nPhishing triage bot - Python bot.`,
    );

    const reverted = applyRejections(cleaned.resume, cleaned.changes, new Set(["c1"]));
    expect(reverted.projects[0].bullets).toEqual(["Python bot."]);
  });
});
