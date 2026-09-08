import { z } from "zod";

/**
 * The shape of a resume once it has been parsed out of a PDF/DOCX/plain-text
 * blob. Everything is optional-ish (empty arrays, empty strings) because real
 * resumes vary wildly and we would rather render a partial resume than fail.
 */
export const ContactSchema = z.object({
  name: z.string(),
  headline: z.string().describe("Professional headline, e.g. 'Senior Backend Engineer'. Empty string if absent."),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(z.string()).describe("URLs: LinkedIn, GitHub, portfolio, etc."),
});

export const ExperienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string(),
  start: z.string().describe("As written on the resume, e.g. 'Mar 2021'."),
  end: z.string().describe("As written on the resume, e.g. 'Present'."),
  bullets: z.array(z.string()),
});

export const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  start: z.string(),
  end: z.string(),
  details: z.array(z.string()),
});

export const SkillGroupSchema = z.object({
  category: z.string().describe("e.g. 'Languages', 'Cloud'. Use 'Skills' if the resume has no grouping."),
  items: z.array(z.string()),
});

export const ProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  link: z.string(),
  bullets: z.array(z.string()),
});

export const ResumeSchema = z.object({
  contact: ContactSchema,
  summary: z.string().describe("The professional summary / objective. Empty string if the resume has none."),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  skills: z.array(SkillGroupSchema),
  projects: z.array(ProjectSchema),
  certifications: z.array(z.string()),
});

export type Resume = z.infer<typeof ResumeSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;

/** Structured read of the job posting. */
export const JobSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  seniority: z.string().describe("e.g. 'Junior', 'Mid', 'Senior', 'Staff'. Empty string if unclear."),
  summary: z.string().describe("Two or three sentences on what this role actually does."),
  mustHave: z.array(z.string()).describe("Hard requirements, as short noun phrases."),
  niceToHave: z.array(z.string()),
  responsibilities: z.array(z.string()),
  keywords: z
    .array(z.string())
    .describe(
      "8-25 concrete terms an ATS would screen on: technologies, methodologies, domain nouns. Short (1-3 words), deduplicated, no soft-skill filler.",
    ),
});

export type Job = z.infer<typeof JobSchema>;

/**
 * A single reviewable edit. `path` is a dot path into the Resume object
 * (e.g. `experience.0.bullets.2`, `summary`, `skills.1.items`) so the UI can
 * revert an individual change without re-running the model.
 */
export const ChangeSchema = z.object({
  id: z.string().describe("Short unique slug, e.g. 'c1'."),
  kind: z.enum(["edit", "add", "remove"]),
  path: z
    .string()
    .describe(
      "Dot path into the resume object being changed. For 'add'/'remove' the last segment is the array index, e.g. 'experience.0.bullets.3'.",
    ),
  label: z.string().describe("Human label for where this lands, e.g. 'Acme Corp - bullet 3'."),
  before: z.string().describe("Prior text. Empty string for 'add'. Newline-separated for list values."),
  after: z.string().describe("New text. Empty string for 'remove'. Newline-separated for list values."),
  rationale: z.string().describe("One sentence: which job requirement this serves."),
});

export type Change = z.infer<typeof ChangeSchema>;

export const TailorResultSchema = z.object({
  resume: ResumeSchema.describe("The full tailored resume, with every change already applied."),
  changes: z.array(ChangeSchema),
  matchScore: z
    .number()
    .describe("0-100: how well the tailored resume answers this posting, judged on evidence actually present."),
  scoreRationale: z.string(),
  gaps: z
    .array(z.string())
    .describe("Requirements the candidate genuinely does not evidence. Never paper over these — name them."),
  interviewTalkingPoints: z.array(z.string()).describe("3-5 things to emphasise in a screen for this role."),
});

export type TailorResult = z.infer<typeof TailorResultSchema>;

/**
 * The result of closing a gap: the resume with the candidate's own evidence
 * placed into it, plus the change entries that put it there, so the addition is
 * reviewable and revertible like every other change.
 */
export const GapFillSchema = z.object({
  resume: ResumeSchema.describe("The full resume with the evidence placed into it."),
  changes: z.array(ChangeSchema).describe("One entry per edit made. Empty if the evidence could not be used."),
  note: z
    .string()
    .describe(
      "Empty when the evidence was placed. Otherwise one sentence on why it was not — typically that it does not actually evidence the gap.",
    ),
});

export type GapFill = z.infer<typeof GapFillSchema>;
