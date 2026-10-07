import type { Change } from "./schema";
import { looksLikePlaceholder } from "./grounding";

export type Screened = {
  changes: Change[];
  /** Why each refused change was refused, for the reply the candidate reads. */
  refused: string[];
};

/**
 * Every number in a piece of text, normalised so "4,000" and "4000" are the
 * same figure and a trailing unit does not hide one.
 */
function numbersIn(text: string): string[] {
  return (
    text
      .toLowerCase()
      // "40 percent" and "40%" are the same claim and must compare equal, or
      // rewording one into the other would read as an invention.
      .replace(/\s*per\s?cent\b/g, "%")
      // The unit travels with the figure. Without it a resume saying "40
      // minutes" would license a new bullet claiming "40%", which is a
      // different and much larger claim.
      .match(/[$£€]?\d[\d,._]*(?:\.\d+)?\s*%?/g) ?? []
  )
    .map((token) => token.replace(/[,_\s]/g, "").replace(/\.$/, ""))
    .filter((token) => token.length > 0);
}

/**
 * Screen edits the candidate asked for in a chat message.
 *
 * Refining is the one path besides closing a gap where new wording can enter
 * the resume, and it has to be: "add that I mentored the new analysts" is the
 * candidate stating something about themselves, which is theirs to state. So
 * the instruction counts as a source, exactly as gap evidence does.
 *
 * What is not theirs is a figure nobody gave. The characteristic failure when a
 * model is asked to add a line is to make it sound impressive — "mentored 3
 * analysts, cutting onboarding time 40%" from an instruction that mentioned
 * neither 3 nor 40. A metric is also the single most checkable thing on a
 * resume, and the worst to be caught inventing in an interview. So a change
 * introducing a number that appears in neither the resume, nor the
 * instruction, nor the text being replaced, is refused and said out loud.
 */
export function screenRefinement(
  changes: Change[],
  sources: { resumeText: string; instruction: string },
): Screened {
  const allowed = new Set([...numbersIn(sources.resumeText), ...numbersIn(sources.instruction)]);
  const kept: Change[] = [];
  const refused: string[] = [];

  for (const change of changes) {
    if (looksLikePlaceholder(change.after)) {
      refused.push(`Left "${change.label || change.path}" alone — that would have put placeholder text on your resume.`);
      continue;
    }

    // What is already at the path is fair game: rewording a bullet keeps its
    // own figures, and those were on the resume before this instruction.
    const carried = new Set([...allowed, ...numbersIn(change.before)]);
    const invented = numbersIn(change.after).filter((value) => !carried.has(value));

    if (invented.length > 0) {
      refused.push(
        `Left "${change.label || change.path}" alone — it would have claimed ${invented.join(", ")}, ` +
          `which is not on your resume and not something you told me.`,
      );
      continue;
    }

    kept.push(change);
  }

  return { changes: kept, refused };
}
