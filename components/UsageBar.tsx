interface UsageBarProps {
  progress: number;
  color: string;
  label: string;
  secondary?: string;
}

export function UsageBar({ progress, color, label, secondary }: UsageBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-slate-300">
        <span>{label}</span>
        <span>{secondary ?? `${Math.round(progress)}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800/80">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
