import { lookup } from "node:dns/promises";

export class UnfetchableUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnfetchableUrlError";
  }
}

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;

/**
 * Addresses that must never be fetched on the server's behalf.
 *
 * A posting URL is supplied by whoever is using the app, and the fetch happens
 * from inside the deployment — so without this, anyone could point it at
 * localhost, a private subnet, or a cloud metadata endpoint and read back
 * whatever came out.
 */
export function isPrivateAddress(ip: string): boolean {
  const address = ip.replace(/^::ffff:/i, "");

  if (address.includes(":")) {
    const v6 = address.toLowerCase();
    return (
      v6 === "::" ||
      v6 === "::1" ||
      /^f[cd][0-9a-f]{2}:/.test(v6) || // unique local
      /^fe[89ab][0-9a-f]:/.test(v6) // link local
    );
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link local, including cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // carrier NAT
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

/** Shape checks that need no network: scheme, and an address that is plainly internal. */
export function checkUrlShape(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnfetchableUrlError("That doesn't look like a web address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnfetchableUrlError("Only http and https links can be fetched.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnfetchableUrlError("That address is internal to the server, so it can't be fetched.");
  }
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateAddress(host)) {
      throw new UnfetchableUrlError("That address is internal to the server, so it can't be fetched.");
    }
  }
  return url;
}

/** Resolve the host and refuse if it lands anywhere internal. */
async function assertPublicHost(url: URL): Promise<void> {
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new UnfetchableUrlError(`Could not find ${url.hostname}. Check the link, or paste the description instead.`);
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new UnfetchableUrlError("That address is internal to the server, so it can't be fetched.");
  }
}

/**
 * Strip a page down to its readable text.
 *
 * Deliberately blunt rather than a full HTML parser: the model only needs the
 * words, and the parts that carry none — script, style, navigation, footers —
 * are exactly the parts worth dropping.
 */
export function extractReadableText(html: string): string {
  const withoutFurniture = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");

  return withoutFurniture
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Fetch a posting and return its readable text. Follows redirects, re-checking each hop. */
export async function fetchJobPosting(raw: string): Promise<string> {
  let url = checkUrlShape(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);

    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Some boards serve a stub to anything that does not look like a browser.
        "User-Agent": "Mozilla/5.0 (compatible; ResumeTailor/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    }).catch(() => {
      throw new UnfetchableUrlError("Could not reach that page. Paste the description instead.");
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new UnfetchableUrlError("That link redirects nowhere. Paste the description instead.");
      // Re-check the destination: a redirect is how a public host reaches a private one.
      url = checkUrlShape(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) {
      throw new UnfetchableUrlError(
        `That page returned ${response.status}. Many job boards block automated visits — paste the description instead.`,
      );
    }

    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
      throw new UnfetchableUrlError("That link isn't a web page. Paste the description instead.");
    }

    const body = await response.text();
    const text = extractReadableText(body.slice(0, MAX_BYTES));

    if (text.length < 200) {
      throw new UnfetchableUrlError(
        "That page had almost no text — it probably needs a login or builds itself in the browser. Paste the description instead.",
      );
    }
    return text;
  }

  throw new UnfetchableUrlError("That link redirects too many times. Paste the description instead.");
}
