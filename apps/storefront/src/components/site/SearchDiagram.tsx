export function SearchDiagram() {
  return (
    <svg viewBox="0 0 480 140" className="h-32 w-full" role="img" aria-label="Search flow">
      <defs>
        <marker
          id="search-arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 z" fill="#30363d" />
        </marker>
      </defs>

      <g transform="translate(40, 70)">
        <rect x="-30" y="-16" width="60" height="32" rx="6" fill="#161b22" stroke="#30363d" />
        <text textAnchor="middle" y="4" fontSize="10" fontFamily="var(--font-mono)" fill="#cdd9e5">
          query
        </text>
      </g>

      <g transform="translate(180, 70)">
        <rect x="-40" y="-22" width="80" height="44" rx="6" fill="#161b22" stroke="#2dd4bf" />
        <text textAnchor="middle" y="-2" fontSize="10" fontFamily="var(--font-mono)" fill="#cdd9e5">
          λ gateway
        </text>
        <text textAnchor="middle" y="14" fontSize="9" fontFamily="var(--font-mono)" fill="#687480">
          authoriser
        </text>
      </g>

      <g transform="translate(330, 38)">
        <rect x="-44" y="-14" width="88" height="28" rx="4" fill="#161b22" stroke="#30363d" />
        <text textAnchor="middle" y="4" fontSize="10" fontFamily="var(--font-mono)" fill="#cdd9e5">
          tsvector
        </text>
      </g>
      <g transform="translate(330, 100)">
        <rect x="-44" y="-14" width="88" height="28" rx="4" fill="#161b22" stroke="#30363d" />
        <text textAnchor="middle" y="4" fontSize="10" fontFamily="var(--font-mono)" fill="#cdd9e5">
          GIN index
        </text>
      </g>
      <g transform="translate(440, 70)">
        <rect x="-26" y="-14" width="52" height="28" rx="4" fill="#161b22" stroke="#30363d" />
        <text textAnchor="middle" y="4" fontSize="10" fontFamily="var(--font-mono)" fill="#cdd9e5">
          hits
        </text>
      </g>

      <line x1="70" y1="70" x2="140" y2="70" stroke="#30363d" strokeDasharray="3 4" markerEnd="url(#search-arrow)" />
      <line x1="220" y1="60" x2="280" y2="42" stroke="#30363d" strokeDasharray="3 4" markerEnd="url(#search-arrow)" />
      <line x1="220" y1="82" x2="280" y2="100" stroke="#30363d" strokeDasharray="3 4" markerEnd="url(#search-arrow)" />
      <line x1="380" y1="38" x2="414" y2="60" stroke="#30363d" strokeDasharray="3 4" markerEnd="url(#search-arrow)" />
      <line x1="380" y1="100" x2="414" y2="80" stroke="#30363d" strokeDasharray="3 4" markerEnd="url(#search-arrow)" />
    </svg>
  );
}
