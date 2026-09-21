import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { toPdfBuffer } from "../pdf";
import type { Resume } from "../schema";

// Distinct per index, so a test can assert ordering by position in the text.
const bullet = (i: number) =>
  `Designed and shipped the number ${i} service in Go, moving 40M events a day and ` +
  `cutting analytics lag from six hours to under ninety seconds.`;

const FULL: Resume = {
  contact: {
    name: "Ada Lovelace",
    headline: "Senior Backend Engineer",
    email: "ada@example.com",
    phone: "+44 20 7946 0111",
    location: "London, UK",
    links: ["github.com/ada", "linkedin.com/in/ada"],
  },
  summary:
    "Staff-level backend engineer with eight years on event streaming infrastructure — Kafka, Go and " +
    "Kubernetes at 40M events a day, across finance and logistics.",
  experience: [
    { company: "Analytical Engines Ltd", title: "Senior Backend Engineer", location: "London", start: "Mar 2021", end: "Present", bullets: [0, 1, 2, 3].map(bullet) },
    { company: "Difference Data", title: "Backend Engineer", location: "Remote", start: "Jun 2018", end: "Feb 2021", bullets: [4, 5, 6].map(bullet) },
    { company: "Babbage Systems", title: "Engineer", location: "Cambridge", start: "2017", end: "2018", bullets: [7, 8].map(bullet) },
  ],
  education: [{ institution: "University of Cambridge", degree: "BA", field: "Mathematics", start: "2014", end: "2017", details: ["First class honours"] }],
  skills: [
    { category: "Languages", items: ["Go", "Python", "SQL", "TypeScript"] },
    { category: "Infrastructure", items: ["Kubernetes", "Kafka", "AWS", "Terraform", "Observability"] },
  ],
  projects: [{ name: "pipeviz", description: "An open-source visualiser for Kafka topologies.", link: "github.com/ada/pipeviz", bullets: ["Used by four teams internally."] }],
  certifications: ["AWS Solutions Architect – Associate"],
};

describe("toPdfBuffer", () => {
  it("produces a valid PDF", async () => {
    const buffer = await toPdfBuffer(FULL);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.subarray(-6).toString()).toContain("%%EOF");
    expect(buffer.length).toBeGreaterThan(1000);
    if (process.env.PDF_OUT) fs.writeFileSync(process.env.PDF_OUT, buffer);
  });

  it("survives a resume with every optional section empty", async () => {
    const bare: Resume = {
      contact: { name: "A", headline: "", email: "", phone: "", location: "", links: [] },
      summary: "",
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
    };
    const buffer = await toPdfBuffer(bare);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("extracts as clean text, which is what an ATS reads", async () => {
    const pdf = await getDocumentProxy(new Uint8Array(await toPdfBuffer(FULL)));
    const { text } = await extractText(pdf, { mergePages: true });

    // Letter-spaced headings render as "S U M M A RY" once extracted, which an
    // ATS cannot match. Every heading must survive the round trip intact.
    for (const heading of ["SUMMARY", "EXPERIENCE", "PROJECTS", "SKILLS", "EDUCATION", "CERTIFICATIONS"]) {
      expect(text).toContain(heading);
    }

    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("ada@example.com");
    expect(text).toContain("Senior Backend Engineer — Analytical Engines Ltd");
    expect(text).toContain("Mar 2021 – Present");
    expect(text).toContain("Kubernetes, Kafka, AWS, Terraform, Observability");
    expect(text).toContain("AWS Solutions Architect – Associate");
  });

  it("keeps every bullet, in order", async () => {
    const pdf = await getDocumentProxy(new Uint8Array(await toPdfBuffer(FULL)));
    const { text } = await extractText(pdf, { mergePages: true });
    const flat = text.replace(/\s+/g, " ");
    const positions = FULL.experience.flatMap((job) => job.bullets).map((b) => flat.indexOf(b.replace(/\s+/g, " ")));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
  });

  it("paginates a resume too long for one page", async () => {
    const long: Resume = {
      ...FULL,
      experience: Array.from({ length: 9 }, (_, r) => ({
        company: `Company ${r}`, title: "Senior Engineer", location: "London", start: "2015", end: "2024",
        bullets: [0, 1, 2, 3].map(bullet),
      })),
    };
    const buffer = await toPdfBuffer(long);
    const pages = (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });
});
