interface SloGaugeProps {
  valuePct: number;
  label: string;
  sublabel?: string;
}

const SIZE = 240;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export function SloGauge({ valuePct, label, sublabel }: SloGaugeProps) {
  const filled = (valuePct / 100) * CIRC;
  return (
    <div className="relative grid place-items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block h-60 w-60 -rotate-90"
        role="img"
        aria-label={`${label} ${valuePct.toFixed(1)} percent`}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="#21262d"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="#2dd4bf"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRC}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="display-italic text-fg-base" style={{ fontSize: 64 }}>
            {valuePct.toFixed(1)}%
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
            {label}
          </p>
          {sublabel ? (
            <p className="mt-1 font-mono text-[10px] text-fg-subtle">{sublabel}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
