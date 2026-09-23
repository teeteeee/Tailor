import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeAge,
  forgetResume,
  getResumeState,
  normalize,
  parseResumeSnapshot,
  resetResumeStore,
  saveResume,
  subscribeResume,
  type SavedResume,
} from "../storage";

function stubStorage(seed?: SavedResume, impl?: Partial<Storage>) {
  const store = new Map<string, string>();
  if (seed) store.set("resume-tailor.resume.v1", JSON.stringify(seed));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      ...impl,
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  return store;
}

type Call = { method: string; body: SavedResume | null };

/**
 * Stand in for /api/resume. `account` null means nobody is signed in, which is
 * what the route answers with a 401 — and what a deployment with no database
 * answers for everyone.
 */
function stubApi(account: SavedResume | null | "signed-out") {
  const calls: Call[] = [];
  let stored = account === "signed-out" ? null : account;

  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as SavedResume) : null;
    calls.push({ method, body });

    if (account === "signed-out") return { ok: false, status: 401, json: async () => ({ error: "Sign in." }) };
    if (method === "PUT" && body) stored = { ...body, savedAt: 1_000 };
    if (method === "DELETE") stored = null;
    return { ok: true, status: 200, json: async () => ({ resume: stored }) };
  });

  return { calls, read: () => stored };
}

/** Let hydration finish. The store fetches, so it settles over a few ticks. */
async function settled() {
  for (let i = 0; i < 50 && getResumeState().loading; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return getResumeState();
}

const noop = () => {};

describe("saved resume", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // The store is module-level and outlives a test, as it outlives a render.
    resetResumeStore();
  });

  describe("on an account", () => {
    it("shows the resume the account saved, whatever this browser has", async () => {
      stubStorage();
      stubApi({ text: "the account's resume", filename: "account.pdf", savedAt: 5 });
      subscribeResume(noop);

      const state = await settled();
      expect(state.scope).toBe("account");
      expect(state.resume?.text).toBe("the account's resume");
    });

    // The whole point: a second machine has an empty localStorage and must
    // still find the resume.
    it("finds it on a machine that has never saved anything locally", async () => {
      const local = stubStorage();
      stubApi({ text: "written on the laptop", filename: "cv.pdf", savedAt: 5 });
      subscribeResume(noop);

      expect((await settled()).resume?.text).toBe("written on the laptop");
      expect(local.size).toBe(0);
    });

    it("saves to the account, not to this browser", async () => {
      const local = stubStorage();
      const api = stubApi(null);
      subscribeResume(noop);
      await settled();

      saveResume("a fresh resume", "fresh.pdf");
      await settled();

      expect(getResumeState().resume?.text).toBe("a fresh resume");
      expect(api.calls.some((call) => call.method === "PUT" && call.body?.text === "a fresh resume")).toBe(true);
      expect(local.size).toBe(0);
    });

    it("forgets it on the account", async () => {
      const api = stubApi({ text: "old resume", filename: "old.pdf", savedAt: 5 });
      stubStorage();
      subscribeResume(noop);
      await settled();

      forgetResume();
      expect(getResumeState().resume).toBeNull();
      await settled();
      expect(api.calls.some((call) => call.method === "DELETE")).toBe(true);
    });

    it("moves a resume this browser saved before the account had one", async () => {
      const local = stubStorage({ text: "saved here long ago", filename: "old.pdf", savedAt: 5 });
      const api = stubApi(null);
      subscribeResume(noop);

      const state = await settled();
      expect(state.scope).toBe("account");
      expect(state.resume?.text).toBe("saved here long ago");
      expect(api.read()?.text).toBe("saved here long ago");
      // No second copy left behind to drift out of step.
      expect(local.size).toBe(0);
    });

    it("prefers the account's copy over a local leftover", async () => {
      const local = stubStorage({ text: "stale local copy", filename: "stale.pdf", savedAt: 5 });
      stubApi({ text: "the account's copy", filename: "current.pdf", savedAt: 9 });
      subscribeResume(noop);

      expect((await settled()).resume?.text).toBe("the account's copy");
      expect(local.size).toBe(0);
    });

    it("keeps a resume typed before it knew where it belonged", async () => {
      stubStorage();
      const api = stubApi(null);
      subscribeResume(noop);

      // Hydration is still in flight here.
      expect(getResumeState().loading).toBe(true);
      saveResume("typed straight away", "quick.pdf");
      expect(getResumeState().resume?.text).toBe("typed straight away");

      await settled();
      expect(getResumeState().resume?.text).toBe("typed straight away");
      expect(api.read()?.text).toBe("typed straight away");
    });
  });

  describe("without an account", () => {
    it("falls back to this browser, as the app behaved before accounts", async () => {
      stubStorage({ text: "local only", filename: "local.pdf", savedAt: 5 });
      stubApi("signed-out");
      subscribeResume(noop);

      const state = await settled();
      expect(state.scope).toBe("browser");
      expect(state.resume?.text).toBe("local only");
    });

    it("round-trips through localStorage", async () => {
      const local = stubStorage();
      stubApi("signed-out");
      subscribeResume(noop);
      await settled();

      saveResume("Ada Lovelace, engineer.", "ada-cv.pdf");
      expect(getResumeState().resume?.text).toBe("Ada Lovelace, engineer.");
      expect(local.size).toBe(1);

      forgetResume();
      expect(getResumeState().resume).toBeNull();
      expect(local.size).toBe(0);
    });

    it("survives localStorage that throws", async () => {
      stubStorage(undefined, {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {
          throw new Error("denied");
        },
      });
      stubApi("signed-out");
      subscribeResume(noop);

      expect((await settled()).resume).toBeNull();
      expect(() => saveResume("a", "b")).not.toThrow();
      expect(() => forgetResume()).not.toThrow();
    });

    it("keeps what is in this browser when the network is down", async () => {
      stubStorage({ text: "local only", filename: "local.pdf", savedAt: 5 });
      vi.stubGlobal("fetch", async () => {
        throw new Error("offline");
      });
      subscribeResume(noop);

      const state = await settled();
      expect(state.scope).toBe("browser");
      expect(state.resume?.text).toBe("local only");
    });
  });

  it("tells subscribers when the resume changes", async () => {
    stubStorage();
    stubApi("signed-out");
    const listener = vi.fn();
    subscribeResume(listener);
    await settled();

    const before = listener.mock.calls.length;
    saveResume("Ada", "cv.pdf");
    expect(listener.mock.calls.length).toBeGreaterThan(before);
  });

  it("hands React a stable snapshot until something writes", async () => {
    stubStorage();
    stubApi("signed-out");
    subscribeResume(noop);
    await settled();

    expect(getResumeState()).toBe(getResumeState());
    const first = getResumeState();
    saveResume("Ada", "cv.pdf");
    expect(getResumeState()).not.toBe(first);
  });

  it("forgets the account's resume on sign-out", async () => {
    stubStorage();
    stubApi({ text: "the account's resume", filename: "account.pdf", savedAt: 5 });
    subscribeResume(noop);
    await settled();
    expect(getResumeState().resume).not.toBeNull();

    resetResumeStore();
    expect(getResumeState().resume).toBeNull();
    expect(getResumeState().loading).toBe(true);
  });
});

describe("normalize", () => {
  it("accepts a well-formed resume from either side", () => {
    expect(normalize({ text: "Ada", filename: "a.pdf", savedAt: 1 })?.text).toBe("Ada");
    expect(parseResumeSnapshot(JSON.stringify({ text: "Ada", filename: "a.pdf", savedAt: 1 }))?.text).toBe("Ada");
  });

  it("rejects anything without text", () => {
    expect(normalize(null)).toBeNull();
    expect(normalize({})).toBeNull();
    expect(normalize({ text: "" })).toBeNull();
    expect(normalize({ text: 42 })).toBeNull();
    expect(parseResumeSnapshot(null)).toBeNull();
    expect(parseResumeSnapshot("not json")).toBeNull();
  });

  it("fills in a missing filename and timestamp", () => {
    const filled = normalize({ text: "Ada" });
    expect(filled?.filename).toBe("");
    expect(filled?.savedAt).toBeGreaterThan(0);
  });
});

describe("describeAge", () => {
  const now = Date.parse("2024-05-01T12:00:00Z");
  const ago = (ms: number) => describeAge(now - ms, now);

  it("describes recent and distant saves", () => {
    expect(ago(5_000)).toBe("just now");
    expect(ago(3 * 60_000)).toBe("3 minutes ago");
    expect(ago(60_000)).toBe("1 minute ago");
    expect(ago(3 * 3_600_000)).toBe("3 hours ago");
    expect(ago(5 * 86_400_000)).toBe("5 days ago");
    expect(ago(90 * 86_400_000)).toBe("3 months ago");
  });

  it("does not go backwards on a clock that is ahead", () => {
    expect(describeAge(now + 10_000, now)).toBe("just now");
  });
});
