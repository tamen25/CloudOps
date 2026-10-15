// storefront/legacy-shim.jsx — bridge components/hooks for legacy Journey + Architecture
// Provides SectionHead, Bioluminescence in v2's styling system.

function SectionHead({ eyebrow, title, lede, align = 'center' }) {
  return (
    <div className="reveal" style={{
      display: 'flex', flexDirection: 'column',
      alignItems: align === 'left' ? 'flex-start' : 'center',
      textAlign: align, gap: 14, marginBottom: 56,
    }}>
      {eyebrow && (
        <div className="eyebrow">
          <span className="e-tag">{eyebrow}</span>
        </div>
      )}
      {title && (
        <h2 className="display display-grad" style={{
          margin: 0, fontSize: 'clamp(36px, 4.6vw, 56px)', maxWidth: 900,
        }}>{title}</h2>
      )}
      {lede && (
        <p style={{
          margin: 0, color: 'var(--fg-muted)', fontSize: 17, maxWidth: 700, lineHeight: 1.55,
        }}>{lede}</p>
      )}
    </div>
  );
}

function Bioluminescence({ count = 14 }) {
  const dots = React.useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    s: 1 + Math.random() * 2,
    d: Math.random() * 4,
    o: 0.25 + Math.random() * 0.45,
  })), [count]);
  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0,
    }}>
      {dots.map((d, i) => (
        <span key={i} style={{
          position: 'absolute', left: d.x + '%', top: d.y + '%',
          width: d.s * 2, height: d.s * 2, borderRadius: '50%',
          background: '#5eead4',
          boxShadow: `0 0 ${d.s * 6}px #5eead4`,
          opacity: d.o,
          animation: `biolum 5.5s ease-in-out infinite`,
          animationDelay: `-${d.d}s`,
        }} />
      ))}
      <style>{`
        @keyframes biolum {
          0%,100% { transform: translate3d(0,0,0); opacity: 0.2; }
          50%     { transform: translate3d(0,-12px,0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function Eyebrow({ children }) {
  return (
    <div className="label-eyebrow" style={{ color: 'var(--brand-400)' }}>
      {children}
    </div>
  );
}

Object.assign(window, { SectionHead, Bioluminescence, Eyebrow });

