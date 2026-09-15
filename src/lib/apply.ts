import type { Change, Resume } from "./schema";

type Json = unknown;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function parentOf(root: Json, path: string): { parent: Json; key: string } | null {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return null;
  const key = segments.pop()!;
  let node: Json = root;
  for (const segment of segments) {
    if (Array.isArray(node)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) return null;
      node = node[index];
    } else if (node && typeof node === "object") {
      node = (node as Record<string, Json>)[segment];
    } else {
      return null;
    }
    if (node === undefined) return null;
  }
  return { parent: node, key };
}

export function getAtPath(root: Json, path: string): Json {
  const located = parentOf(root, path);
  if (!located) return undefined;
  const { parent, key } = located;
  if (Array.isArray(parent)) {
    const index = Number(key);
    return Number.isInteger(index) ? parent[index] : undefined;
  }
  if (parent && typeof parent === "object") return (parent as Record<string, Json>)[key];
  return undefined;
}

/** Split a multi-line change value back into list items. */
function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function setAtPath(root: Json, path: string, value: string): boolean {
  const located = parentOf(root, path);
  if (!located) return false;
  const { parent, key } = located;

  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) return false;
    parent[index] = value;
    return true;
  }
  if (!parent || typeof parent !== "object") return false;

  const target = parent as Record<string, Json>;
  if (!(key in target)) return false;
  target[key] = Array.isArray(target[key]) ? toLines(value) : value;
  return true;
}

function arrayAt(root: Json, path: string): { array: Json[]; index: number } | null {
  const located = parentOf(root, path);
  if (!located) return null;
  const { parent, key } = located;
  const index = Number(key);
  if (!Array.isArray(parent) || !Number.isInteger(index) || index < 0) return null;
  return { array: parent, index };
}

/**
 * Rebuild the resume with the rejected changes undone.
 *
 * `tailored` is the model's output with every change already applied, so
 * accepting a change is a no-op and rejecting one restores `change.before`.
 * Insertions and deletions are grouped per array and applied deletions-first,
 * descending, so indices stay valid while we rewrite them.
 */
export function applyRejections(tailored: Resume, changes: Change[], rejectedIds: Iterable<string>): Resume {
  const rejected = new Set(rejectedIds);
  const result = clone(tailored) as Resume;
  const undo = changes.filter((change) => rejected.has(change.id));

  for (const change of undo.filter((c) => c.kind === "edit")) {
    setAtPath(result, change.path, change.before);
  }

  // Undo an "add" by deleting the element the model inserted.
  const deletions = undo.filter((c) => c.kind === "add");
  const byArray = new Map<string, number[]>();
  for (const change of deletions) {
    const arrayPath = change.path.split(".").slice(0, -1).join(".");
    const index = Number(change.path.split(".").pop());
    if (!Number.isInteger(index)) continue;
    byArray.set(arrayPath, [...(byArray.get(arrayPath) ?? []), index]);
  }
  for (const [arrayPath, indices] of byArray) {
    const array = getAtPath(result, arrayPath);
    if (!Array.isArray(array)) continue;
    for (const index of [...indices].sort((a, b) => b - a)) {
      if (index >= 0 && index < array.length) array.splice(index, 1);
    }
  }

  // Undo a "remove" by putting the original element back.
  for (const change of undo.filter((c) => c.kind === "remove").sort((a, b) => indexOf(a) - indexOf(b))) {
    const located = arrayAt(result, change.path);
    if (!located) continue;
    const { array, index } = located;
    array.splice(Math.min(index, array.length), 0, change.before);
  }

  return result;
}

function indexOf(change: Change): number {
  const index = Number(change.path.split(".").pop());
  return Number.isInteger(index) ? index : 0;
}

/**
 * Append newly generated changes to the existing log, renaming any whose id
 * collides. Ids come from separate model calls that each start counting at
 * "c1", and a duplicate id would make rejecting one change revert another.
 */
export function mergeChanges(existing: Change[], incoming: Change[]): Change[] {
  const used = new Set(existing.map((change) => change.id));
  const renamed = incoming.map((change) => {
    if (!used.has(change.id)) {
      used.add(change.id);
      return change;
    }
    let suffix = 2;
    while (used.has(`${change.id}-${suffix}`)) suffix++;
    const id = `${change.id}-${suffix}`;
    used.add(id);
    return { ...change, id };
  });
  return [...existing, ...renamed];
}

/**
 * Discard edits that do not actually change anything.
 *
 * A model asked to log its edits will sometimes report a bullet it left alone,
 * or one it altered only in whitespace. Those are noise in the review list —
 * the reader has to check each entry, and an entry that changes nothing wastes
 * that attention. Additions and removals always do something, so they stay.
 */
export function dropNoOpChanges(changes: Change[]): Change[] {
  const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
  return changes.filter((change) => change.kind !== "edit" || collapse(change.before) !== collapse(change.after));
}
