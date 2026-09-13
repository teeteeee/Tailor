import { describe, expect, it } from "vitest";
import { filenameFromHeader, resumeFilename } from "../filename";

describe("resumeFilename", () => {
  it("is Name-Company.ext", () => {
    expect(resumeFilename("Titi Adesola", "Northwind", "pdf")).toBe("Titi-Adesola-Northwind.pdf");
  });

  it("keeps capitalisation, since a person receives this file", () => {
    expect(resumeFilename("Ada Lovelace", "Acme", "docx")).toBe("Ada-Lovelace-Acme.docx");
  });

  it("tidies punctuation common in company names", () => {
    expect(resumeFilename("Titi Adesola", "Acme, Inc.", "pdf")).toBe("Titi-Adesola-Acme-Inc.pdf");
    expect(resumeFilename("Titi Adesola", "Smith & Sons", "pdf")).toBe("Titi-Adesola-Smith-Sons.pdf");
    expect(resumeFilename("Titi Adesola", "  Spaced   Out  ", "pdf")).toBe("Titi-Adesola-Spaced-Out.pdf");
  });

  it("keeps accented and non-Latin letters rather than stripping the name", () => {
    expect(resumeFilename("José Ramírez", "Café", "pdf")).toBe("José-Ramírez-Café.pdf");
  });

  it("falls back to Resume when the posting names no company", () => {
    expect(resumeFilename("Titi Adesola", "", "pdf")).toBe("Titi-Adesola-Resume.pdf");
    expect(resumeFilename("Titi Adesola", "   ", "pdf")).toBe("Titi-Adesola-Resume.pdf");
  });

  it("survives a missing or unusable name", () => {
    expect(resumeFilename("", "Northwind", "pdf")).toBe("Resume-Northwind.pdf");
    expect(resumeFilename("!!!", "", "pdf")).toBe("Resume-Resume.pdf");
  });

  it("never emits a path separator or a leading dot", () => {
    const name = resumeFilename("../../etc/passwd", "a/b\\c", "pdf");
    expect(name).not.toMatch(/[/\\]/);
    expect(name.startsWith(".")).toBe(false);
  });

  it("caps absurdly long inputs", () => {
    const long = resumeFilename("A".repeat(200), "B".repeat(200), "pdf");
    expect(long.length).toBeLessThanOrEqual(60 + 60 + 5);
  });
});

describe("filenameFromHeader", () => {
  it("reads a quoted filename", () => {
    expect(filenameFromHeader('attachment; filename="Titi-Adesola-Northwind.pdf"')).toBe("Titi-Adesola-Northwind.pdf");
  });

  it("reads an unquoted one", () => {
    expect(filenameFromHeader("attachment; filename=Ada-Acme.docx")).toBe("Ada-Acme.docx");
  });

  it("returns null when there is no header to read", () => {
    expect(filenameFromHeader(null)).toBeNull();
    expect(filenameFromHeader("attachment")).toBeNull();
  });
});
