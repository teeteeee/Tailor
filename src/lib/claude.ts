import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { dropNoOpChanges } from "./apply";
import {
  GapFillSchema,
  JobSchema,
  TailorResultSchema,
  type GapFill,
  type Job,
  type Resume,
  type TailorResult,
} from "./schema";

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

/** A key that is present but visibly wrong — caught before spending a request on it. */
export class BadApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadApiKeyError";
  }
}

/**
 * Pasting a key into a .env file routinely picks up wrapping quotes, a
 * trailing newline, or a stray space. All three are sent verbatim and come
 * back as a 401 that looks like a bad key, so strip them here.
 */
export function normalizeApiKey(raw: string): string {
  return raw.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
}

/**
 * The mistakes that produce a 401. Returning the reason beats letting the
 * request fail with "API key is invalid", which says nothing about the cause.
 */
export function apiKeyProblem(key: string): string | null {
  if (key.includes("...") || key.includes("\u2026")) {
    return "Your ANTHROPIC_API_KEY still contains \"...\" — that is either the placeholder from .env.example or a key copied from the console after it was abbreviated for display. Generate a fresh key and copy it in one go.";
  }
  if (!key.startsWith("sk-ant-")) {
    return "Your ANTHROPIC_API_KEY doesn't start with \"sk-ant-\". Check you copied an API key from console.anthropic.com/settings/keys and not some other token.";
  }
  if (key.length < 40) {
    return `Your ANTHROPIC_API_KEY is only ${key.length} characters, which is too short to be a whole key — it looks truncated. Generate a fresh one and copy all of it.`;
  }
  return null;
}

export function getClient(): Anthropic {
  const apiKey = normalizeApiKey(process.env.ANTHROPIC_API_KEY ?? "");
  if (apiKey) {
    const problem = apiKeyProblem(apiKey);
    if (problem) throw new BadApiKeyError(problem);
    return new Anthropic({ apiKey });
  }

  // An OAuth token from `ant auth login` has a different shape, so it gets no
  // format checks — only the presence check.
  if (normalizeApiKey(process.env.ANTHROPIC_AUTH_TOKEN ?? "")) return new Anthropic();

  throw new MissingApiKeyError();
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
2. Tailor what you transcribed — by exception, not by default.

   Leaving a bullet exactly as the candidate wrote it is the normal outcome. Take the bullets one
   at a time and ask: what does this posting require that this bullet fails to show? If you cannot
   name a specific requirement the edit serves, leave the bullet alone. Rewriting for polish,
   house style, or stronger verbs is not tailoring — it just costs the candidate the wording they
   chose, and they have to read every change you make.

   Reach for the cheapest move that works, in this order:
   - Reorder. Moving a relevant bullet to the top of a role changes what gets read first and
     changes no wording at all. The same goes for skill groups.
   - Rewrite the summary. This one usually earns it: it is the only part written to address a
     specific role.
   - Rewrite a bullet — but only where it buries work this posting asks for, or omits vocabulary
     the posting screens on that the candidate's own experience already supports. Keep their scope
     and their facts, lead with the relevant part, stay under about 30 words.

   Leave sections the posting does not care about entirely alone rather than padding them out.

   On a typical resume this is a handful of bullet rewrites, not all of them. If you find yourself
   changing most of the bullets, you are rewriting rather than tailoring — go back and keep the
   ones that already work.

   Every entry in "changes" must name, in its rationale, the requirement from this posting it
   serves. A change you cannot justify that way should not have been made.

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
 * Parse and tailor in a single call, streaming so the caller can report
 * progress rather than showing a dead spinner for half a minute.
 *
 * Takes the posting as raw text rather than the structured Job, so this does
 * not wait on analyzeJob — the two calls run concurrently.
 *
 * The system prompt and the resume are cached, in that order, so tailoring the
 * same resume against a second posting re-reads both from cache — the common
 * case is one resume against many jobs.
 */
export async function tailorResume(
  resumeText: string,
  jobText: string,
  onProgress?: (charactersWritten: number) => void,
): Promise<TailorResult> {
  const client = getClient();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    output_config: outputConfig(zodOutputFormat(TailorResultSchema), "medium"),
    system: [{ type: "text", text: TAILOR_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `<resume>\n${resumeText}\n</resume>`, cache_control: { type: "ephemeral" } },
          { type: "text", text: `<posting>\n${jobText}\n</posting>\n\nTailor the resume for this posting.` },
        ],
      },
    ],
  });

  // Reporting how much has been written keeps the connection alive on hosts
  // that time out idle responses, and gives the UI something true to show.
  if (onProgress) stream.on("text", (_delta, snapshot) => onProgress(snapshot.length));

  const message = await stream.finalMessage();
  if (!message.parsed_output) throw new Error("Tailoring failed — the model returned no structured output.");
  const tailored = message.parsed_output;
  return { ...tailored, changes: dropNoOpChanges(tailored.changes) };
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

/**
 * Place a candidate's own account of some experience into their resume.
 *
 * This is the one path that adds something the resume did not previously say,
 * which is exactly why the evidence must come from the candidate and the model
 * is held to it: it may reword what they wrote, and nothing else.
 */
export async function closeGap(resume: Resume, job: Job, gap: string, evidence: string): Promise<GapFill> {
  const client = getClient();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: outputConfig(zodOutputFormat(GapFillSchema), "medium"),
    system: `The candidate is filling a gap in their resume. They have told you, in their own words,
what they actually did. Place it into the resume.

${HONESTY_RULES}

Two further rules for this task specifically:
- Everything you write must come from the candidate's statement below. Reword it into resume voice;
  do not extend it, do not add a metric it does not contain, and do not infer adjacent skills.
- If their statement does not actually evidence the gap, change nothing: return the resume exactly as
  given, an empty "changes" list, and say so in one sentence in "note".

Where it goes:
- Work they did in a role already on the resume becomes a bullet on that role.
- A tool or technology becomes an entry in the most fitting existing skill group.
- Anything that fits nowhere becomes a bullet on the most recent relevant role.

Append to arrays rather than inserting into the middle of them, so existing positions do not move.
Return the complete resume, plus one change entry per edit, with dot paths into that resume.`,
    messages: [
      {
        role: "user",
        content:
          `The posting asks for: ${gap}\n\n` +
          `The candidate says:\n${evidence.trim()}\n\n` +
          `<job>\n${JSON.stringify(job, null, 2)}\n</job>\n\n` +
          `<resume>\n${JSON.stringify(resume, null, 2)}\n</resume>`,
      },
    ],
  });
  if (!response.parsed_output) throw new Error("Could not place that — the model returned no structured output.");
  const filled = response.parsed_output;
  return { ...filled, changes: dropNoOpChanges(filled.changes) };
}

/**
 * Answer a question from a job application in the candidate's voice.
 *
 * Grounded in the tailored resume and the posting, and streamed, because an
 * answer the user is waiting to paste should start appearing immediately.
 */
export async function answerQuestion(
  resume: Resume,
  job: Job,
  question: string,
  onDelta: (text: string) => void,
): Promise<string> {
  const client = getClient();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2000,
    ...(SUPPORTS_EFFORT ? { output_config: { effort: "medium" as const } } : {}),
    system: [
      {
        type: "text",
        text: `You are helping a candidate answer a question on a job application. Write the answer
they will paste into the form, in their voice, first person.

${HONESTY_RULES}

Those rules bind here more tightly than anywhere else, because an application answer is a claim the
candidate has to stand behind in an interview. Every specific in your answer — a project, a number,
a tool, a length of time — must be traceable to something in the resume below. Where the resume is
silent, the answer is silent.

If the resume does not support an answer at all, do not manufacture one. Say briefly what the
question is asking for that the resume does not show, and what the candidate would need to add if
it is in fact true of them. That is more useful than a confident invention.

How to write it:
- Answer the question that was actually asked, from the first sentence. No preamble, no restating
  the question, no "I am excited to".
- For a "tell me about a time" question, give one concrete example from the resume: the situation,
  what they did, and how it turned out.
- For a motivation question, connect real experience to what this posting actually needs. Avoid
  flattery about the company that the candidate has no basis for.
- Around 120-200 words unless the question clearly calls for more or less.
- Plain prose, ready to paste: no markdown, no headings, no bullet points unless the question asks
  for a list.`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `<resume>\n${JSON.stringify(resume, null, 2)}\n</resume>\n\n<job>\n${JSON.stringify(job, null, 2)}\n</job>`,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: `The application asks:\n\n${question.trim()}` },
        ],
      },
    ],
  });

  stream.on("text", (delta) => onDelta(delta));
  const message = await stream.finalMessage();
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}
