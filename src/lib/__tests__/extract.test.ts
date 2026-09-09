import { describe, expect, it } from "vitest";
import { UnsupportedFileError, extractText, normalizeText } from "../extract";
import { toDocxBuffer } from "../docx";
import { makeResume } from "./fixtures";
import { makePdf } from "./pdf-fixture";

const asFile = (buffer: Buffer, name: string, type = "") =>
  new File([new Uint8Array(buffer)], name, { type });

describe("normalizeText", () => {
  it("collapses the ragged whitespace PDF extraction leaves behind", () => {
    expect(normalizeText("A   B\r\n\n\n\nC  \t D  ")).toBe("A B\n\nC D");
  });
});

describe("extractText", () => {
  it("reads a PDF", async () => {
    const file = asFile(makePdf(["Ada Lovelace", "Built an ETL pipeline"]), "resume.pdf", "application/pdf");
    const text = await extractText(file);
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Built an ETL pipeline");
  });

  it("reads a DOCX", async () => {
    const file = asFile(await toDocxBuffer(makeResume()), "resume.docx");
    const text = await extractText(file);
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("Mentored two engineers");
    expect(text).toContain("Python, Go");
  });

  it("reads plain text and markdown", async () => {
    expect(await extractText(asFile(Buffer.from("# Ada\n\n- Built things"), "resume.md"))).toContain("Built things");
    expect(await extractText(asFile(Buffer.from("Ada Lovelace"), "resume.txt"))).toBe("Ada Lovelace");
  });

  it("rejects a format it cannot read", async () => {
    await expect(extractText(asFile(Buffer.from("..."), "resume.pages"))).rejects.toThrow(UnsupportedFileError);
  });
});
