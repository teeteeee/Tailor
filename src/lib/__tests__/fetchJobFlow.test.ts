import { afterEach, describe, expect, it, vi } from "vitest";

// A public-looking host, so the guard's DNS check passes and the flow under
// test is the fetching itself.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === "nowhere.example") throw new Error("ENOTFOUND");
    if (hostname === "sneaky.example") return [{ address: "10.0.0.7", family: 4 }];
    return [{ address: "93.184.216.34", family: 4 }];
  }),
}));

const { UnfetchableUrlError, fetchJobPosting } = await import("../fetchJob");

const POSTING = `<html><body><nav>Home Jobs</nav><main><h1>Staff Platform Engineer</h1>
<p>Own our event streaming platform end to end, from the Kafka topology through to the Go
consumers that feed analytics. You will carry the pager for what you build.</p>
<ul><li>Five years of backend engineering</li><li>Deep Go and production Kubernetes</li></ul>
</main><script>var junk = "tracking"</script><footer>Cookie policy</footer></body></html>`;

const reply = (body: string, init: { status?: number; type?: string; location?: string } = {}) =>
  new Response(body, {
    status: init.status ?? 200,
    headers: {
      "Content-Type": init.type ?? "text/html; charset=utf-8",
      ...(init.location ? { Location: init.location } : {}),
    },
  });

afterEach(() => vi.unstubAllGlobals());

describe("fetchJobPosting", () => {
  it("returns the posting's readable text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(POSTING)));
    const text = await fetchJobPosting("https://jobs.example/staff-platform-engineer");
    expect(text).toContain("Staff Platform Engineer");
    expect(text).toContain("• Deep Go and production Kubernetes");
    expect(text).not.toContain("tracking");
    expect(text).not.toContain("Cookie policy");
  });

  it("follows an ordinary redirect", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply("", { status: 301, location: "https://jobs.example/final" }))
      .mockResolvedValueOnce(reply(POSTING));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchJobPosting("https://jobs.example/old")).toContain("Staff Platform Engineer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect that points at an internal address", async () => {
    // The attack this guards: a public URL that bounces to cloud metadata.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply("", { status: 302, location: "http://169.254.169.254/latest/meta-data/" })),
    );
    await expect(fetchJobPosting("https://jobs.example/redirector")).rejects.toThrow(/internal to the server/);
  });

  it("refuses a host that resolves to a private address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(POSTING)));
    await expect(fetchJobPosting("https://sneaky.example/job")).rejects.toThrow(/internal to the server/);
  });

  it("stops after too many redirects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply("", { status: 302, location: "https://jobs.example/again" })),
    );
    await expect(fetchJobPosting("https://jobs.example/loop")).rejects.toThrow(/redirects too many times/);
  });

  it("explains a block rather than failing obscurely", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("no bots", { status: 403 })));
    await expect(fetchJobPosting("https://jobs.example/job")).rejects.toThrow(/403.*paste the description/is);
  });

  it("rejects a page that is all scaffolding and no words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("<html><body><div id=root></div></body></html>")));
    await expect(fetchJobPosting("https://jobs.example/spa")).rejects.toThrow(/almost no text/);
  });

  it("rejects a link that is not a web page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("%PDF-1.4", { type: "application/pdf" })));
    await expect(fetchJobPosting("https://jobs.example/job.pdf")).rejects.toThrow(/isn't a web page/);
  });

  it("reports an unreachable host plainly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(POSTING)));
    await expect(fetchJobPosting("https://nowhere.example/job")).rejects.toThrow(UnfetchableUrlError);
  });

  it("reports a network failure plainly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("socket hang up");
    }));
    await expect(fetchJobPosting("https://jobs.example/job")).rejects.toThrow(/Could not reach that page/);
  });
});
