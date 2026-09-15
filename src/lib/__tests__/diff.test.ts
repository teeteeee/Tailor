import { describe, expect, it } from "vitest";
import { changeRatio, wordDiff } from "../diff";

const render = (parts: ReturnType<typeof wordDiff>, type: "added" | "removed" | "same") =>
  parts.filter((part) => part.type === type).map((part) => part.value.trim()).join("|");

describe("wordDiff", () => {
  it("marks nothing when the strings match", () => {
    const parts = wordDiff("Built an ETL pipeline", "Built an ETL pipeline");
    expect(parts.every((part) => part.type === "same")).toBe(true);
  });

  it("marks inserted and deleted words", () => {
    const parts = wordDiff("Built an ETL pipeline", "Built a streaming ETL pipeline");
    expect(render(parts, "added").split("|")).toEqual(expect.arrayContaining(["a", "streaming"]));
    expect(render(parts, "removed")).toContain("an");
    expect(parts.map((part) => part.value).join("")).toContain("ETL pipeline");
  });

  it("round-trips the after string", () => {
    const after = "Owned the on-call rotation for a 12-service estate";
    const parts = wordDiff("Handled on-call", after);
    const reconstructed = parts.filter((part) => part.type !== "removed").map((part) => part.value).join("");
    expect(reconstructed).toBe(after);
  });

  it("handles an empty before", () => {
    expect(wordDiff("", "brand new bullet").every((part) => part.type === "added")).toBe(true);
  });
});

describe("changeRatio", () => {
  it("is zero for identical text", () => {
    expect(changeRatio(wordDiff("same text here", "same text here"))).toBe(0);
  });

  it("stays low for a small tweak", () => {
    expect(changeRatio(wordDiff("Built an ETL pipeline in Go", "Built a streaming ETL pipeline in Go"))).toBeLessThan(0.4);
  });

  it("is high for a full rewrite", () => {
    expect(changeRatio(wordDiff("Handled on-call duties", "Owned observability for twelve production services"))).toBeGreaterThan(0.6);
  });
});
