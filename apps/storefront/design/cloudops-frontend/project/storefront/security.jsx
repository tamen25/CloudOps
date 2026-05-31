// storefront/security.jsx — S7 Security & SLO panel

const COMPLIANCE = [
  { layer: 'Identity',     control: 'Cognito + JWKS verify',          source: 'ADR-016',         href: '#' },
  { layer: 'Tenancy',      control: 'Postgres RLS · force',            source: 'migrations/003',  href: '#' },
  { layer: 'Transport',    control: 'HSTS · CSP · COOP/CORP',          source: 'next.config.ts',  href: '#' },
  { layer: 'Secrets',      control: 'Secrets Manager + IRSA',          source: 'deployment.yaml', href: '#' },
  { layer: 'Supply chain', control: 'Cosign + Trivy + Gatekeeper',     source: 'ADR-020 · #98',   href: '#' },
  { layer: 'Observability',control: 'OTel · 3 signals · SLO recording',source: 'story #89',       href: '#' },
];

function ComplianceTable() {
  return (
    <div className="surface" style={{ padding: '4px 0', overflow: 'hidden' }}>
      <div className="row" style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-default)',
        fontFamily: 'var(--font-mono)', fontSize: 10.5,
        color: 'var(--fg-subtle)', letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        <span style={{ flex: '0 0 30%' }}>layer</span>
        <span style={{ flex: 1 }}>control</span>
        <span style={{ flex: '0 0 26%' }}>source</span>
      </div>
      {COMPLIANCE.map((r, i) => (
        <a key={r.layer} href={r.href} className="row compliance-row" style={{
          padding: '14px 20px',
          borderBottom: i < COMPLIANCE.length - 1 ? '1px solid var(--border-muted)' : 'none',
          textDecoration: 'none', color: 'inherit',
          transition: 'background 0.15s',
        }}>
          <span style={{ flex: '0 0 30%', fontSize: 14, color: 'var(--fg-base)', fontWeight: 500 }}>{r.layer}</span>
          <span style={{ flex: 1, fontSize: 13.5, color: 'var(--fg-muted)' }}>{r.control}</span>
          <span style={{ flex: '0 0 26%' }} className="mono">
            <span style={{ fontSize: 11.5, color: 'var(--brand-400)' }}>{r.source}</span>
            <span style={{ marginLeft: 6, color: 'var(--fg-subtle)', fontSize: 10 }}>↗</span>
          </span>
        </a>
      ))}
    </div>
  );
}

function SLOGauge({ inView }) {
  const pct = 0.99;
  const r = 100;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  return (
    <div className="col items-center" style={{ gap: 16 }}>
      <svg viewBox="0 0 240 240" style={{ width: 220, height: 220, transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="sloG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-500)" />
            <stop offset="100%" stopColor="var(--brand-400)" />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r={r} fill="none"
          stroke="var(--border-default)" strokeWidth="14" />
        <circle cx="120" cy="120" r={r} fill="none"
          stroke="url(#sloG)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={inView ? off : c}
          style={{
            transition: 'stroke-dashoffset 1.6s cubic-bezier(.25,.85,.45,1)',
            filter: 'drop-shadow(0 0 12px rgba(45,212,191,0.45))',
          }} />
        {/* tick marks (un-rotated text done below in HTML overlay) */}
      </svg>
      <div style={{
        position: 'relative', marginTop: -180, marginBottom: 6,
        height: 0, width: 0, alignSelf: 'center',
      }} aria-hidden="true">
        <div className="col items-center" style={{ width: 220, position: 'absolute', left: -110, top: 60, gap: 4 }}>
          <span className="display-italic" style={{ fontSize: 56, color: 'var(--brand-400)', lineHeight: 1 }}>99.0%</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-subtle)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            checkout availability
          </span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>
            30-day rolling
          </span>
        </div>
      </div>
    </div>
  );
}

// Deterministic sparkline — seeded sine + noise so no hydration mismatch
function seeded(seed, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const v = 0.5 + Math.sin(i * 0.45 + seed) * 0.22 + Math.cos(i * 0.27 + seed * 0.7) * 0.14;
    pts.push(Math.max(0.05, Math.min(0.95, v)));
  }
  return pts;
}

function Sparkline({ seed, color, label, value }) {
  const pts = React.useMemo(() => seeded(seed, 32), [seed]);
  const path = pts.map((y, i) => `${i === 0 ? 'M' : 'L'} ${(i / (pts.length - 1)) * 100} ${100 - y * 80 - 5}`).join(' ');
  const area = path + ' L 100 100 L 0 100 Z';
  const gid = 'sg-' + seed;
  return (
    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-muted)' }}>
      <div className="row between items-center" style={{ marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 11, color: color }}>{value}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 42 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="1.2" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
      </svg>
    </div>
  );
}

function SecurityPanel() {
  const [ref, inView] = useInView({ threshold: 0.18 });
  return (
    <section id="security" ref={ref}>
      <div className="container-wide">
        <SectionEyebrow n={7} label="security & SLO" />
        <h2 className="display" style={{
          fontSize: 'clamp(36px, 4.6vw, 56px)', margin: 0,
          color: 'var(--fg-base)', maxWidth: 740,
        }}>
          What an auditor would <span className="display-italic" style={{ color: 'var(--brand-400)' }}>actually</span> open.
        </h2>
        <p style={{ color: 'var(--fg-muted)', fontSize: 17, maxWidth: 660, marginTop: 16, lineHeight: 1.55 }}>
          Six layers, six controls, six paths in the repo. No "trust us" — every row links to the source.
        </p>

        <div className="sec-grid" style={{
          display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32,
          marginTop: 48, alignItems: 'start',
        }}>
          {/* LEFT — compliance table */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 16 }}>
              <span className="e-tag">compliance posture</span>
            </div>
            <ComplianceTable />
          </div>
          {/* RIGHT — SLO + sparklines */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 16 }}>
              <span className="e-tag">live SLO</span>
            </div>
            <div className="surface" style={{ padding: '24px 0 4px' }}>
              <SLOGauge inView={inView} />
              <div style={{ paddingTop: 8 }}>
                <Sparkline seed={1.1} color="var(--brand-400)"
                  label="jwt_verify_total · ok" value="0 / 14.2k errs" />
                <Sparkline seed={2.4} color="var(--info)"
                  label="order p99" value="180 ms" />
                <Sparkline seed={3.7} color="var(--success)"
                  label="WS connect success" value="99.8%" />
                <Sparkline seed={4.9} color="var(--warning)"
                  label="rollback events · 30d" value="0" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Connector />
      <style>{`
        .compliance-row:hover { background: rgba(45,212,191,0.04); }
        @media (max-width: 980px) { .sec-grid { grid-template-columns: 1fr !important; gap: 48px !important; } }
      `}</style>
    </section>
  );
}

window.SecurityPanel = SecurityPanel;
