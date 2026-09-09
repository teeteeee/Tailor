<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Resume Tailor

- `npm test` (vitest), `npm run typecheck`, `npm run lint`, `npm run build` all must pass.
- Model calls live only in `src/lib/claude.ts`. The default model is Haiku 4.5, overridable with
  `TAILOR_MODEL`; Haiku rejects `output_config.effort`, which is why `outputConfig()` omits it.
- Model calls live only in `src/lib/claude.ts`. Every prompt there inherits `HONESTY_RULES`: the app
  reframes real experience and never invents any. Do not relax that in a prompt edit.
- The model's contract is the zod schemas in `src/lib/schema.ts` — change a schema and the prompt
  descriptions that go with it together.
- Keyword coverage is deliberately deterministic (`src/lib/keywords.ts`), not model-judged.
- `src/proxy.ts` gates every route behind `APP_PASSWORD`. It must stay fail-closed in production:
  no password set means 503, never an open site. API routes get 401 JSON, not a redirect.
- Closing a gap (`/api/close-gap`) is the only path that adds unseen content, and only from the
  candidate's own words. The model rewords what they wrote and nothing else; unsupported evidence
  must change nothing and return a reason. Never let a gap be added on a click alone.
- `/api/tailor` streams newline-delimited JSON (progress lines, then one result line) and runs
  analyzeJob and tailorResume concurrently. Errors after the first byte must travel inside the
  stream as an `error` line — use `describeError()` so the wording matches `errorResponse()`.
- Tailoring is by exception: leaving a bullet as written is the normal outcome, and every change
  must name the posting requirement it serves. Do not soften that back into general "improve the
  bullets" phrasing — over-rewriting is both the main quality complaint and a latency cost.
