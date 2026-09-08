import type { KeywordHit } from "@/lib/keywords";

export function Coverage({ before, after }: { before: KeywordHit[]; after: KeywordHit[] }) {
  const beforeMap = new Map(before.map((hit) => [hit.keyword, hit.present]));

  return (
    <div className="flex flex-wrap gap-1.5">
      {after.map((hit) => {
        const wasPresent = beforeMap.get(hit.keyword) ?? false;
        const isNew = hit.present && !wasPresent;
        const title = hit.present ? `Found in: ${hit.locations.join(", ")}` : "Not found in the tailored resume";
        return (
          <span
            key={hit.keyword}
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
