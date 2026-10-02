/**
 * Whole-word, case- and punctuation-insensitive phrase matching.
 *
 * Shared by keyword coverage, which reports what an ATS's string matcher would
 * find, and by the grounding check, which asks whether a line of the tailored
 * resume actually came from the candidate's own document. Both want the same
 * question answered: does this phrase appear in that text, as words?
 */
function normalize(value: string): string {
  return ` ${value
    .toLowerCase()
    // Anything that is not part of a word becomes a gap. `+`, `#` and `.`
    // survive, because they carry meaning in "C++", "C#", ".NET" and "Node.js".
    .replace(/[^a-z0-9+#.]+/g, " ")
    // A `.` that ends a token is sentence punctuation rather than part of the
    // word, and has to go before the padded compare. Keeping it meant a bullet
    // ending "…rolled out Kubernetes." never matched the keyword "Kubernetes",
    // and bullets end on their keyword constantly — so real coverage was
    // reported as a gap. Only the trailing run goes: ".net" and "node.js" keep
    // the dots that are doing work.
    .replace(/\.+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

export function containsPhrase(haystack: string, needle: string): boolean {
  const target = normalize(needle);
  return target.trim().length > 0 && normalize(haystack).includes(target);
}
