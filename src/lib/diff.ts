export type DiffPart = { value: string; type: "same" | "added" | "removed" };

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * Word-level diff via a longest-common-subsequence table. Inputs here are
 * single resume bullets, so the O(n·m) table is comfortably small.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (value: string, type: DiffPart["type"]) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.value += value;
    else parts.push({ value, type });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(a[i], "same");
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      push(a[i++], "removed");
    } else {
      push(b[j++], "added");
    }
  }
  while (i < a.length) push(a[i++], "removed");
  while (j < b.length) push(b[j++], "added");

  return parts.filter((part) => part.value.length > 0);
}

/**
 * How much of the text actually changed, 0-1. A near-total rewrite produces an
 * interleaved diff that is harder to read than the two versions side by side,
 * so the UI uses this to decide which to show.
 */
export function changeRatio(parts: DiffPart[]): number {
  const weigh = (type: DiffPart["type"]) =>
    parts.filter((part) => part.type === type).reduce((total, part) => total + part.value.trim().length, 0);
  const same = weigh("same");
  const changed = weigh("added") + weigh("removed");
  return same + changed === 0 ? 0 : changed / (same + changed);
}
