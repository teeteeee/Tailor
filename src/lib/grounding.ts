import type { Change, Resume, TailorResult } from "./schema";
import { containsPhrase } from "./text";

/** A tailoring result, plus whatever the grounding check had to take out. */
export type TailoredResume = TailorResult & {
  /** Optional because a run saved before this check existed has none. */
  dropped?: DroppedEntry[];
};

export type DroppedEntry = {
  /** Where it was: "experience", "projects", "education", or the role it sat in. */
  section: string;
  /** What was removed, short enough to show in a notice. */
  label: string;
  reason: string;
};

/**
 * Text that promises content rather than being content.
 *
 * A resume tailored to a posting once came back with a section headed after the
 * company being applied to, described as "(Internal and client-facing work to be
 * populated upon hire)". It broke none of the honesty rules as written: those
 * forbid *claiming* an employer, a tool or a metric the candidate does not have,
 * and a blank labelled "to be populated" claims nothing at all. It is still the
 * last thing anyone wants to send an employer.
 */
const PLACEHOLDER = [
  /\bto be (populated|determined|added|filled|supplied|completed|provided)\b/i,
  /\bupon (hire|hiring|joining|onboarding|start(?:ing)?)\b/i,
  /\b(tbd|tba)\b/i,
  /\bplaceholder\b/i,
  /\bcoming soon\b/i,
  /\blorem ipsum\b/i,
  /\byour (text|content) here\b/i,
  /^\s*[[(][^\])]*\b(insert|add|list|describe)\b[^\])]*[\])]\s*$/i,
];

const looksLikePlaceholder = (value: string): boolean => PLACEHOLDER.some((pattern) => pattern.test(value));

/** A line is the candidate's own if it came from their resume, or is empty. */
const isTheirs = (source: string, value: string): boolean => !value.trim() || containsPhrase(source, value);

/**
 * Tracks, for every array element in the resume, where it ended up — or that it
 * went. Change paths are dot paths into the resume, so removing an element
 * renumbers everything after it; without this, rejecting a change would revert
 * the wrong bullet.
 */
type PathMap = Map<string, string | null>;

/**
 * Filter a list, recording where each element went.
 *
 * `from` and `to` differ whenever the list sits inside an entry that has itself
 * moved: a change points at `experience.3.bullets.1` as the model numbered it,
 * and has to end up at whatever index that role now occupies.
 */
function pruneList<T>(from: string, to: string, items: T[], map: PathMap, keep: (item: T) => boolean): T[] {
  const kept: T[] = [];
  items.forEach((item, index) => {
    if (keep(item)) {
      map.set(`${from}.${index}`, `${to}.${kept.length}`);
      kept.push(item);
    } else {
      map.set(`${from}.${index}`, null);
    }
  });
  return kept;
}

/** The same, for a list of entries whose own contents also need pruning. */
function pruneSection<T>(
  section: string,
  items: T[],
  map: PathMap,
  keep: (item: T) => boolean,
  clean: (item: T, from: string, to: string) => T,
): T[] {
  const kept: T[] = [];
  items.forEach((item, oldIndex) => {
    if (!keep(item)) {
      map.set(`${section}.${oldIndex}`, null);
      return;
    }
    const newIndex = kept.length;
    map.set(`${section}.${oldIndex}`, `${section}.${newIndex}`);
    kept.push(clean(item, `${section}.${oldIndex}`, `${section}.${newIndex}`));
  });
  return kept;
}

/**
 * Strip anything the tailored resume asserts that the candidate's own resume
 * does not, and keep the change list pointing at what survived.
 *
 * The prompt asks the model not to invent sections, and mostly it obliges — but
 * a prompt is a request. This is the rule it cannot talk its way around, in the
 * same spirit as keyword coverage being matched rather than model-judged.
 *
 * Deliberately conservative, because wrongly deleting a real job is far worse
 * than leaving one odd line in: an entry goes only when its name is absent from
 * the source resume AND none of its own lines are there either. A role whose
 * employer the model expanded or retitled keeps its place, because its bullets
 * still trace back. An entry invented whole has nothing to trace.
 */
export function groundResult(result: TailorResult, sourceText: string): { result: TailorResult; dropped: DroppedEntry[] } {
  const source = sourceText ?? "";
  const dropped: DroppedEntry[] = [];
  const map: PathMap = new Map();

  const entryIsTheirs = (section: string, label: string, identifiers: string[], lines: string[]): boolean => {
    const named = identifiers.some((identifier) => identifier.trim() && containsPhrase(source, identifier));
    const anyLineIsTheirs = lines.some((line) => line.trim() && containsPhrase(source, line));
    if (named || anyLineIsTheirs) return true;
    dropped.push({
      section,
      label: label.trim() || "Untitled entry",
      reason: "Nothing in this entry appears in your resume, so it was not added.",
    });
    return false;
  };

  /** A kept entry can still carry an invented line — a real role given a bullet about work that has not happened. */
  const linesAreTheirs = (section: string) => (line: string) => {
    if (!looksLikePlaceholder(line) || isTheirs(source, line)) return true;
    dropped.push({ section, label: line.trim(), reason: "Placeholder text, not something you wrote." });
    return false;
  };

  const experience = pruneSection(
    "experience",
    result.resume.experience,
    map,
    (job) => entryIsTheirs("experience", job.company || job.title, [job.company, job.title], job.bullets),
    (job, from, to) => ({
      ...job,
      bullets: pruneList(`${from}.bullets`, `${to}.bullets`, job.bullets, map, linesAreTheirs(job.company || job.title)),
    }),
  );

  const projects = pruneSection(
    "projects",
    result.resume.projects,
    map,
    (project) => entryIsTheirs("projects", project.name, [project.name], [project.description, ...project.bullets]),
    (project, from, to) => ({
      ...project,
      description:
        looksLikePlaceholder(project.description) && !isTheirs(source, project.description) ? "" : project.description,
      bullets: pruneList(`${from}.bullets`, `${to}.bullets`, project.bullets, map, linesAreTheirs(project.name)),
    }),
  );

  const education = pruneSection(
    "education",
    result.resume.education,
    map,
    (school) =>
      entryIsTheirs("education", school.institution || school.degree, [school.institution, school.degree], school.details),
    (school, from, to) => ({
      ...school,
      details: pruneList(`${from}.details`, `${to}.details`, school.details, map, linesAreTheirs(school.institution)),
    }),
  );

  const certifications = pruneList(
    "certifications",
    "certifications",
    result.resume.certifications,
    map,
    linesAreTheirs("certifications"),
  );

  const resume: Resume = {
    ...result.resume,
    summary: looksLikePlaceholder(result.resume.summary) && !isTheirs(source, result.resume.summary) ? "" : result.resume.summary,
    experience,
    projects,
    education,
    certifications,
  };

  return { result: { ...result, resume, changes: remapChanges(result.changes, map) }, dropped };
}

/**
 * Renumber change paths onto the pruned resume, dropping those that pointed at
 * something removed.
 *
 * A dangling change is not merely noise: `applyRejections` reverts by writing
 * `before` back at `path`, so a stale index would restore the wrong line — or,
 * worse, put an invented one back a click after it was taken out.
 */
function remapChanges(changes: Change[], map: PathMap): Change[] {
  const remapped: Change[] = [];

  for (const change of changes) {
    const segments = change.path.split(".");
    // Longest match first: "experience.0.bullets.2" before "experience.0".
    let path: string | null = change.path;
    for (let length = segments.length; length >= 2; length--) {
      const prefix = segments.slice(0, length).join(".");
      if (!map.has(prefix)) continue;
      const moved = map.get(prefix) ?? null;
      path = moved === null ? null : [moved, ...segments.slice(length)].join(".");
      break;
    }
    if (path !== null) remapped.push({ ...change, path });
  }

  return remapped;
}
