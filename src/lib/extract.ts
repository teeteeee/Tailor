import mammoth from "mammoth";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export class UnsupportedFileError extends Error {
  constructor(name: string) {
    super(`Can't read "${name}". Upload a PDF, DOCX, TXT, or Markdown file, or paste the text instead.`);
    this.name = "UnsupportedFileError";
  }
}

/** Collapse the ragged whitespace that PDF extraction leaves behind. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t   ]/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Pull plain text out of an uploaded resume file. */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText: extractPdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return normalizeText(text);
  }

  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    return normalizeText(value);
  }

  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return normalizeText(buffer.toString("utf8"));
  }

  throw new UnsupportedFileError(file.name);
}
