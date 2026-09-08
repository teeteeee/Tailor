import type { Resume } from "./schema";

export type KeywordHit = {
  keyword: string;
  present: boolean;
  /** Where the keyword shows up, e.g. "Skills", "Acme Corp". */
  locations: string[];
};

/** Every piece of resume text, tagged with a human-readable location. */
function textSegments(resume: Resume): Array<{ location: string; text: string }> {
  const segments: Array<{ location: string; text: string }> = [];
  const push = (location: string, ...parts: string[]) => {
    const text = parts.filter(Boolean).join(" \n ");
    if (text.trim()) segments.push({ location, text });
  };

  push("Summary", resume.contact.headline, resume.summary);
  for (const job of resume.experience) push(job.company || job.title || "Experience", job.title, ...job.bullets);
  for (const group of resume.skills) push("Skills", group.category, ...group.items);
  for (const project of resume.projects) push(project.name || "Projects", project.description, ...project.bullets);
  for (const school of resume.education) {
    push(school.institution || "Education", school.degree, school.field, ...school.details);
  }
  if (resume.certifications.length) push("Certifications", ...resume.certifications);
  return segments;
}

/**
 * Whole-word, case- and punctuation-insensitive match. Deliberately literal:
 * an ATS matches strings, so we report what a string matcher would find.
 */
function contains(haystack: string, needle: string): boolean {
  const normalize = (value: string) =>
    ` ${value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim()} `;
  const target = normalize(needle);
  return target.trim().length > 0 && normalize(haystack).includes(target);
}

export function keywordCoverage(resume: Resume, keywords: string[]): KeywordHit[] {
  const segments = textSegments(resume);
  return keywords.map((keyword) => {
    const locations = [
      ...new Set(segments.filter((segment) => contains(segment.text, keyword)).map((segment) => segment.location)),
    ];
    return { keyword, present: locations.length > 0, locations };
  });
}

export function coverageRatio(hits: KeywordHit[]): number {
  if (hits.length === 0) return 0;
  return Math.round((hits.filter((hit) => hit.present).length / hits.length) * 100);
}
