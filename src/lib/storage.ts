export type SavedResume = {
  text: string;
  filename: string;
  savedAt: number;
};

const KEY = "resume-tailor.resume.v1";

/**
 * The resume lives in this browser's localStorage and nowhere else.
 *
 * Deliberately not server-side: on a serverless host the filesystem is
 * ephemeral, so persisting there would mean provisioning a database for what is
 * a single-user convenience. The cost is that it is per-browser — see README.
 *
 * Every access is guarded: localStorage throws outright in some privacy modes,
 * and returns nothing at all after a user clears site data.
 */
/**
 * Exposed as an external store so React can read it with useSyncExternalStore:
 * localStorage does not exist during server rendering, and reading it in an
 * effect to then setState causes a cascading render.
 */
let listeners: Array<() => void> = [];
let snapshot: string | null | undefined;

export function subscribeResume(listener: () => void): () => void {
  listeners = [...listeners, listener];

  // Another tab saving or forgetting the resume fires `storage` here. Without
  // this the cached snapshot would go stale and the tabs would disagree.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === KEY) invalidateResumeSnapshot();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The raw stored string. Stable between renders until something writes. */
export function getResumeSnapshot(): string | null {
  if (snapshot === undefined) {
    try {
      snapshot = window.localStorage.getItem(KEY);
    } catch {
      snapshot = null;
    }
  }
  return snapshot;
}

/** There is no saved resume on the server, so render as if there is none. */
export function getServerResumeSnapshot(): string | null {
  return null;
}

/** Drop the cached snapshot and tell React to re-read it. */
export function invalidateResumeSnapshot(): void {
  snapshot = undefined;
  for (const listener of listeners) listener();
}

/** Turn a stored snapshot into a resume, tolerating anything malformed. */
export function parseResumeSnapshot(raw: string | null): SavedResume | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedResume>;
    if (typeof parsed.text !== "string" || parsed.text.length === 0) return null;
    return {
      text: parsed.text,
      filename: typeof parsed.filename === "string" ? parsed.filename : "",
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function loadResume(): SavedResume | null {
  return parseResumeSnapshot(getResumeSnapshot());
}

export function saveResume(text: string, filename: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ text, filename, savedAt: Date.now() } satisfies SavedResume));
  } catch {
    // Full or blocked storage is not worth interrupting the user over.
  }
  invalidateResumeSnapshot();
}

export function forgetResume(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — the caller clears the visible copy regardless.
  }
  invalidateResumeSnapshot();
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
