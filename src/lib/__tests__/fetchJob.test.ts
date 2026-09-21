import { describe, expect, it } from "vitest";
import { UnfetchableUrlError, checkUrlShape, extractReadableText, isPrivateAddress } from "../fetchJob";

describe("isPrivateAddress", () => {
  it("blocks loopback, private ranges and cloud metadata", () => {
    for (const ip of [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // the one that leaks cloud credentials
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fc00::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.167.1.1", "2606:4700::1111"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("treats anything unparseable as private", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
    expect(isPrivateAddress("999.1.1.1")).toBe(true);
  });
});

describe("checkUrlShape", () => {
  it("accepts a normal posting link", () => {
    expect(checkUrlShape("https://example.com/jobs/123").hostname).toBe("example.com");
  });

  it("rejects non-web schemes", () => {
    for (const bad of ["file:///etc/passwd", "ftp://example.com", "gopher://example.com"]) {
      expect(() => checkUrlShape(bad), bad).toThrow(UnfetchableUrlError);
    }
  });

  it("rejects internal hostnames and addresses outright", () => {
    for (const bad of [
      "http://localhost:3000/",
      "http://app.localhost/",
      "http://metadata.internal/",
      "http://printer.local/",
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.1/",
      "http://[::1]/",
    ]) {
      expect(() => checkUrlShape(bad), bad).toThrow(UnfetchableUrlError);
    }
  });

  it("rejects nonsense", () => {
    expect(() => checkUrlShape("just some words")).toThrow(UnfetchableUrlError);
    expect(() => checkUrlShape("")).toThrow(UnfetchableUrlError);
  });
});

describe("extractReadableText", () => {
  it("keeps the words and drops the markup", () => {
    const text = extractReadableText("<h1>Staff Engineer</h1><p>Own the <b>streaming</b> platform.</p>");
    expect(text).toContain("Staff Engineer");
    expect(text).toContain("Own the streaming platform.");
    expect(text).not.toContain("<");
  });

  it("drops scripts, styles and page furniture", () => {
    const html = `
      <nav>Home Jobs About</nav>
      <script>var tracking = "do not include";</script>
      <style>.x { color: red }</style>
      <main><p>We need a Go engineer.</p></main>
      <footer>Cookie policy</footer>`;
    const text = extractReadableText(html);
    expect(text).toContain("We need a Go engineer.");
    expect(text).not.toContain("do not include");
    expect(text).not.toContain("color: red");
    expect(text).not.toContain("Home Jobs About");
    expect(text).not.toContain("Cookie policy");
  });

  it("turns list items into bullets, as a posting's requirements", () => {
    const text = extractReadableText("<ul><li>Five years of Go</li><li>Kafka in production</li></ul>");
    expect(text).toContain("• Five years of Go");
    expect(text).toContain("• Kafka in production");
  });

  it("decodes entities", () => {
    expect(extractReadableText("<p>R&amp;D &lt;team&gt; &quot;core&quot;&nbsp;work &#38; more</p>")).toBe(
      'R&D <team> "core" work & more',
    );
  });

  it("collapses the whitespace that markup leaves behind", () => {
    expect(extractReadableText("<p>a</p>\n\n\n<p>b</p>   <p>c</p>")).toBe("a\nb\nc");
  });

  it("returns nothing for a page with no text", () => {
    expect(extractReadableText("<html><head><script>x=1</script></head><body></body></html>")).toBe("");
  });
});
