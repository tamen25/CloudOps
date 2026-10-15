"use client";

const FANOUT = [
  { id: "a", x: 360, y: 30 },
  { id: "b", x: 380, y: 75 },
  { id: "c", x: 360, y: 120 },
];

export function RealtimeDiagram() {
  return (
    <svg viewBox="0 0 480 150" className="h-32 w-full" role="img" aria-label="Realtime fanout">
      <defs>
        <marker
          id="rt-arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 z" fill="#30363d" />
        </marker>
      </defs>

      <g transform="translate(60, 75)">
        <rect x="-40" y="-18" width="80" height="36" rx="6" fill="#161b22" stroke="#30363d" />
        <text textAnchor="middle" y="-2" fontSize="10" fontFamily="var(--font-mono)" fill="#cdd9e5">
          order-api
        </text>
        <text textAnchor="middle" y="12" fontSize="9" fontFamily="var(--font-mono)" fill="#687480">
          event
        </text>
      </g>

      <g transform="translate(220, 75)">
        <rect x="-44" y="-22" width="88" height="44" rx="6" fill="#161b22" stroke="#2dd4bf" />
        <text textAnchor="middle" y="-4" fontSize="10" fontFamily="var(--font-mono)" fill="#cdd9e5">
          fanout λ
        </text>
        <text textAnchor="middle" y="12" fontSize="9" fontFamily="var(--font-mono)" fill="#687480">
          DynamoDB
        </text>
      </g>

      {FANOUT.map((f) => (
        <g key={f.id} transform={`translate(${f.x}, ${f.y})`}>
          <rect x="-28" y="-14" width="56" height="28" rx="4" fill="#161b22" stroke="#30363d" />
          <text textAnchor="middle" y="4" fontSize="10" fontFamily="var(--font-mono)" fill="#cdd9e5">
            ws:{f.id}
          </text>
        </g>
      ))}

      <line x1="100" y1="75" x2="176" y2="75" stroke="#30363d" strokeDasharray="3 4" markerEnd="url(#rt-arrow)" />
      {FANOUT.map((f) => (
        <line
          key={f.id}
          x1="264"
          y1="75"
          x2={f.x - 28}
          y2={f.y}
          stroke="#30363d"
          strokeDasharray="3 4"
          markerEnd="url(#rt-arrow)"
        />
      ))}

      {FANOUT.map((f, i) => (
        <circle key={f.id} r="2.4" fill="#2dd4bf" data-motion="packet">
          <animate
            attributeName="cx"
            values={`264;${f.x - 30}`}
            dur="2.4s"
            begin={`${i * 0.3}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values={`75;${f.y}`}
            dur="2.4s"
            begin={`${i * 0.3}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            dur="2.4s"
            begin={`${i * 0.3}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </svg>
  );
}
