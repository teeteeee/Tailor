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

`ANTHROPIC_API_KEY` is read server-side only — the key never reaches the browser. Uploading a resume
and every export work without a key; only the analyse and tailor steps need one, and without it the
app says so plainly rather than failing obscurely.

```bash
npm test        # unit tests (vitest)
npm run build   # production build
npm run lint
npm run typecheck
```

## How it works

Two model calls, each returning schema-validated JSON via the Anthropic SDK's structured outputs
(`output_config.format` + `zodOutputFormat`):

| Step | Route | Model call? | What it does |
|---|---|---|---|
| Extract | `POST /api/extract` | no | PDF/DOCX/TXT → plain text, entirely on the server |
| Analyse | `POST /api/analyze` | yes | Job posting → requirements, responsibilities, ATS keywords |
| Tailor | `POST /api/tailor` | yes | Resume text + job → tailored resume, change log, score, gaps |

Two more routes finish the job: `POST /api/cover-letter` drafts a letter from the tailored resume,
and `POST /api/export` renders `.docx` (via `docx`), Markdown, or plain text — neither export nor
keyword coverage costs anything.

### Keeping the bill small

The default model is **Haiku 4.5** ($1/$5 per million input/output tokens). This is bounded
rewriting against a schema rather than open reasoning, so the cheap model does it well. Three other
choices pull in the same direction:

- **Reading and tailoring happen in one call.** The resume is never round-tripped through a separate
  parse step, which saves a call and stops the resume being sent twice.
- **Thinking is off** and effort is low — on Haiku there is no `effort` parameter at all, and the app
  omits it rather than sending one the model rejects.
- **The system prompt and the resume are cached.** Tailoring the same resume against a second
  posting re-reads both from cache, so the marginal application is cheaper than the first.

Set `TAILOR_MODEL` to trade money for better prose:

```bash
TAILOR_MODEL=claude-sonnet-5    # $2/$10
TAILOR_MODEL=claude-opus-5      # $5/$25, the strongest rewriting
```

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
    claude.ts             the model calls, model selection, and the honesty rules they share
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
