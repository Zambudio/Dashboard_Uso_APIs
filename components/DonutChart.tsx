interface DonutChartProps {
  value: number;
  max: number;
  color: string;
  label: string;
}

export function DonutChart({ value, max, color, label }: DonutChartProps) {
  const safeMax = Math.max(1, max);
  const progress = Math.min(100, Math.round((value / safeMax) * 100));
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-950/40 p-3">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={radius} stroke="rgba(255,255,255,0.12)" strokeWidth="10" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke={color}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="mt-2 text-center">
        <p className="text-xl font-semibold text-white">{progress}%</p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      </div>
    </div>
  );
}
