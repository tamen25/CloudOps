// storefront/architecture.jsx — S5
// 4 horizontal flows · sticky sub-nav · dim-others-on-hover row interaction

const FLOWS = [
  {
    id: 'page-load',
    label: 'Page load',
    accent: 'var(--info)',
    note: 'SSR · ALB → Next.js pod · 60ms p95',
    steps: [
      { name: 'CloudFront', cat: 'networking', desc: 'edge cache' },
      { name: 'ALB + WAF',  cat: 'security',   desc: '5 rules · TLS 1.3' },
      { name: 'EKS · storefront', cat: 'compute', desc: 'Next.js SSR · HPA 2–12', primary: true },
      { name: 'Cognito',    cat: 'security',   desc: 'JWKS verify' },
      { name: 'S3 + CF',    cat: 'integration',desc: 'static assets' },
      { name: 'Aurora',     cat: 'database',   desc: 'tenant_id RLS' },
    ],
  },
  {
    id: 'search-read',
    label: 'Search read',
    accent: 'var(--aws-compute)',
    note: 'API Gateway → Lambda + LRU → Express → Postgres FTS · warm <100ms',
    steps: [
      { name: 'Browser fetch', cat: 'networking', desc: 'POST /search' },
      { name: 'API Gateway',   cat: 'networking', desc: 'HMAC verify' },
      { name: 'search-gateway λ', cat: 'compute', desc: 'LRU 60s', primary: true },
      { name: 'Express',       cat: 'compute',    desc: '/_internal/search' },
      { name: 'Aurora · tsvector', cat: 'database', desc: 'GIN index · trigram' },
    ],
  },
  {
    id: 'order-realtime',
    label: 'Order + realtime',
    accent: 'var(--aws-integration)',
    note: 'Express POST → Kinesis → ws-fanout λ → API GW WS · push, never poll',
    steps: [
      { name: 'Express POST',  cat: 'compute',     desc: 'POST /order' },
      { name: 'Aurora INSERT', cat: 'database',    desc: 'RLS-bound write' },
      { name: 'Kinesis',       cat: 'integration', desc: '4 shards · 24h', primary: true },
      { name: 'ws-fanout λ',   cat: 'compute',     desc: 'route by tenant' },
      { name: 'API GW WS',     cat: 'networking',  desc: 'broadcast' },
      { name: 'Browser WS',    cat: 'networking',  desc: 'reconnect ≤30s' },
    ],
  },
  {
    id: 'checkout-saga',
    label: 'Checkout saga',
    accent: 'var(--aws-analytics)',
    note: 'Step Functions Standard · idempotent · compensate on failure',
    steps: [
      { name: 'Express · /checkout', cat: 'compute', desc: 'Idempotency-Key' },
      { name: 'Step Functions',      cat: 'analytics', desc: 'Standard SM · 99.0% SLO', primary: true },
      { name: 'CreateOrder λ',       cat: 'compute',   desc: 'pg INSERT' },
      { name: 'SQS · email',         cat: 'integration', desc: 'durable buffer' },
      { name: 'DeliverEmail λ',      cat: 'compute',   desc: 'SES + retry' },
      { name: 'Audit · CloudWatch',  cat: 'analytics', desc: 'execution log' },
    ],
  },
];

const CAT_COLORS = {
  compute:    'var(--aws-compute)',
  database:   'var(--aws-database)',
  networking: 'var(--aws-networking)',
  security:   'var(--aws-security)',
  integration:'var(--aws-integration)',
  analytics:  'var(--aws-analytics)',
};

function ServiceTile({ step, primary, dimmed }) {
  const c = CAT_COLORS[step.cat] || 'var(--brand-500)';
  return (
    <div className="service-tile" style={{
      flex: '1 1 0', minWidth: 138,
      background: primary ? 'rgba(45,212,191,0.06)' : 'rgba(22,27,34,0.7)',
      border: `1px solid ${primary ? 'rgba(94,234,212,0.45)' : 'var(--border-default)'}`,
      borderTop: `2px solid ${c}`,
      borderRadius: 8,
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 4,
      opacity: dimmed ? 0.35 : 1,
      transition: 'opacity 0.25s ease, transform 0.25s, box-shadow 0.25s, border-color 0.25s',
    }}>
      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: c,
          boxShadow: primary ? `0 0 8px ${c}` : 'none', flexShrink: 0,
        }} />
        <span className="mono" style={{ fontSize: 12, color: 'var(--fg-base)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {step.name}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {step.desc}
      </div>
    </div>
  );
}

function FlowTrack({ accent, steps, active, seed }) {
  // Build "stops" so packets visibly pass through each tile.
  const stops = Math.max(2, steps);
  return (
    <div className="flow-track" aria-hidden="true" style={{
      position: 'relative', height: 22, marginTop: 10,
      opacity: active ? 1 : 0.4, transition: 'opacity 0.25s',
    }}>
      {/* Glow line */}
      <div style={{
        position: 'absolute', left: 8, right: 8, top: '50%', height: 1,
        transform: 'translateY(-50%)',
        background: `linear-gradient(90deg, transparent, ${accent} 8%, ${accent} 92%, transparent)`,
        opacity: 0.35,
        boxShadow: `0 0 8px ${accent}`,
      }} />
      {/* Tick marks at each stop */}
      <div style={{
        position: 'absolute', left: 8, right: 8, top: 0, bottom: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        {Array.from({ length: stops }).map((_, i) => (
          <span key={i} style={{
            width: 5, height: 5, borderRadius: 5,
            background: accent, opacity: 0.55,
            boxShadow: `0 0 6px ${accent}`,
          }} />
        ))}
      </div>
      {/* Two traveling packets, staggered */}
      <span className="flow-packet" style={{
        position: 'absolute', top: '50%', width: 9, height: 9, borderRadius: 9,
        background: accent, boxShadow: `0 0 14px ${accent}, 0 0 4px ${accent}`,
        transform: 'translate(-50%, -50%)',
        animation: 'flowMove 4.2s linear infinite',
        animationDelay: `${(seed * -0.9).toFixed(2)}s`,
      }} />
      <span className="flow-packet" style={{
        position: 'absolute', top: '50%', width: 6, height: 6, borderRadius: 6,
        background: '#5eead4', boxShadow: `0 0 10px #5eead4`,
        transform: 'translate(-50%, -50%)',
        animation: 'flowMove 4.2s linear infinite',
        animationDelay: `${(seed * -0.9 - 2.1).toFixed(2)}s`,
        opacity: 0.85,
      }} />
    </div>
  );
}

function FlowRow({ flow, idx, hoveredIdx, onEnter, onLeave }) {
  const dimmed = hoveredIdx !== -1 && hoveredIdx !== idx;
  return (
    <div id={`flow-${flow.id}`} className="flow-row reveal" style={{
      padding: '20px 0',
      borderBottom: idx < FLOWS.length - 1 ? '1px solid var(--border-default)' : 'none',
      opacity: dimmed ? 0.5 : 1,
      transition: 'opacity 0.25s ease',
      position: 'relative',
    }}
      onMouseEnter={() => onEnter(idx)}
      onMouseLeave={onLeave}
    >
      {/* Accent rail */}
      <div style={{
        position: 'absolute', left: 0, top: 24, bottom: 24, width: 3, borderRadius: 2,
        background: flow.accent, opacity: hoveredIdx === idx ? 1 : 0.55,
        transition: 'opacity 0.25s',
      }} />
      <div style={{ paddingLeft: 20 }}>
        <div className="row between items-center" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
          <div className="col" style={{ gap: 4 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-subtle)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              FLOW · {String(idx + 1).padStart(2, '0')}
            </div>
            <div className="display" style={{ fontSize: 24, color: 'var(--fg-base)' }}>{flow.label}</div>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{flow.note}</div>
        </div>
        <div className="row items-center" style={{ gap: 0, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4 }}>
          {flow.steps.map((s, i) => (
            <React.Fragment key={s.name}>
              <ServiceTile step={s} primary={s.primary} dimmed={false} />
              {i < flow.steps.length - 1 && (
                <span aria-hidden="true" style={{
                  flexShrink: 0, color: 'var(--fg-subtle)',
                  fontFamily: 'var(--font-mono)', fontSize: 16,
                  margin: '0 6px', userSelect: 'none',
                }}>›</span>
              )}
            </React.Fragment>
          ))}
        </div>
        {/* Data-flow track — animated packets travel left → right across the chain */}
        <FlowTrack
          accent={flow.accent}
          steps={flow.steps.length}
          active={hoveredIdx === idx || hoveredIdx === -1}
          seed={idx}
        />
      </div>
    </div>
  );
}

function Architecture() {
  const [hovered, setHovered] = React.useState(-1);
  return (
    <section id="architecture">
      <div className="container-wide">
        <SectionEyebrow n={5} label="architecture" />
        <h2 className="display" style={{
          fontSize: 'clamp(36px, 4.6vw, 56px)', margin: 0,
          color: 'var(--fg-base)', maxWidth: 760,
        }}>
          The same diagram you'd <span className="display-italic" style={{ color: 'var(--brand-400)' }}>actually whiteboard</span>.
        </h2>
        <p style={{ color: 'var(--fg-muted)', fontSize: 17, maxWidth: 700, marginTop: 16, lineHeight: 1.55 }}>
          Four flows, drawn the way the AWS console shows them. Hover a row to focus; the others fade.
        </p>

        {/* Sticky sub-nav */}
        <div className="arch-subnav" style={{
          position: 'sticky', top: 80, zIndex: 30,
          marginTop: 40, marginBottom: 16,
          padding: '10px 12px',
          background: 'rgba(13,17,23,0.85)',
          backdropFilter: 'blur(18px) saturate(140%)',
          WebkitBackdropFilter: 'blur(18px) saturate(140%)',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-subtle)', letterSpacing: '0.1em', textTransform: 'uppercase', paddingLeft: 4 }}>jump to flow</span>
          {FLOWS.map((f, i) => (
            <a key={f.id} href={`#flow-${f.id}`} className="arch-chip mono" style={{
              padding: '6px 11px', borderRadius: 6,
              border: '1px solid var(--border-default)',
              background: 'rgba(22,27,34,0.6)',
              fontSize: 11.5, color: 'var(--fg-muted)',
              textDecoration: 'none', whiteSpace: 'nowrap',
              borderLeft: `2px solid ${f.accent}`,
              transition: 'all 0.18s',
            }}>{f.label}</a>
          ))}
          <div className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-subtle)', padding: '0 4px' }}>
            <span style={{ color: 'var(--brand-400)' }}>●</span> primary node
          </div>
        </div>

        {/* Flow rows in a surface */}
        <div className="surface" style={{ padding: 20 }}>
          {FLOWS.map((f, i) => (
            <FlowRow
              key={f.id} flow={f} idx={i}
              hoveredIdx={hovered}
              onEnter={setHovered}
              onLeave={() => setHovered(-1)}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="row" style={{
          marginTop: 16, gap: 18, flexWrap: 'wrap',
          padding: '12px 16px',
          border: '1px solid var(--border-default)', borderRadius: 8,
          background: 'rgba(22,27,34,0.4)',
        }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-subtle)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>aws categories:</span>
          {Object.entries(CAT_COLORS).map(([k, c]) => (
            <span key={k} className="row items-center" style={{ gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{k}</span>
            </span>
          ))}
        </div>
      </div>
      <Connector />
      <style>{`
        .arch-chip:hover { border-color: var(--brand-500) !important; color: var(--fg-base) !important; background: var(--bg-elev) !important; }
        @media (max-width: 720px) { .arch-subnav { position: relative; top: 0; } }
        @keyframes flowMove {
          0%   { left: 8px;  opacity: 0; }
          6%   { opacity: 1; }
          94%  { opacity: 1; }
          100% { left: calc(100% - 8px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .flow-packet { animation: none !important; display: none; }
        }
      `}</style>
    </section>
  );
}

window.Architecture = Architecture;
