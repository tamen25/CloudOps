// storefront/sections.jsx — S2 TechStack · S3 Bento · S4 MetricsRow · S6 Pipeline

// ─── S2 · Tech strip ──────────────────────────────────────────────────
const TECH = [
  { name: 'Next.js 15', use: 'SSR storefront · App Router · React 19' },
  { name: 'TypeScript',  use: 'Strict mode · no any · tsc --noEmit clean' },
  { name: 'Tailwind v4', use: '@theme tokens · no arbitrary values in production' },
  { name: 'Express',     use: '6 routes · pino logs · OTel SDK' },
  { name: 'AWS EKS',     use: '1.28 · 2 × t3.medium · HPA 2–12' },
  { name: 'Aurora PG',   use: 'Serverless v2 · RLS FORCE · 16.4' },
  { name: 'DynamoDB',    use: 'WS connection registry · TTL' },
  { name: 'Kinesis',     use: 'Order event stream · 4 shards · 24h' },
  { name: 'Step Functions', use: 'Checkout saga · Standard SM' },
  { name: 'Lambda',      use: 'search-gateway · ws-fanout · image-resize' },
  { name: 'API Gateway WS', use: 'Realtime fanout to browser' },
  { name: 'Cognito',     use: 'PKCE · JWKS verify · custom:tenant_id' },
  { name: 'OpenTelemetry', use: 'Spans · metrics · logs · tail sampling' },
  { name: 'Prometheus',  use: 'Workload metrics · SLO recording rules' },
  { name: 'Terraform',   use: '89 modules · drift detection · cosign' },
  { name: 'GitHub Actions', use: 'Lint → test → sign → scan → deploy' },
];

function TechStack() {
  const [ref, inView] = useInView();
  return (
    <section id="stack" ref={ref}>
      <div className="container">
        <SectionEyebrow n={2} label="stack" />
        <h2 className="display" style={{
          fontSize: 'clamp(28px, 3.6vw, 44px)',
          margin: 0, color: 'var(--fg-base)', maxWidth: 760,
        }}>
          Sixteen pieces of off-the-shelf infrastructure,
          wired the way the docs would do it.
        </h2>
        <p style={{
          color: 'var(--fg-muted)', fontSize: 16, maxWidth: 640,
          marginTop: 16,
        }}>
          No bespoke runtime. No "we wrote our own." Hover any chip to see what it does in this codebase.
        </p>
        <div className="row gap-2" style={{ flexWrap: 'wrap', marginTop: 36 }}>
          {TECH.map((t, i) => (
            <span key={t.name} title={t.use} className="badge tech-chip" style={{
              padding: '7px 13px', fontSize: 12,
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateY(0)' : 'translateY(8px)',
              transition: `opacity 0.5s ease ${i * 0.04}s, transform 0.5s ease ${i * 0.04}s, border-color 0.18s, color 0.18s`,
              cursor: 'help',
            }}>
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <Connector />
      <style>{`
        .tech-chip:hover { border-color: var(--brand-500) !important; color: var(--brand-400) !important; }
      `}</style>
    </section>
  );
}

// ─── S3 · Bento ───────────────────────────────────────────────────────
function CodeBlock({ lines, lang = 'sql' }) {
  return (
    <pre className="mono" style={{
      margin: 0, padding: '14px 16px',
      fontSize: 12, lineHeight: 1.75,
      background: 'rgba(8,12,18,0.65)',
      border: '1px solid var(--border-default)',
      borderRadius: 8,
      overflow: 'auto', flex: 1,
      whiteSpace: 'pre',
    }}>
      {lines.map((tokens, i) => (
        <div key={i}>
          {tokens.map((tok, j) => (
            <span key={j} className={'tok-' + tok[0]}>{tok[1]}</span>
          ))}
        </div>
      ))}
    </pre>
  );
}

function BentoTile({ adr, href, title, caption, span, rowSpan, children, accent = 'var(--brand-500)' }) {
  return (
    <a className="bento-tile surface reveal" href={href} style={{
      gridColumn: `span ${span}`,
      gridRow: rowSpan ? `span ${rowSpan}` : undefined,
      padding: 24,
      display: 'flex', flexDirection: 'column', gap: 16,
      textDecoration: 'none', color: 'inherit',
      minHeight: 220,
      transition: 'transform 0.22s cubic-bezier(.2,.7,.3,1), border-color 0.22s, box-shadow 0.22s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div className="col" style={{ gap: 6 }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-subtle)', letterSpacing: '0.1em' }}>{title.tag}</span>
          <h3 className="display" style={{ margin: 0, fontSize: 26, color: 'var(--fg-base)' }}>
            {title.main}
          </h3>
        </div>
        {adr && (
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-subtle)', flexShrink: 0 }}>{adr}</span>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>
      {caption && (
        <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 13.5, lineHeight: 1.55 }}>
          {caption}
        </p>
      )}
    </a>
  );
}

// Mini diagrams for tiles 2–5

function CognitoDiagram() {
  const NODES = [
    { x: 30,  y: 60, label: 'browser' },
    { x: 160, y: 60, label: 'middleware' },
    { x: 290, y: 60, label: 'Express' },
    { x: 415, y: 60, label: 'Lambda' },
    { x: 540, y: 60, label: 'WS' },
  ];
  return (
    <svg viewBox="0 0 600 130" style={{ width: '100%', height: 'auto', flex: 1 }}>
      <defs>
        <linearGradient id="cgEdge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--brand-500)" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {/* edges */}
      {NODES.slice(0, -1).map((n, i) => {
        const next = NODES[i + 1];
        return <line key={i} x1={n.x + 50} y1={n.y} x2={next.x} y2={next.y}
          stroke="url(#cgEdge)" strokeWidth="1.5" strokeDasharray="3 4" />;
      })}
      {/* moving JWT packet */}
      <circle r="5" fill="var(--brand-400)" style={{ filter: 'drop-shadow(0 0 6px var(--brand-400))' }}>
        <animate attributeName="cx" values="30;560" dur="4s" repeatCount="indefinite" />
        <animate attributeName="cy" values="60;60" dur="4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;1;0" dur="4s" repeatCount="indefinite" />
      </circle>
      {/* nodes */}
      {NODES.map((n, i) => (
        <g key={i}>
          <rect x={n.x} y={n.y - 18} width="100" height="36" rx="6"
            fill="rgba(22,27,34,0.9)" stroke="var(--border-default)" strokeWidth="1" />
          <text x={n.x + 50} y={n.y + 5} textAnchor="middle"
            fontFamily="JetBrains Mono" fontSize="11" fill="var(--fg-base)">{n.label}</text>
        </g>
      ))}
      {/* labels under */}
      <text x="80"  y="118" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--fg-subtle)">Bearer JWT</text>
      <text x="210" y="118" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--fg-subtle)">JWKS verify</text>
      <text x="340" y="118" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--fg-subtle)">tenant_id</text>
      <text x="465" y="118" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--fg-subtle)">claims pass</text>
    </svg>
  );
}

function SearchDiagram() {
  return (
    <svg viewBox="0 0 600 130" style={{ width: '100%', height: 'auto', flex: 1 }}>
      {[
        { x: 20,  label: 'API GW' },
        { x: 160, label: 'Lambda + LRU' },
        { x: 320, label: 'Express' },
        { x: 460, label: 'PG · tsvector' },
      ].map((n, i, arr) => (
        <g key={i}>
          <rect x={n.x} y={42} width="120" height="36" rx="6"
            fill={i === 1 ? 'rgba(45,212,191,0.08)' : 'rgba(22,27,34,0.9)'}
            stroke={i === 1 ? 'rgba(94,234,212,0.5)' : 'var(--border-default)'} strokeWidth="1" />
          <text x={n.x + 60} y={65} textAnchor="middle"
            fontFamily="JetBrains Mono" fontSize="11" fill={i === 1 ? 'var(--brand-400)' : 'var(--fg-base)'}>{n.label}</text>
          {i < arr.length - 1 && (
            <line x1={n.x + 120} y1={60} x2={arr[i+1].x} y2={60}
              stroke="var(--border-default)" strokeWidth="1" strokeDasharray="2 3" />
          )}
        </g>
      ))}
      {/* cold/warm annotation */}
      <text x="180" y="100" fontFamily="JetBrains Mono" fontSize="9.5" fill="var(--brand-400)">
        cache hit: warm &lt; 100ms
      </text>
      <text x="180" y="115" fontFamily="JetBrains Mono" fontSize="9" fill="var(--fg-subtle)">
        cache miss: ~ 280ms cold start
      </text>
    </svg>
  );
}

function RealtimeDiagram() {
  return (
    <svg viewBox="0 0 600 130" style={{ width: '100%', height: 'auto', flex: 1 }}>
      {[
        { x: 12,  label: 'Express' },
        { x: 132, label: 'Kinesis' },
        { x: 252, label: 'ws-fanout λ' },
        { x: 387, label: 'API GW WS' },
        { x: 510, label: 'Browser' },
      ].map((n, i, arr) => (
        <g key={i}>
          <rect x={n.x} y={42} width={i === 4 ? 80 : i === 3 ? 110 : 102} height="36" rx="6"
            fill={i === 2 ? 'rgba(45,212,191,0.08)' : 'rgba(22,27,34,0.9)'}
            stroke={i === 2 ? 'rgba(94,234,212,0.5)' : 'var(--border-default)'} strokeWidth="1" />
          <text x={n.x + (i === 4 ? 40 : i === 3 ? 55 : 51)} y={65} textAnchor="middle"
            fontFamily="JetBrains Mono" fontSize="10.5" fill={i === 2 ? 'var(--brand-400)' : 'var(--fg-base)'}>{n.label}</text>
        </g>
      ))}
      {/* hairlines */}
      <line x1="114" y1="60" x2="132" y2="60" stroke="var(--border-default)" strokeDasharray="2 3" />
      <line x1="234" y1="60" x2="252" y2="60" stroke="var(--border-default)" strokeDasharray="2 3" />
      <line x1="354" y1="60" x2="387" y2="60" stroke="var(--border-default)" strokeDasharray="2 3" />
      <line x1="497" y1="60" x2="510" y2="60" stroke="var(--border-default)" strokeDasharray="2 3" />
      {/* moving packet */}
      <circle r="4" fill="var(--brand-400)" style={{ filter: 'drop-shadow(0 0 5px var(--brand-400))' }}>
        <animate attributeName="cx" values="12;590" dur="3.4s" repeatCount="indefinite" />
        <animate attributeName="cy" values="60;60" dur="3.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;1;0" dur="3.4s" repeatCount="indefinite" />
      </circle>
      <text x="300" y="115" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--fg-subtle)">
        reconnect ≤ 30s · full-jitter backoff
      </text>
    </svg>
  );
}

function SagaDiagram() {
  const STAGES = ['Idempotency', 'CreateOrder', 'EnqueueEmail', 'DeliverEmail', 'Done'];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
      <div className="row gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {STAGES.map((s, i) => (
          <React.Fragment key={s}>
            <span className="mono saga-pill" style={{
              padding: '6px 10px', borderRadius: 999,
              background: i === STAGES.length - 1 ? 'rgba(87,171,90,0.10)' : 'rgba(22,27,34,0.8)',
              border: `1px solid ${i === STAGES.length - 1 ? 'rgba(87,171,90,0.35)' : 'var(--border-default)'}`,
              color: i === STAGES.length - 1 ? 'var(--success)' : 'var(--fg-base)',
              fontSize: 10.5, whiteSpace: 'nowrap',
            }}>{s}</span>
            {i < STAGES.length - 1 && (
              <span style={{ color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>→</span>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
        Step Functions <span style={{ color: 'var(--brand-400)' }}>Standard</span>{' '}
        · retries · compensate on failure
      </div>
    </div>
  );
}

function Bento() {
  return (
    <section id="how-it-works">
      <div className="container">
        <SectionEyebrow n={3} label="how it works" />
        <h2 className="display" style={{
          fontSize: 'clamp(40px, 5vw, 60px)', margin: 0,
          color: 'var(--fg-base)', maxWidth: 900,
        }}>
          Five primitives, all the way down.
        </h2>
        <p style={{ color: 'var(--fg-muted)', fontSize: 17, maxWidth: 680, marginTop: 16, lineHeight: 1.55 }}>
          Click any tile to jump to the running surface. ADRs are linked top-right.
        </p>

        <div className="bento" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gridAutoRows: '180px',
          gap: 16, marginTop: 48,
        }}>
          <BentoTile
            span={8} rowSpan={2}
            adr="ADR-014"
            href="/products"
            title={{ tag: 'TILE 01 · multi-tenancy', main: 'A forgotten WHERE can\'t leak.' }}
            caption="Force-RLS on every customer table — even the table owner can't bypass the boundary. JWT-bound tenant context set per request."
          >
            <CodeBlock lines={[
              [['kw', 'ALTER TABLE'], ['ident', ' orders '], ['kw', 'ENABLE ROW LEVEL SECURITY'], ['ident', ';']],
              [['kw', 'ALTER TABLE'], ['ident', ' orders '], ['kw', 'FORCE ROW LEVEL SECURITY'], ['ident', ';']],
              [['ident', '']],
              [['kw', 'CREATE POLICY'], ['ident', ' tenant_isolation '], ['kw', 'ON'], ['ident', ' orders']],
              [['ident', '  '], ['kw', 'USING'], ['ident', ' (tenant_id = '], ['fn', 'current_setting'], ['ident', '('], ['str', "'app.tenant'"], ['ident', ')::uuid);']],
              [['ident', '']],
              [['com', '-- TS helper: withTenant(req, async (db) => …)']],
              [['com', '-- Sets app.tenant per-connection. Pool-safe.']],
            ]} />
          </BentoTile>

          <BentoTile
            span={4}
            adr="ADR-016"
            href="/account"
            title={{ tag: 'TILE 02 · auth', main: 'JWT, end-to-end.' }}
            caption="Cognito PKCE. Browser → middleware → Express → Lambda. Verified once, passed everywhere."
          >
            <CognitoDiagram />
          </BentoTile>

          <BentoTile
            span={4}
            adr="ADR-017"
            href="/products"
            title={{ tag: 'TILE 03 · search', main: 'Warm < 100 ms.' }}
            caption="Hybrid: API Gateway → Lambda (LRU 60s) → Express → Postgres tsvector. No Elastic required."
          >
            <SearchDiagram />
          </BentoTile>

          <BentoTile
            span={4}
            adr="ADR-018"
            href="/orders"
            title={{ tag: 'TILE 04 · realtime', main: 'Push, not poll.' }}
            caption="Express writes to Kinesis; ws-fanout Lambda broadcasts to API GW WS. Reconnect ≤ 30 s, full jitter."
          >
            <RealtimeDiagram />
          </BentoTile>

          <BentoTile
            span={4}
            adr="ADR-019"
            href="/checkout"
            title={{ tag: 'TILE 05 · saga', main: 'Checkout, durable.' }}
            caption="Step Functions Standard SM. Idempotent, retries with backoff, compensates on failure."
          >
            <SagaDiagram />
          </BentoTile>
        </div>
      </div>
      <Connector />
      <style>{`
        .bento-tile:hover {
          border-color: rgba(94,234,212,0.4) !important;
          transform: translateY(-4px);
          box-shadow: 0 18px 40px -20px rgba(0,0,0,0.5), 0 0 28px -8px rgba(45,212,191,0.25);
        }
        @media (max-width: 1100px) {
          .bento { grid-template-columns: repeat(6, 1fr) !important; }
          .bento > .bento-tile:nth-child(1) { grid-column: span 6 !important; grid-row: span 1 !important; }
          .bento > .bento-tile:nth-child(2) { grid-column: span 3 !important; }
          .bento > .bento-tile:nth-child(3) { grid-column: span 3 !important; }
          .bento > .bento-tile:nth-child(4) { grid-column: span 3 !important; }
          .bento > .bento-tile:nth-child(5) { grid-column: span 3 !important; }
        }
        @media (max-width: 700px) {
          .bento { grid-template-columns: 1fr !important; grid-auto-rows: auto !important; }
          .bento > .bento-tile { grid-column: span 1 !important; }
        }
      `}</style>
    </section>
  );
}

// ─── S4 · Metrics row ────────────────────────────────────────────────
const METRICS = [
  { sym: '<',   num: 100, unit: 'ms', label: 'search · p95',     caps: ['warm Lambda', 'Postgres FTS · HMAC', 'LRU 60 s'] },
  { sym: '',    num: 99.0, decs: 1, unit: '%',  label: 'checkout · SLO', caps: ['Step Functions', 'compensate on fail', '30-day window'] },
  { sym: '≤',   num: 30,  unit: 's',  label: 'WS reconnect',    caps: ['full-jitter backoff', 'idempotent rejoin', 'token refresh'] },
  { sym: '≈',   num: 0.20, decs: 2, unit: '/hr', label: 'idle cost',     caps: ['overnight teardown', 'Aurora min ACU', 'spot-only nodes'] },
];

function MetricColumn({ m, inView, delay = 0 }) {
  const animated = useCountUp(m.num, { duration: 1400, decimals: m.decs ?? 0, start: inView });
  const display = inView ? animated : (0).toFixed(m.decs ?? 0);
  return (
    <div className="col" style={{ alignItems: 'flex-start', gap: 14 }}>
      <div className="row" style={{
        alignItems: 'baseline', gap: 6, color: 'var(--fg-base)',
      }}>
        <span className="display-italic" style={{ fontSize: 'clamp(56px, 7.5vw, 88px)', color: 'var(--brand-400)' }}>
          {m.sym}{m.sym ? ' ' : ''}{m.unit === '/hr' ? '$' : ''}{display}
        </span>
        <span className="mono" style={{ fontSize: 'clamp(14px, 1.5vw, 18px)', color: 'var(--fg-muted)' }}>
          {m.unit}
        </span>
      </div>
      <div className="mono" style={{
        fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.14em',
        color: 'var(--fg-base)',
      }}>{m.label}</div>
      <div className="col" style={{ gap: 4, marginTop: 2 }}>
        {m.caps.map((c, i) => (
          <div key={i} className="mono" style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{c}</div>
        ))}
      </div>
    </div>
  );
}

function MetricsRow() {
  const [ref, inView] = useInView({ threshold: 0.18 });
  return (
    <section id="metrics" ref={ref} style={{ padding: '64px 0' }}>
      <div className="container-wide" style={{
        borderTop: '1px solid var(--border-default)',
        borderBottom: '1px solid var(--border-default)',
        padding: '64px 32px',
      }}>
        <SectionEyebrow n={4} label="numbers that matter" />
        <div className="metrics-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32,
          marginTop: 24,
        }}>
          {METRICS.map((m, i) => (
            <MetricColumn key={m.label} m={m} inView={inView} delay={i * 0.1} />
          ))}
        </div>
      </div>
      <Connector />
      <style>{`
        @media (max-width: 1024px) { .metrics-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 48px !important; } }
        @media (max-width: 560px)  { .metrics-grid { grid-template-columns: 1fr !important; gap: 40px !important; } }
      `}</style>
    </section>
  );
}

// ─── S6 · Pipeline ────────────────────────────────────────────────────
const PIPELINE = [
  { n: 'PR',          tool: 'GitHub',     path: '.github/PULL_REQUEST_TEMPLATE.md' },
  { n: 'Lint',        tool: 'eslint',     path: '.github/workflows/app.yml:18' },
  { n: 'Test',        tool: 'vitest',     path: '.github/workflows/app.yml:34' },
  { n: 'Build',       tool: 'next + tsc', path: '.github/workflows/app.yml:62' },
  { n: 'Sign',        tool: 'cosign',     path: '.github/workflows/app.yml:88' },
  { n: 'Scan',        tool: 'trivy',      path: '.github/workflows/app.yml:104' },
  { n: 'Plan',        tool: 'terraform',  path: '.github/workflows/tf.yml:42' },
  { n: 'Approve',     tool: 'OIDC env',   path: '.github/workflows/app.yml:138' },
  { n: 'Deploy',      tool: 'kubectl',    path: '.github/workflows/app.yml:155' },
  { n: 'Verify',      tool: '/ready',     path: '.github/workflows/app.yml:172' },
  { n: 'Rollback',    tool: 'auto',       path: '.github/workflows/app.yml:188' },
];

function PipelineNode({ stage, i, total, lit, onHover, hoverIdx }) {
  const isHover = hoverIdx === i;
  return (
    <div
      onMouseEnter={() => onHover(i)}
      onMouseLeave={() => onHover(-1)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        position: 'relative', flex: 1, cursor: 'help', minWidth: 0,
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: lit ? 'var(--brand-400)' : 'rgba(22,27,34,0.9)',
        border: `1.5px solid ${lit ? 'var(--brand-500)' : 'var(--border-default)'}`,
        boxShadow: lit ? `0 0 ${isHover ? 16 : 8}px var(--brand-400)` : 'none',
        transition: 'all 0.3s ease',
        position: 'relative', zIndex: 2,
      }} />
      <div className="mono" style={{
        fontSize: 11, color: lit ? 'var(--fg-base)' : 'var(--fg-subtle)',
        fontWeight: 600, whiteSpace: 'nowrap',
      }}>{stage.n}</div>
      <div className="mono" style={{
        fontSize: 10, color: 'var(--fg-subtle)', whiteSpace: 'nowrap',
      }}>{stage.tool}</div>
      {isHover && (
        <div className="surface surface-strong" style={{
          position: 'absolute', top: 'calc(100% + 12px)', left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 12px', minWidth: 220, zIndex: 10,
          borderColor: 'var(--brand-500)',
        }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--brand-400)', letterSpacing: '0.1em' }}>
            {stage.n.toUpperCase()}
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>
            {stage.path}
          </div>
        </div>
      )}
    </div>
  );
}

function Pipeline() {
  const [ref, inView] = useInView({ threshold: 0.25 });
  const [lit, setLit] = React.useState(-1);
  const [hover, setHover] = React.useState(-1);
  React.useEffect(() => {
    if (!inView) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLit(PIPELINE.length - 1); return;
    }
    let i = -1;
    const id = setInterval(() => {
      i++; setLit(i);
      if (i >= PIPELINE.length - 1) clearInterval(id);
    }, 220);
    return () => clearInterval(id);
  }, [inView]);

  // Wire dasharray draws on inView
  const lineLen = 1200; // pretend total
  return (
    <section id="pipeline" ref={ref}>
      <div className="container-wide">
        <SectionEyebrow n={6} label="ship safely" />
        <h2 className="display" style={{
          fontSize: 'clamp(36px, 4.6vw, 56px)', margin: 0,
          color: 'var(--fg-base)', maxWidth: 880,
        }}>
          Eleven gates between <span className="display-italic" style={{ color: 'var(--brand-400)' }}>git push</span> and prod.
        </h2>
        <p style={{ color: 'var(--fg-muted)', fontSize: 17, maxWidth: 720, marginTop: 16, lineHeight: 1.55 }}>
          Manual approval on the OIDC environment. Cosign-signed images, Trivy-scanned, digest-pinned.
          If `/ready` fails, the rollback step runs the same kubectl invocation in reverse.
        </p>
        <div className="surface" style={{ marginTop: 48, padding: '40px 24px 56px', position: 'relative' }}>
          {/* Horizontal connecting line */}
          <svg viewBox="0 0 1200 4" preserveAspectRatio="none" style={{
            position: 'absolute',
            left: 'calc(24px + 1.5%)', right: 'calc(24px + 1.5%)', top: 50,
            height: 2, width: 'calc(100% - 48px - 3%)',
          }}>
            <line x1="0" y1="2" x2="1200" y2="2" stroke="var(--border-default)" strokeWidth="1.5" strokeDasharray="3 3" />
            <line x1="0" y1="2" x2="1200" y2="2"
              stroke="var(--brand-500)" strokeWidth="1.5"
              strokeDasharray={lineLen} strokeDashoffset={inView ? 0 : lineLen}
              style={{
                transition: 'stroke-dashoffset 1.6s cubic-bezier(.25,.85,.45,1)',
                filter: 'drop-shadow(0 0 4px var(--brand-500))',
              }} />
          </svg>
          <div className="pipeline-row" style={{
            display: 'flex', alignItems: 'flex-start',
            gap: 0, position: 'relative',
          }}>
            {PIPELINE.map((s, i) => (
              <PipelineNode key={s.n} stage={s} i={i} total={PIPELINE.length}
                lit={i <= lit} hoverIdx={hover} onHover={setHover} />
            ))}
          </div>
        </div>
        <div className="mono" style={{ marginTop: 20, color: 'var(--fg-subtle)', fontSize: 12 }}>
          ↳ Hover any stage for the workflow line number.
        </div>
      </div>
      <Connector />
      <style>{`
        @media (max-width: 900px) {
          .pipeline-row { overflow-x: auto; padding-bottom: 8px; }
          .pipeline-row > * { min-width: 96px; }
        }
      `}</style>
    </section>
  );
}

window.TechStack = TechStack;
window.Bento = Bento;
window.MetricsRow = MetricsRow;
window.Pipeline = Pipeline;
