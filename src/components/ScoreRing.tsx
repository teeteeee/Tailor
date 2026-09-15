export function ScoreRing({ score, label }: { score: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const tone = clamped >= 75 ? "var(--good)" : clamped >= 50 ? "var(--warn)" : "var(--accent)";

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" role="img" aria-label={`${label}: ${clamped} out of 100`}>
        <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <div>
        <div className="text-xl font-semibold tabular-nums">{clamped}</div>
        <div className="text-[11px] tracking-wide text-muted uppercase">{label}</div>
      </div>
    </div>
  );
}
