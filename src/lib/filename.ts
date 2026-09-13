/**
 * Download names are `Name-Company.ext` — the two things a recruiter or the
 * candidate's own downloads folder needs to tell one tailored resume from
 * another.
 *
 * Capitalisation is kept as written, because this is a document a person
 * receives, not a URL.
 */

/** Strip a name down to something safe in a filename, keeping its shape. */
function toFilenamePart(value: string): string {
  return value
    // NFC, not NFKD: decomposing would split the accent off "Ramírez" into a
    // combining mark, which is not a letter, and the name would come out
    // hyphenated mid-word.
    .normalize("NFC")
    // Anything a filesystem, a browser, or an email client might object to.
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function resumeFilename(name: string, company: string, extension: string): string {
  const who = toFilenamePart(name) || "Resume";
  const where = toFilenamePart(company);
  return `${where ? `${who}-${where}` : `${who}-Resume`}.${extension}`;
}

/** Read the filename the server chose out of a Content-Disposition header. */
export function filenameFromHeader(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]) : null;
}
