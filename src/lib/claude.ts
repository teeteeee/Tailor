import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { JobSchema, TailorResultSchema, type Job, type Resume, type TailorResult } from "./schema";

/**
 * Haiku 4.5 by default: this is bounded rewriting against a schema, not open
 * reasoning, and the cheaper model does it for roughly a tenth of the price.
 * Set TAILOR_MODEL to a stronger model (e.g. claude-sonnet-5, claude-opus-5)
 * to trade money for better prose.
 */
export const MODEL = process.env.TAILOR_MODEL?.trim() || "claude-haiku-4-5";

/** Haiku 4.5 rejects output_config.effort; the Opus and Sonnet families accept it. */
const SUPPORTS_EFFORT = !MODEL.includes("haiku");

type Effort = "low" | "medium" | "high";

function outputConfig<F>(format: F, effort: Effort): { format: F; effort?: Effort } {
  return SUPPORTS_EFFORT ? { effort, format } : { format };
}

export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set on the server.");
    this.name = "MissingApiKeyError";
  }
}

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new MissingApiKeyError();
  }
  return new Anthropic();
}

/**
 * The single non-negotiable rule of this app: tailoring rewrites how true
 * things are presented, it never invents new ones. Every prompt inherits it.
 */
const HONESTY_RULES = `
Hard rules — these override every other instruction:
- Never invent an employer, job title, date, degree, certification, or tool the candidate did not list.
- Never invent a metric. If a bullet has no number, keep it unquantified rather than guessing one.
- Never claim experience with a technology that does not appear anywhere in the source resume.
- You may reframe, reorder, re-emphasise, merge, split, and retitle existing content, and you may
  surface a skill the resume mentions in passing. That is the whole job.
- If the candidate does not meet a requirement, say so in "gaps". Do not paper over it in the resume.
`.trim();

const TAILOR_SYSTEM = `You are an experienced technical recruiter. You are given a candidate's resume
as raw text and a structured job posting, and you return the resume restructured and rewritten for
that posting.

Do two things in one pass:

1. Read the raw resume into the output schema. This half is transcription: keep every role, date,
   employer, degree and certification exactly as written. Do not drop content because it looks
   irrelevant.
2. Tailor what you transcribed:
   - Rewrite the summary to speak to this role in 2-3 sentences.
   - Rewrite bullets that matter to this posting so the relevant work leads the sentence. Keep the
     candidate's real scope. Strong bullets read: action verb, what was built, and the effect.
   - Reorder bullets within a role so the most relevant sit first; reorder skill groups the same way.
   - Fold the posting's vocabulary in only where the candidate's real experience supports it.
   - Leave content that is irrelevant to this posting alone rather than padding it out.
   - Cap each bullet at roughly 30 words.

${HONESTY_RULES}

Return the complete tailored resume in "resume" — including sections you did not touch — plus one
entry in "changes" for every difference from the original wording. Change paths must be dot paths
into that resume object (e.g. "summary", "experience.0.bullets.2", "skills.1.items"). For
list-valued paths such as bullets or skill items, put one entry per line in before/after. For "add",
"path" ends in the index the new element occupies and "before" is empty; for "remove", "after" is
empty. Transcription alone is not a change — only log wording you actually altered.`;

export async function analyzeJob(jobText: string): Promise<Job> {
  const client = getClient();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: outputConfig(zodOutputFormat(JobSchema), "low"),
    system:
      "You break job postings into the requirements a candidate is actually screened on. Prefer the " +
      "posting's own vocabulary for keywords — that is what an ATS matches against. Drop boilerplate " +
      "about benefits, equal opportunity, and company culture.",
    messages: [{ role: "user", content: `Analyse this job posting:\n\n<posting>\n${jobText}\n</posting>` }],
  });
  if (!response.parsed_output) throw new Error("Could not read that job posting — the model returned no structured output.");
  return response.parsed_output;
}

/**
 * Parse and tailor in a single call.
 *
 * The system prompt and the resume are cached, in that order, so tailoring the
 * same resume against a second posting re-reads both from cache — the common
 * case is one resume against many jobs.
 */
export async function tailorResume(resumeText: string, job: Job): Promise<TailorResult> {
  const client = getClient();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: outputConfig(zodOutputFormat(TailorResultSchema), "medium"),
    system: [{ type: "text", text: TAILOR_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `<resume>\n${resumeText}\n</resume>`,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: `<job>\n${JSON.stringify(job, null, 2)}\n</job>\n\nTailor the resume for this posting.` },
        ],
      },
    ],
  });
  if (!response.parsed_output) throw new Error("Tailoring failed — the model returned no structured output.");
  return response.parsed_output;
}

export async function writeCoverLetter(resume: Resume, job: Job, notes: string): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    ...(SUPPORTS_EFFORT ? { output_config: { effort: "low" as const } } : {}),
    system: `You write short, specific cover letters — four paragraphs at most, no throat-clearing,
no "I am writing to apply for". Concrete detail from the resume beats enthusiasm.

${HONESTY_RULES}`,
    messages: [
      {
        role: "user",
        content:
          `Write a cover letter for this role.\n\n<job>\n${JSON.stringify(job, null, 2)}\n</job>\n\n` +
          `<resume>\n${JSON.stringify(resume, null, 2)}\n</resume>` +
          (notes.trim() ? `\n\nThe candidate adds:\n${notes.trim()}` : ""),
      },
    ],
  });
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
