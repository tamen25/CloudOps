"use client";

const NODES = [
  { id: "browser", x: 30, label: "Browser" },
  { id: "mw", x: 130, label: "Middleware" },
  { id: "api", x: 230, label: "Express" },
  { id: "lambda", x: 330, label: "λ" },
  { id: "ws", x: 430, label: "WS" },
];

export function CognitoDiagram() {
  return (
    <svg viewBox="0 0 480 120" className="h-32 w-full" role="img" aria-label="JWT flow">
      <defs>
        <marker
          id="cognito-arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 z" fill="#30363d" />
        </marker>
      </defs>
      <line
        x1="48"
        y1="60"
        x2="430"
        y2="60"
        stroke="#30363d"
        strokeWidth="1"
        strokeDasharray="3 4"
        markerEnd="url(#cognito-arrow)"
      />
      {NODES.map((n) => (
        <g key={n.id} transform={`translate(${n.x}, 60)`}>
          <circle r="14" fill="#161b22" stroke="#2dd4bf" strokeWidth="1" />
          <text
            y="3"
            textAnchor="middle"
            fontSize="9"
            fontFamily="var(--font-mono)"
            fill="#cdd9e5"
          >
            {n.label}
          </text>
          <text
            y="36"
            textAnchor="middle"
            fontSize="8"
            fontFamily="var(--font-mono)"
            fill="#687480"
          >
            {n.id}
          </text>
        </g>
      ))}
      <circle r="3" fill="#2dd4bf" data-motion="packet">
        <animate
          attributeName="cx"
          values="30;430"
          dur="3.8s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="cy"
          values="60;60"
          dur="3.8s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0;1;1;0"
          dur="3.8s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
