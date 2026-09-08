import { describe, expect, it } from "vitest";
import { slugify, toMarkdown, toPlainText } from "../export";
import { makeResume } from "./fixtures";

describe("toMarkdown", () => {
  it("renders every populated section and skips empty ones", () => {
    const markdown = toMarkdown(makeResume());
    expect(markdown).toContain("# Ada Lovelace");
    expect(markdown).toContain("## Experience");
    expect(markdown).toContain("- Built an ETL pipeline");
    expect(markdown).toContain("**Languages:** Python, Go");
    expect(markdown).not.toContain("## Education");
  });

  it("omits the summary heading when there is no summary", () => {
    expect(toMarkdown(makeResume({ summary: "" }))).not.toContain("## Summary");
  });
});

describe("toPlainText", () => {
  it("strips markdown syntax", () => {
    const text = toPlainText(makeResume());
    expect(text).not.toMatch(/[#*]/);
    expect(text).toContain("• Built an ETL pipeline");
  });
});

describe("slugify", () => {
  it("makes a filename-safe slug", () => {
    expect(slugify("Ada Lovelace")).toBe("ada-lovelace");
    expect(slugify("!!!")).toBe("resume");
  });
});
