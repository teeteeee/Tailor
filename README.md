# Resume Tailor

Paste a resume and a job posting; get back a rewritten resume aimed at that posting, a
reviewable list of every change, and an honest account of what the posting asks for that the
resume does not evidence.

The rule the whole app is built around: **tailoring changes how true things are presented, never
what is true.** The model may reframe, reorder, merge and re-emphasise existing content. It may not
invent an employer, a date, a degree, a tool, or a metric. Anything genuinely missing shows up under
"Genuine gaps" instead of quietly appearing in the resume.

## Running it

```bash
npm install
cp .env.example .env.local     # then put a real key in it
npm run dev                    # http://localhost:3000
```

`ANTHROPIC_API_KEY` is read server-side only — the key never reaches the browser. Without one the
app loads and tells you the key is missing rather than failing obscurely.

```bash
npm test        # unit tests (vitest)
npm run build   # production build
npm run lint
npm run typecheck
```

## How it works

Three model calls, each returning schema-validated JSON via the Anthropic SDK's structured outputs
(`output_config.format` + `zodOutputFormat`), on `claude-opus-5`:

| Step | Route | What it does |
|---|---|---|
| Parse | `POST /api/extract` | PDF/DOCX/TXT → text → a structured `Resume` |
| Analyse | `POST /api/analyze` | Job posting → requirements, responsibilities, ATS keywords |
| Tailor | `POST /api/tailor` | Resume + job → tailored resume, per-change log, score, gaps |

Two more routes finish the job: `POST /api/cover-letter` drafts a letter from the tailored resume,
and `POST /api/export` renders `.docx` (via `docx`), Markdown, or plain text.

Keyword coverage is **not** the model's opinion — `src/lib/keywords.ts` does a literal whole-word
match of the posting's keywords against the resume text, before and after tailoring, because that is
what an applicant tracking system actually does. The chips show where each keyword was found.

### Reviewing changes

The model returns the full tailored resume plus a `changes[]` log, where each entry carries a dot
path into the resume (`experience.0.bullets.2`), the text before, the text after, and why. Every
change starts accepted; unticking one reverts exactly that path (`src/lib/applyRejections`), so the
preview and every export always reflect what you actually approved. Small edits render as a
word-level diff; near-total rewrites render as before/after, which is easier to read.

## Layout

```
src/
  app/
    page.tsx              the whole flow: input → progress → review
    api/                  extract · analyze · tailor · cover-letter · export
  components/             ResumePreview, ChangeList, Coverage, Dropzone, ScoreRing
  lib/
    schema.ts             zod schemas — the contract with the model
    claude.ts             the three model calls and the honesty rules they share
    extract.ts            PDF (unpdf) / DOCX (mammoth) / text
    apply.ts              accept-reject logic over change paths
    keywords.ts           deterministic ATS-style keyword matching
    diff.ts               word-level diff for the change list
    export.ts, docx.ts    Markdown / plain text / Word output
```

## Known limits

- **Scanned PDFs** have no text layer and there is no OCR — paste the text instead.
- **Print to PDF** goes through the browser's own print dialog (`@media print` hides the app chrome
  and prints just the resume). There is no server-side PDF renderer.
- Nothing is stored. Reloading the page loses the session.
