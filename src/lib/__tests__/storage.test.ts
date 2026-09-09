import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeAge,
  forgetResume,
  invalidateResumeSnapshot,
  loadResume,
  parseResumeSnapshot,
  saveResume,
  subscribeResume,
} from "../storage";

function stubStorage(impl?: Partial<Storage>) {
  const store = new Map<string, string>();
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
  // The snapshot cache is module-level and outlives a test, as it outlives a
  // render. Each test starts from a cold read.
  invalidateResumeSnapshot();
  return store;
}

describe("saved resume", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("round-trips a resume", () => {
    stubStorage();
    saveResume("Ada Lovelace, engineer.", "ada-cv.pdf");
    const loaded = loadResume();
    expect(loaded?.text).toBe("Ada Lovelace, engineer.");
    expect(loaded?.filename).toBe("ada-cv.pdf");
    expect(loaded?.savedAt).toBeTypeOf("number");
  });

  it("returns null when nothing is stored", () => {
    stubStorage();
    expect(loadResume()).toBeNull();
  });

  it("forgets on request", () => {
    stubStorage();
    saveResume("text", "cv.pdf");
    forgetResume();
    expect(loadResume()).toBeNull();
  });

  it("ignores corrupt or empty stored data rather than crashing", () => {
    const store = stubStorage();
    store.set("resume-tailor.resume.v1", "not json");
    invalidateResumeSnapshot();
    expect(loadResume()).toBeNull();
    store.set("resume-tailor.resume.v1", JSON.stringify({ text: "" }));
    invalidateResumeSnapshot();
    expect(loadResume()).toBeNull();
    store.set("resume-tailor.resume.v1", JSON.stringify({ filename: "x.pdf" }));
    invalidateResumeSnapshot();
    expect(loadResume()).toBeNull();
  });

  it("tolerates a missing filename or timestamp", () => {
    const store = stubStorage();
    store.set("resume-tailor.resume.v1", JSON.stringify({ text: "Ada" }));
    invalidateResumeSnapshot();
    const loaded = loadResume();
    expect(loaded?.text).toBe("Ada");
    expect(loaded?.filename).toBe("");
  });

  it("survives storage that throws, as it does in some privacy modes", () => {
    stubStorage({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadResume()).toBeNull();
    expect(() => saveResume("a", "b")).not.toThrow();
    expect(() => forgetResume()).not.toThrow();
  });
});

describe("the external store", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("notifies subscribers when the resume changes", () => {
    stubStorage();
    const listener = vi.fn();
    const unsubscribe = subscribeResume(listener);

    saveResume("Ada", "cv.pdf");
    expect(listener).toHaveBeenCalledTimes(1);
    forgetResume();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    saveResume("Ada again", "cv.pdf");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("re-reads storage after a write rather than serving a stale snapshot", () => {
    stubStorage();
    saveResume("first", "a.pdf");
    expect(loadResume()?.text).toBe("first");
    saveResume("second", "b.pdf");
    expect(loadResume()?.text).toBe("second");
  });

  it("parses a snapshot directly, and treats null as no resume", () => {
    expect(parseResumeSnapshot(null)).toBeNull();
    expect(parseResumeSnapshot(JSON.stringify({ text: "Ada", filename: "a.pdf", savedAt: 1 }))?.text).toBe("Ada");
  });
});

describe("describeAge", () => {
  const now = Date.parse("2026-09-09T12:00:00Z");
  const ago = (ms: number) => describeAge(now - ms, now);

  it("reads naturally at each scale", () => {
    expect(ago(5_000)).toBe("just now");
    expect(ago(60_000)).toBe("1 minute ago");
    expect(ago(10 * 60_000)).toBe("10 minutes ago");
    expect(ago(3 * 3_600_000)).toBe("3 hours ago");
    expect(ago(5 * 86_400_000)).toBe("5 days ago");
    expect(ago(90 * 86_400_000)).toBe("3 months ago");
  });

  it("does not go negative on a clock skew", () => {
    expect(describeAge(now + 10_000, now)).toBe("just now");
  });
});
