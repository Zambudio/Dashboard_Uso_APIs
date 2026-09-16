'use client';

interface UsageBarProps {
  progress: number;
  label: string;
  secondary?: string;
  resetBadge?: string | null;
  color?: string;
  autoColor?: boolean;
}

export function UsageBar({
  progress,
  label,
  secondary,
  resetBadge,
  color,
  autoColor = true,
}: UsageBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const remainingPercent = 100 - clampedProgress;

  // Determinación automática de color según nivel de consumo
  let barColor = color;
  if (!barColor && autoColor) {
    if (clampedProgress >= 90) {
      barColor = '#f43f5e'; // Rose / Red (Alerta alta)
    } else if (clampedProgress >= 70) {
      barColor = '#f59e0b'; // Amber (Uso considerable)
    } else {
      barColor = '#10b981'; // Emerald / Verde saludable
    }
  } else if (!barColor) {
    barColor = '#38bdf8';
  }

  const isHigh = clampedProgress >= 90;
  const isMedium = clampedProgress >= 70 && clampedProgress < 90;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#0c0e17]/90 p-4 transition-all hover:border-white/15 min-h-[124px]">
      {/* Fila 1: Título a la izquierda y Badge de reinicio a la derecha */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        {resetBadge ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
            <svg className="h-3 w-3 shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="whitespace-nowrap">{resetBadge}</span>
          </span>
        ) : (
          <span className="text-[11px] font-medium text-slate-400">Sin límite de tiempo</span>
        )}
      </div>

      {/* Fila 2: Métricas grandes en su propia línea dedicada */}
      <div className="mt-2.5 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-2xl font-extrabold tracking-tight tabular-nums ${
              isHigh ? 'text-rose-400' : isMedium ? 'text-amber-300' : 'text-emerald-400'
            }`}
          >
            {remainingPercent}%
          </span>
          <span className="text-xs font-medium text-slate-400">restante</span>
        </div>

        <span className="text-xs font-medium text-slate-400 tabular-nums">
          {secondary ?? `${clampedProgress}% usado`}
        </span>
      </div>

      {/* Fila 3: Barra de progreso */}
      <div className="mt-2.5 relative h-2.5 w-full overflow-hidden rounded-full bg-white/[0.07] shadow-inner">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${clampedProgress}%`,
            backgroundColor: barColor,
            boxShadow: `0 0 12px ${barColor}80`,
          }}
        />
      </div>

      {/* Fila 4: Escala de porcentaje */}
      <div className="mt-1.5 flex justify-between text-[10px] font-medium text-slate-400">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
