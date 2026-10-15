const SIGNALS = [
  { id: "spans", label: "spans", colour: "#2dd4bf" },
  { id: "metrics", label: "metrics", colour: "#a78bfa" },
  { id: "logs", label: "logs", colour: "#f59e0b" },
];

export function OtelDiagram() {
  return (
    <svg viewBox="0 0 480 150" className="h-32 w-full" role="img" aria-label="OTel signals">
      <g transform="translate(60, 75)">
        <rect x="-40" y="-18" width="80" height="36" rx="6" fill="#161b22" stroke="#30363d" />
        <text textAnchor="middle" y="-2" fontSize="10" fontFamily="var(--font-mono)" fill="#cdd9e5">
          app
        </text>
        <text textAnchor="middle" y="12" fontSize="9" fontFamily="var(--font-mono)" fill="#687480">
          SDK
        </text>
      </g>

      <g transform="translate(220, 75)">
        <rect x="-44" y="-22" width="88" height="44" rx="6" fill="#161b22" stroke="#2dd4bf" />
        <text textAnchor="middle" y="-4" fontSize="10" fontFamily="var(--font-mono)" fill="#cdd9e5">
          OTel
        </text>
        <text textAnchor="middle" y="12" fontSize="9" fontFamily="var(--font-mono)" fill="#687480">
          collector
        </text>
      </g>

      {SIGNALS.map((s, i) => {
        const y = 32 + i * 43;
        return (
          <g key={s.id}>
            <line
              x1="264"
              y1="75"
              x2="370"
              y2={y}
              stroke="#30363d"
              strokeDasharray="3 4"
            />
            <g transform={`translate(420, ${y})`}>
              <rect x="-44" y="-14" width="88" height="28" rx="4" fill="#161b22" stroke={s.colour} />
              <text
                textAnchor="middle"
                y="4"
                fontSize="10"
                fontFamily="var(--font-mono)"
                fill={s.colour}
              >
                {s.label}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
