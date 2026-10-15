// architecture.jsx — Full-picture animated SVG diagram + AWS services side panel

const ARCH_NODES = {
  // y values stacked top→bottom
  browser:  { x: 200, y: 50,  w: 120, h: 44, label: 'Browser',     sub: 'Next.js · TS',     layer: 'edge' },
  mobile:   { x: 360, y: 50,  w: 120, h: 44, label: 'Mobile',      sub: 'iOS · Android',    layer: 'edge' },
  alb:      { x: 280, y: 140, w: 200, h: 56, label: 'ALB + WAF',   sub: '5 managed rules · TLS 1.3', layer: 'edge' },
  storefront: { x: 100, y: 240, w: 200, h: 60, label: 'storefront pod', sub: 'Next.js · SSR · ISR', layer: 'compute' },
  orderApi:   { x: 460, y: 240, w: 200, h: 60, label: 'order-api pod', sub: 'Node22 · Express', layer: 'compute' },
  eksBox:     { x: 70,  y: 220, w: 620, h: 110, label: '', sub: '', layer: 'eks' },
  cognito: { x: 70,  y: 380, w: 130, h: 50, label: 'Cognito',  sub: 'PKCE · JWT',   layer: 'data' },
  aurora:  { x: 220, y: 380, w: 130, h: 50, label: 'Aurora',   sub: 'RLS FORCE',    layer: 'data' },
  dynamo:  { x: 370, y: 380, w: 130, h: 50, label: 'DynamoDB', sub: 'WS registry',  layer: 'data' },
  kinesis: { x: 520, y: 380, w: 130, h: 50, label: 'Kinesis',  sub: 'event stream', layer: 'data' },
  s3:      { x: 670, y: 380, w: 90,  h: 50, label: 'S3',       sub: 'objects',      layer: 'data' },
  otel:    { x: 140, y: 480, w: 180, h: 50, label: 'OTel Collector', sub: 'metrics · logs · spans', layer: 'obs' },
  prom:    { x: 360, y: 480, w: 110, h: 50, label: 'Prometheus', sub: 'metrics',    layer: 'obs' },
  loki:    { x: 490, y: 480, w: 110, h: 50, label: 'Loki',     sub: 'logs',         layer: 'obs' },
  tempo:   { x: 620, y: 480, w: 110, h: 50, label: 'Tempo',    sub: 'traces',       layer: 'obs' },
};

const ARCH_EDGES = [
  ['browser', 'alb'], ['mobile', 'alb'],
  ['alb', 'storefront'], ['alb', 'orderApi'],
  ['storefront', 'cognito'], ['orderApi', 'aurora'], ['orderApi', 'kinesis'],
  ['orderApi', 'dynamo'], ['storefront', 's3'],
  ['orderApi', 'otel'], ['storefront', 'otel'],
  ['otel', 'prom'], ['otel', 'loki'], ['otel', 'tempo'],
];

const LAYER_COLOR = {
  edge:    '#67e8f9',
  compute: '#2dd4bf',
  data:    '#a78bfa',
  obs:     '#fbbf24',
  eks:     'rgba(45,212,191,0.18)',
};

const NODE_DETAILS = {
  browser: { tech: 'Next.js 15 · React 19 · App Router', notes: 'TLS to ALB; CSP locked down; HttpOnly auth cookie' },
  mobile: { tech: 'iOS + Android via React Native', notes: 'shares OpenAPI client with web' },
  alb: { tech: 'AWS ALB + WAFv2', notes: '5 managed rule groups · OWASP, bot control, IP rep, anonymous, account takeover' },
  storefront: { tech: 'Next.js pod · HPA 2–12', notes: 'SSR/ISR · cache headers digest-pinned' },
  orderApi: { tech: 'Node22 · Express · pino · OTel', notes: 'HPA 2–12 · p95 47ms · RLS context per request' },
  cognito: { tech: 'AWS Cognito User Pool', notes: 'PKCE flow · custom:tenant_id · 24h tokens · refresh rotation' },
  aurora: { tech: 'Aurora Serverless v2 · Postgres 16', notes: 'RLS FORCE · KMS encrypted · 7d PITR · cross-AZ' },
  dynamo: { tech: 'DynamoDB on-demand', notes: 'WebSocket connection registry · TTL eviction · GSI by tenant' },
  kinesis: { tech: 'Kinesis Data Streams · 4 shards', notes: 'Order events · 24h retention · tenant-partitioned' },
  s3: { tech: 'S3 + CloudFront', notes: 'Image variants · immutable cache · sigv4 on writes' },
  otel: { tech: 'OpenTelemetry Collector · sidecar', notes: 'OTLP gRPC · tail sampling · PII scrubber' },
  prom: { tech: 'Prometheus · workload metrics', notes: 'Recording rules for SLOs · 15d retention' },
  loki: { tech: 'Grafana Loki · log aggregation', notes: 'JSON parsed · tenant-tagged · 7d retention' },
  tempo: { tech: 'Grafana Tempo · distributed traces', notes: 'Full-stack spans · 3d retention · service graph' },
};

const AWS_SERVICES = [
  { name: 'EKS', icon: '⬢', cost: '$73 mo' },
  { name: 'Aurora', icon: '◉', cost: '$140 mo' },
  { name: 'Cognito', icon: '⚿', cost: '$0–25 mo' },
  { name: 'ALB', icon: '⚠', cost: '$22 mo' },
  { name: 'WAF', icon: '⛨', cost: '$10 mo' },
  { name: 'CloudFront', icon: '⌬', cost: '$8 mo' },
  { name: 'Kinesis', icon: '⇋', cost: '$12 mo' },
  { name: 'Lambda', icon: 'λ', cost: '$3 mo' },
  { name: 'DynamoDB', icon: '⊟', cost: '$6 mo' },
  { name: 'S3', icon: '⛁', cost: '$4 mo' },
  { name: 'KMS', icon: '⚷', cost: '$3 mo' },
  { name: 'Secrets', icon: '⛒', cost: '$2 mo' },
  { name: 'Step Functions', icon: '⇄', cost: '$1 mo' },
  { name: 'API Gateway', icon: '⇉', cost: '$5 mo' },
  { name: 'Route 53', icon: '⌖', cost: '$1 mo' },
  { name: 'CloudWatch', icon: '⏱', cost: '$8 mo' },
  { name: 'GuardDuty', icon: '⚯', cost: '$15 mo' },
  { name: 'ECR', icon: '◰', cost: '$2 mo' },
  { name: 'CodeBuild', icon: '⚒', cost: '$1 mo' },
  { name: 'SQS', icon: '◫', cost: '$0 mo' },
  { name: 'SNS', icon: '◐', cost: '$0 mo' },
  { name: 'IAM', icon: '⚖', cost: 'free' },
  { name: 'VPC', icon: '▣', cost: '$32 mo' },
  { name: 'CloudTrail', icon: '⏰', cost: '$2 mo' },
];

function Architecture() {
  const [hovered, setHovered] = React.useState(null);
  const [selected, setSelected] = React.useState('orderApi');
  const [svgRef, inView] = useInView({ threshold: 0.15 });
  const active = selected || hovered;
  const details = active ? NODE_DETAILS[active] : null;
  return (
    <section id="architecture" style={{ position: 'relative' }} ref={svgRef}>
      <Bioluminescence count={10} />
      <div className="container">
        <SectionHead
          eyebrow="The full picture"
          title="One diagram. Every layer."
          lede="Click any node to inspect tech, cost, and ownership. The whole stack — from browser request to observability backend."
        />
        <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 32, alignItems: 'start' }}>
          {/* Diagram */}
          <div className="glass" style={{ padding: 24, position: 'relative', minHeight: 600 }}>
            <svg className={inView ? 'arch-svg drawn' : 'arch-svg'} viewBox="0 0 800 580" style={{ width: '100%', height: 'auto' }}>
              <defs>
                <filter id="archGlow"><feGaussianBlur stdDeviation="2" /></filter>
                <linearGradient id="eksFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(45,212,191,0.15)" />
                  <stop offset="100%" stopColor="rgba(45,212,191,0.04)" />
                </linearGradient>
              </defs>
              {/* layer labels */}
              {[
                { y: 30, t: 'edge', c: LAYER_COLOR.edge },
                { y: 210, t: 'eks · kubernetes', c: LAYER_COLOR.compute },
                { y: 365, t: 'data', c: LAYER_COLOR.data },
                { y: 465, t: 'observability', c: LAYER_COLOR.obs },
              ].map((l) => (
                <text key={l.t} x="14" y={l.y} fontFamily="JetBrains Mono" fontSize="9" letterSpacing="2" fill={l.c} opacity="0.6">{l.t.toUpperCase()}</text>
              ))}
              {/* EKS box */}
              <rect x={ARCH_NODES.eksBox.x} y={ARCH_NODES.eksBox.y} width={ARCH_NODES.eksBox.w} height={ARCH_NODES.eksBox.h}
                rx="14" fill="url(#eksFill)" stroke="rgba(45,212,191,0.35)" strokeDasharray="4 4" strokeWidth="1" />
              <text x={ARCH_NODES.eksBox.x + 14} y={ARCH_NODES.eksBox.y + 20} fontFamily="JetBrains Mono" fontSize="10" fill="#5eead4">EKS · v1.28 · 2 t3.medium</text>

              {/* Edges */}
              {ARCH_EDGES.map((e, i) => {
                const a = ARCH_NODES[e[0]], b = ARCH_NODES[e[1]];
                const x1 = a.x + a.w / 2, y1 = a.y + a.h;
                const x2 = b.x + b.w / 2, y2 = b.y;
                const mx = (x1 + x2) / 2;
                const isHL = active && (active === e[0] || active === e[1]);
                return (
                  <g key={i} style={{ animationDelay: (0.4 + i * 0.05) + 's' }}>
                    <path className="arch-edge" d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={isHL ? '#5eead4' : 'rgba(94,234,212,0.25)'}
                      strokeWidth={isHL ? 1.4 : 0.8}
                      strokeDasharray={isHL ? "0" : "3 4"}
                      filter={isHL ? "url(#archGlow)" : undefined}
                      style={{ animationDelay: (0.4 + i * 0.05) + 's' }}
                    />
                    {/* Data packet */}
                    <circle r={isHL ? 3 : 2} fill={isHL ? '#5eead4' : 'rgba(94,234,212,0.7)'}>
                      <animateMotion dur={`${2.5 + (i % 3) * 0.4}s`} repeatCount="indefinite"
                        path={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`} />
                      <animate attributeName="opacity" values="0;1;0" dur={`${2.5 + (i % 3) * 0.4}s`} repeatCount="indefinite" />
                    </circle>
                  </g>
                );
              })}
              {/* Nodes */}
              {Object.entries(ARCH_NODES).map(([k, n]) => {
                if (k === 'eksBox') return null;
                const c = LAYER_COLOR[n.layer];
                const isActive = active === k;
                return (
                  <g key={k} className="arch-node" style={{ cursor: 'pointer', animationDelay: (Object.keys(ARCH_NODES).indexOf(k) * 0.045) + 's' }}
                    onMouseEnter={() => setHovered(k)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(k)}
                    data-hover
                  >
                    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="8"
                      fill={isActive ? `${c}30` : 'rgba(20,28,45,0.85)'}
                      stroke={isActive ? c : 'rgba(94,234,212,0.35)'}
                      strokeWidth={isActive ? 1.6 : 1}
                      filter={isActive ? "url(#archGlow)" : undefined}
                    />
                    <text x={n.x + n.w / 2} y={n.y + 22} textAnchor="middle"
                      fontFamily="Outfit" fontSize="13" fontWeight="500"
                      fill={isActive ? c : 'var(--fg)'}>{n.label}</text>
                    {n.sub && (
                      <text x={n.x + n.w / 2} y={n.y + 40} textAnchor="middle"
                        fontFamily="JetBrains Mono" fontSize="9"
                        fill="rgba(139,148,158,0.9)">{n.sub}</text>
                    )}
                  </g>
                );
              })}
            </svg>
            {/* Floating callout for selected */}
            {details && (
              <div className="glass glass-strong" style={{
                position: 'absolute', right: 28, bottom: 28,
                padding: '14px 18px', maxWidth: 320,
                borderColor: 'var(--border-strong)',
              }}>
                <div className="label-eyebrow" style={{ marginBottom: 6 }}>
                  ▸ {ARCH_NODES[active]?.label}
                </div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--teal-soft)', marginBottom: 4 }}>{details.tech}</div>
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{details.notes}</div>
              </div>
            )}
            {/* Bottom wave */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, pointerEvents: 'none', overflow: 'hidden', borderRadius: '0 0 16px 16px' }}>
              <svg viewBox="0 0 800 80" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                <path d="M 0 50 Q 200 20, 400 50 T 800 50 L 800 80 L 0 80 Z" fill="rgba(45,212,191,0.06)" />
                <path d="M 0 60 Q 200 40, 400 60 T 800 60 L 800 80 L 0 80 Z" fill="rgba(45,212,191,0.04)" />
              </svg>
            </div>
          </div>

          {/* Side panel */}
          <div className="col gap-16">
            <div className="glass" style={{ padding: 24 }}>
              <Eyebrow>AWS Services</Eyebrow>
              <h3 className="display" style={{ fontSize: 28, marginTop: 8, marginBottom: 6 }}>24 services</h3>
              <div className="mono" style={{ color: 'var(--fg-muted)', fontSize: 12 }}>~$352 /month · prod-equivalent traffic</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 20 }}>
                {AWS_SERVICES.map((s, i) => (
                  <div key={s.name} className="service-icon glass" style={{
                    padding: '10px 6px', textAlign: 'center', borderRadius: 10,
                    transition: 'all 0.2s', cursor: 'pointer', position: 'relative',
                  }} data-hover
                     title={`${s.name} · ${s.cost}`}>
                    <div style={{ fontSize: 18, color: 'var(--teal)', textShadow: '0 0 8px var(--teal-glow)' }}>{s.icon}</div>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--fg-muted)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass" style={{ padding: 20 }}>
              <Eyebrow>Layer legend</Eyebrow>
              <div className="col gap-8" style={{ marginTop: 12 }}>
                {[
                  ['edge', 'Edge', LAYER_COLOR.edge],
                  ['compute', 'Compute · EKS', LAYER_COLOR.compute],
                  ['data', 'Data', LAYER_COLOR.data],
                  ['obs', 'Observability', LAYER_COLOR.obs],
                ].map(([k, l, c]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: c, boxShadow: `0 0 8px ${c}` }} />
                    <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .service-icon:hover {
          border-color: var(--border-strong) !important;
          transform: translateY(-2px);
          box-shadow: 0 0 18px var(--teal-faint);
        }
        @media (max-width: 900px) {
          #architecture .container > .reveal { grid-template-columns: 1fr !important; }
        }
        /* SVG draw-in: stagger only when .drawn class lands; otherwise show normally. */
        .arch-svg.drawn .arch-node { animation: arch-fade-in 0.6s ease both; opacity: 0; }
        .arch-svg.drawn .arch-edge { animation: arch-edge-in 1.2s ease both; stroke-dasharray: 800; stroke-dashoffset: 800; }
        @keyframes arch-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes arch-edge-in { to { stroke-dashoffset: 0; } }
      `}</style>
    </section>
  );
}

window.Architecture = Architecture;
