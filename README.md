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
| Close gap | `POST /api/close-gap` | yes | Your account of some experience → placed into the resume |

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

### Closing a gap

Gaps are clickable, because a gap is often something you did and never wrote down rather than
something you have never done. Clicking one asks what you actually did; `POST /api/close-gap` then
places your own words into the right section — a bullet on the role, or an entry in a skill group.

The model is held to what you wrote: it rewords it into resume voice and does nothing else — no
added metric, no inferred adjacent skill. If what you say doesn't actually evidence the gap, it
changes nothing and tells you why. The result arrives as ordinary change entries, so a closed gap is
reviewable and revertible like everything else.

This is the only path that adds something the resume did not already say, and it works precisely
because the evidence comes from you. Clicking a gap to have it written for you would be the one
thing this app refuses to do.

### Reviewing changes

The model returns the full tailored resume plus a `changes[]` log, where each entry carries a dot
path into the resume (`experience.0.bullets.2`), the text before, the text after, and why. Every
change starts accepted; unticking one reverts exactly that path (`src/lib/applyRejections`), so the
preview and every export always reflect what you actually approved. Small edits render as a
word-level diff; near-total rewrites render as before/after, which is easier to read.

## Deploying it

**GitHub Pages will not work.** Pages serves static files, and this app needs a server: the API key
lives in server-side routes and must never reach the browser. A static build would mean shipping the
key to every visitor.

Vercel is the path of least resistance — same people who make Next.js, and it deploys from the
GitHub repo on every push.

1. Push this branch to GitHub (already done if you're reading this there).
2. At [vercel.com/new](https://vercel.com/new), import the repository. Everything auto-detects; no
   build settings to change.
3. Add the environment variables under **Settings → Environment Variables**:

   | Variable | Required | Notes |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | yes | Nothing can be tailored without it |
   | `APP_PASSWORD` | yes in production | The password the site asks for. Make it long |
   | `TAILOR_MODEL` | no | Defaults to `claude-haiku-4-5` |

4. Deploy. Redeploy after changing an environment variable — they are read at boot.

Set the variables **before** the first deploy if you can. A deployment without `APP_PASSWORD` is
closed rather than open (see below), so nothing is exposed either way, but the site will return 503
until you set one.

### The password gate

A public URL wired to a billable API key is somebody else's free API. So `src/proxy.ts` sits in front
of everything:

- No session → HTML routes redirect to `/login`, API routes return `401` JSON rather than a login
  page, so an expired session mid-use reads as an error and not as garbled output.
- The cookie holds an HMAC of the password, not the password, and is `httpOnly`, `sameSite=lax`, and
  `secure` in production. A stolen cookie can't be turned back into the password.
- Wrong-password responses are delayed half a second, which makes brute forcing slow and noisy.
- **`APP_PASSWORD` unset in production closes the site entirely** (503). Forgetting an environment
  variable should not silently publish an open door. Locally it stays open so development needs no
  setup.

It is one shared password, not user accounts — right for something you use yourself or share with a
few people, not for a public service.

## Layout

```
src/
  proxy.ts                the password gate, in front of every route
  app/
    page.tsx              the whole flow: input → progress → review
    login/                the password prompt
    api/                  extract · analyze · tailor · close-gap · cover-letter · export · login
  components/             ResumePreview, ChangeList, Coverage, Gaps, Dropzone, ScoreRing
  lib/
    schema.ts             zod schemas — the contract with the model
    claude.ts             the model calls, model selection, and the honesty rules they share
    extract.ts            PDF (unpdf) / DOCX (mammoth) / text
    apply.ts              accept-reject logic over change paths
    keywords.ts           deterministic ATS-style keyword matching
    diff.ts               word-level diff for the change list
    auth.ts               password hashing and constant-time comparison
    export.ts, docx.ts    Markdown / plain text / Word output
```

## When it won't authenticate

`.env.local` lives at the project root, beside `package.json`, and is read **once at startup** — after
editing it, stop the dev server and start it again.

The app checks the key's shape before spending a request, so most mistakes come back naming the
cause rather than as a bare "API key is invalid":

| What you see | What happened |
|---|---|
| "still contains `...`" | The `sk-ant-...` placeholder, or a key copied from the console after it was abbreviated on screen. The console shows a key in full only once — generate a fresh one |
| "doesn't start with `sk-ant-`" | Not an API key. It needs to come from console.anthropic.com/settings/keys |
| "only N characters" | The paste was truncated |
| "Anthropic rejected the API key" | The shape is right, so the key itself is revoked, from another organisation, or edited after copying |

Wrapping quotes and trailing whitespace are stripped automatically, so `KEY="sk-ant-..."` and a
trailing newline both work.

A 401 is always about the key. An exhausted balance is a different error mentioning credit.

## Known limits

- **Scanned PDFs** have no text layer and there is no OCR — paste the text instead.
- **Print to PDF** goes through the browser's own print dialog (`@media print` hides the app chrome
  and prints just the resume). There is no server-side PDF renderer.
- Nothing is stored. Reloading the page loses the session.
