import type { KeywordHit } from "@/lib/keywords";

export function Coverage({ before, after }: { before: KeywordHit[]; after: KeywordHit[] }) {
  const beforeMap = new Map(before.map((hit) => [hit.keyword, hit.present]));

  return (
    <div className="flex flex-wrap gap-1.5">
      {after.map((hit, index) => {
        const wasPresent = beforeMap.get(hit.keyword) ?? false;
        const isNew = hit.present && !wasPresent;
        const title = hit.present ? `Found in: ${hit.locations.join(", ")}` : "Not found in the tailored resume";
        return (
          <span
            // Keywords are deduplicated in keywordCoverage, so the keyword
            // alone would do; the index keeps this safe if a duplicate ever
            // reaches the component by another route.
            key={`${hit.keyword}-${index}`}
            title={title}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              hit.present
                ? "border-transparent bg-good-soft text-good"
                : "border-line bg-surface-2 text-muted line-through decoration-1"
            }`}
          >
            {hit.keyword}
            {isNew ? <span className="ml-1 font-semibold">+</span> : null}
          </span>
        );
      })}
    </div>
  );
}
