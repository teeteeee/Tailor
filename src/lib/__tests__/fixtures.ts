import type { Resume } from "../schema";

export function makeResume(overrides: Partial<Resume> = {}): Resume {
  return {
    contact: {
      name: "Ada Lovelace",
      headline: "Backend Engineer",
      email: "ada@example.com",
      phone: "",
      location: "London",
      links: ["github.com/ada"],
    },
    summary: "Engineer who builds data pipelines.",
    experience: [
      {
        company: "Analytical Engines",
        title: "Senior Engineer",
        location: "London",
        start: "2021",
        end: "Present",
        bullets: ["Built an ETL pipeline", "Mentored two engineers"],
      },
    ],
    education: [],
    skills: [{ category: "Languages", items: ["Python", "Go"] }],
    projects: [],
    certifications: [],
    ...overrides,
  };
}
