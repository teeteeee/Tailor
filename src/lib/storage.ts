export type SavedResume = {
  text: string;
  filename: string;
  savedAt: number;
};

/** Where the resume this browser is showing actually lives. */
export type ResumeScope =
  /** On the account, in the database: the same resume on every machine. */
  | "account"
  /** In this browser only — no account behind this deployment. */
  | "browser";

export type ResumeState = {
  resume: SavedResume | null;
  /**
   * Still working out where the resume lives. Distinct from "there is none",
   * so the UI does not flash "no saved resume" before the answer arrives.
   */
  loading: boolean;
  scope: ResumeScope;
};

const KEY = "resume-tailor.resume.v1";

/**
 * The resume belongs to the account, and falls back to this browser.
 *
 * Signing in on a second machine has to find the same resume, so the account
 * copy in Postgres is the source of truth whenever there is one. localStorage
 * is kept for the case the app still supports without a database at all, where
 * there is no account to hang it on — and as the thing a first sign-in migrates
 * up, so nobody loses the resume they saved before accounts existed.
 *
 * Exposed as an external store so React reads it with useSyncExternalStore:
 * neither localStorage nor the account exists during server rendering, and
 * reading in an effect to then setState causes a cascading render.
 */
const EMPTY: ResumeState = Object.freeze({ resume: null, loading: true, scope: "browser" as ResumeScope });

let state: ResumeState = EMPTY;
let listeners: Array<() => void> = [];
let started = false;
/** A save made before hydration finished, to be written once the scope is known. */
let pending: SavedResume | null = null;

function publish(next: ResumeState): void {
  state = Object.freeze(next);
  for (const listener of listeners) listener();
}

export function subscribeResume(listener: () => void): () => void {
  listeners = [...listeners, listener];

  // The first subscriber starts the lookup. Later ones join the same result.
  if (!started) {
    started = true;
    void hydrate();
  }

  // Another tab saving or forgetting fires `storage` here. Only meaningful for
  // a browser-scoped resume; the account copy is shared through the server.
  const onStorage = (event: StorageEvent) => {
    if (state.scope !== "browser") return;
    if (event.key === null || event.key === KEY) publish({ ...state, resume: readLocal() });
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Stable between renders until something writes — as useSyncExternalStore requires. */
export function getResumeState(): ResumeState {
  return state;
}

/** There is no resume on the server, so render as if we are still looking. */
export function getServerResumeState(): ResumeState {
  return EMPTY;
}

/**
 * Forget everything this module learned, for a sign-out.
 *
 * Signing out is client-side navigation, so without this the next account to
 * sign in on the same tab would be shown the previous one's resume.
 */
export function resetResumeStore(): void {
  started = false;
  pending = null;
  publish(EMPTY);
}

async function hydrate(): Promise<void> {
  const local = readLocal();
  const remote = await fetchRemote();

  if (remote === "no-account") {
    // No account, or no database behind this deployment: this browser is the
    // only home the resume has, exactly as it was before accounts existed.
    settle({ resume: local, scope: "browser" });
    return;
  }

  if (!remote && local) {
    // This browser had one from before the account did. Move it up so the next
    // machine finds it, and stop keeping a second copy that can drift.
    const uploaded = await putRemote(local.text, local.filename);
    if (uploaded) clearLocal();
    settle({ resume: uploaded ?? local, scope: "account" });
    return;
  }

  // The account copy wins; a local leftover would only be a stale duplicate.
  if (remote && local) clearLocal();
  settle({ resume: remote, scope: "account" });
}

/** Finish hydration, honouring anything typed while it was in flight. */
function settle({ resume, scope }: { resume: SavedResume | null; scope: ResumeScope }): void {
  const queued = pending;
  pending = null;

  if (!queued) {
    publish({ resume, loading: false, scope });
    return;
  }

  publish({ resume: queued, loading: false, scope });
  persist(queued, scope);
}

/** null: signed in with nothing saved. "no-account": nobody to save it for. */
async function fetchRemote(): Promise<SavedResume | null | "no-account"> {
  try {
    const response = await fetch("/api/resume", { headers: { Accept: "application/json" } });
    if (!response.ok) return "no-account";
    const data = (await response.json()) as { resume?: unknown };
    return normalize(data?.resume);
  } catch {
    // Offline, or the route is unreachable. Treat it as no account rather than
    // losing what is in this browser.
    return "no-account";
  }
}

async function putRemote(text: string, filename: string): Promise<SavedResume | null> {
  try {
    const response = await fetch("/api/resume", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, filename }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { resume?: unknown };
    return normalize(data?.resume);
  } catch {
    return null;
  }
}

function persist(resume: SavedResume, scope: ResumeScope): void {
  if (scope === "account") void putRemote(resume.text, resume.filename);
  else writeLocal(resume);
}

export function saveResume(text: string, filename: string): void {
  const next: SavedResume = { text, filename, savedAt: Date.now() };

  // Still finding out where it belongs: show it, and write it once we know.
  if (state.loading) {
    pending = next;
    publish({ ...state, resume: next });
    return;
  }

  publish({ ...state, resume: next });
  persist(next, state.scope);
}

export function forgetResume(): void {
  const { scope } = state;
  pending = null;
  publish({ ...state, resume: null });

  if (scope === "account") {
    void fetch("/api/resume", { method: "DELETE" }).catch(() => {
      // The visible copy is already gone; a failed delete is not worth a dialog.
    });
  } else {
    clearLocal();
  }
}

/* localStorage, every access guarded: it throws outright in some privacy modes
   and returns nothing at all after a user clears site data. */

function readLocal(): SavedResume | null {
  try {
    return parseResumeSnapshot(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

function writeLocal(resume: SavedResume): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(resume));
  } catch {
    // Full or blocked storage is not worth interrupting the user over.
  }
}

function clearLocal(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — the caller clears the visible copy regardless.
  }
}

/** Turn a stored string into a resume, tolerating anything malformed. */
export function parseResumeSnapshot(raw: string | null): SavedResume | null {
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The one shape check both the stored string and the server response go through. */
export function normalize(value: unknown): SavedResume | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SavedResume>;
  if (typeof candidate.text !== "string" || candidate.text.length === 0) return null;
  return {
    text: candidate.text,
    filename: typeof candidate.filename === "string" ? candidate.filename : "",
    savedAt: typeof candidate.savedAt === "number" ? candidate.savedAt : Date.now(),
  };
}

/** "just now", "3 hours ago", "5 days ago" — enough to recognise which resume this is. */
export function describeAge(savedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
