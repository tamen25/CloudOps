// journey.jsx — Horizontal scroll story, 5 panels.
// Implemented as a tall vertical container with sticky child;
// scroll progress through the section drives an x-translate of the inner row.

// Code pre with embedded <span class="tok-*"> tokens — uses dangerouslySetInnerHTML.
function CodePre({ html, style }) {
  return <pre style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}

const PANELS = [
  {
    id: 'multi-tenancy',
    n: '01',
    eyebrow: 'isolation',
    title: 'Row-Level Security',
    headline: 'Every query. Every tenant. Zero trust.',
    body: 'Postgres RLS with FORCE. Tenant context bound at JWT verify — even the table owner can\'t bypass the boundary.',
    accent: '#2dd4bf',
  },
  {
    id: 'event-driven',
    n: '02',
    eyebrow: 'workflows',
    title: 'Sagas & Streams',
    headline: 'Durable workflows. Eventual consistency.',
    body: 'Step Functions orchestrate the checkout saga. Kinesis fans events to Lambda, WebSocket, analytics. No distributed transactions.',
    accent: '#5eead4',
  },
  {
    id: 'observability',
    n: '03',
    eyebrow: 'visibility',
    title: 'Full-Stack Telemetry',
    headline: 'Metrics. Logs. Traces. One dashboard.',
    body: 'OTel from Next.js through API Gateway, Lambda, Express, RDS. Prometheus, Loki, Tempo — every request traceable end-to-end.',
    accent: '#67e8f9',
  },
  {
    id: 'security',
    n: '04',
    eyebrow: 'defense',
    title: 'Zero Trust Stack',
    headline: 'Signed images. Enforced policies. Encrypted everything.',
    body: 'PSS Restricted. Cosign-verified. WAF + NetworkPolicy default-deny. Secrets rotate. RLS FORCE-mode. KMS at rest.',
    accent: '#a78bfa',
  },
  {
    id: 'production',
    n: '05',
    eyebrow: 'shipping',
    title: 'Production Ready',
    headline: 'Approval gates. Digest-pinned. Zero-downtime.',
    body: 'GitHub Actions → cosign sign → trivy scan → manual approval → kubectl rollout. Verify, then green checkmark — or rollback.',
    accent: '#fbbf24',
  },
];

// Panel content components
function PanelMultiTenancy({ active }) {
  return (
    <>
      <div className="panel-visual">
        {/* Three tenant silos with RLS shield */}
        <svg viewBox="0 0 520 380" style={{ width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="tenA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.6" /><stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.15" /></linearGradient>
            <linearGradient id="tenB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c69026" stopOpacity="0.6" /><stop offset="100%" stopColor="#c69026" stopOpacity="0.15" /></linearGradient>
            <linearGradient id="tenC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#539bf5" stopOpacity="0.6" /><stop offset="100%" stopColor="#539bf5" stopOpacity="0.15" /></linearGradient>
          </defs>
          {/* Shield in center */}
          <g transform="translate(260 70)">
            <circle r="44" fill="rgba(45,212,191,0.1)" stroke="#2dd4bf" strokeWidth="1.5" opacity="0.9">
              {active && <animate attributeName="r" values="40;48;40" dur="2s" repeatCount="indefinite" />}
            </circle>
            <path d="M 0 -22 L 18 -14 L 18 6 Q 18 22 0 28 Q -18 22 -18 6 L -18 -14 Z"
              fill="rgba(45,212,191,0.25)" stroke="#5eead4" strokeWidth="1.5" />
            <text y="6" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="#5eead4" fontWeight="700">RLS</text>
          </g>
          {/* Lines from shield to tenants */}
          <g stroke="rgba(94,234,212,0.4)" strokeDasharray="3 4" strokeWidth="1">
            <line x1="260" y1="120" x2="100" y2="220" />
            <line x1="260" y1="120" x2="260" y2="220" />
            <line x1="260" y1="120" x2="420" y2="220" />
          </g>
          {/* Tenant DBs */}
          {[
            { x: 100, c: '#2dd4bf', g: 'tenA', label: 'tenant_a · acme' },
            { x: 260, c: '#c69026', g: 'tenB', label: 'tenant_b · widgets' },
            { x: 420, c: '#539bf5', g: 'tenC', label: 'tenant_c · globex' },
          ].map((t, i) => (
            <g key={i} transform={`translate(${t.x - 60} 220)`}>
              <rect width="120" height="120" rx="10" fill={`url(#${t.g})`} stroke={t.c} strokeWidth="1.2" />
              <text x="60" y="22" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill={t.c} fontWeight="600">{t.label}</text>
              {/* fake rows */}
              {Array.from({ length: 4 }).map((_, j) => (
                <g key={j} transform={`translate(10 ${36 + j * 18})`}>
                  <rect width="100" height="12" rx="2" fill="rgba(255,255,255,0.05)" />
                  <rect x="4" y="4" width="6" height="4" rx="1" fill={t.c} />
                  <rect x="14" y="3" width={50 + j * 8} height="6" rx="1" fill="rgba(255,255,255,0.2)" />
                </g>
              ))}
            </g>
          ))}
        </svg>
      </div>
      <div className="panel-code-card glass">
        <div className="code-head"><div className="traffic"><span /><span /><span /></div><span>migrations/003_rls.sql</span></div>
        <CodePre style={{ fontSize: 12 }} html={`<span class="tok-kw">ALTER TABLE</span> orders <span class="tok-kw">ENABLE ROW LEVEL SECURITY</span>;
<span class="tok-kw">ALTER TABLE</span> orders <span class="tok-kw">FORCE ROW LEVEL SECURITY</span>;

<span class="tok-kw">CREATE POLICY</span> tenant_isolation <span class="tok-kw">ON</span> orders
  <span class="tok-kw">USING</span> (tenant_id = <span class="tok-fn">current_setting</span>(<span class="tok-str">'app.tenant'</span>)::uuid)
  <span class="tok-kw">WITH CHECK</span> (tenant_id = <span class="tok-fn">current_setting</span>(<span class="tok-str">'app.tenant'</span>)::uuid);

<span class="tok-com">-- Even the table owner cannot bypass.</span>
<span class="tok-com">-- ctx.tenant from JWT, set per-connection.</span>`} />
      </div>
    </>
  );
}

function PanelEventDriven({ active }) {
  return (
    <>
      <div className="panel-visual">
        <svg viewBox="0 0 520 380" style={{ width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="streamG" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#5eead4" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          {/* Source */}
          <g transform="translate(40 170)">
            <rect width="120" height="60" rx="8" fill="rgba(20,28,45,0.85)" stroke="#5eead4" strokeWidth="1.2" />
            <text x="60" y="28" textAnchor="middle" fontFamily="Outfit" fontSize="13" fill="#e6edf3">order-api</text>
            <text x="60" y="44" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="#8b949e">POST /order</text>
          </g>
          {/* Stream */}
          <g transform="translate(180 170)">
            <rect width="160" height="60" rx="8" fill="rgba(45,212,191,0.1)" stroke="#2dd4bf" strokeWidth="1.5" />
            <text x="80" y="28" textAnchor="middle" fontFamily="Outfit" fontSize="13" fill="#5eead4">Kinesis · orders</text>
            <text x="80" y="44" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="#8b949e">4 shards · 24h retention</text>
          </g>
          {/* Particle stream from source → kinesis */}
          {[0, 0.3, 0.6, 0.9].map((d, i) => (
            <circle key={i} r="3" fill="#5eead4">
              <animate attributeName="cx" values="160;180" dur="1.4s" begin={d + 's'} repeatCount="indefinite" />
              <animate attributeName="cy" values="200;200" dur="1.4s" begin={d + 's'} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;0" dur="1.4s" begin={d + 's'} repeatCount="indefinite" />
            </circle>
          ))}
          {/* 3 consumers */}
          {[
            { y: 60, label: 'ws-fanout', sub: 'live updates' },
            { y: 170, label: 'email-svc', sub: 'order receipts' },
            { y: 280, label: 'analytics', sub: '→ Snowflake' },
          ].map((c, i) => (
            <g key={i} transform={`translate(380 ${c.y})`}>
              <rect width="120" height="60" rx="8" fill="rgba(20,28,45,0.85)" stroke="rgba(94,234,212,0.4)" strokeWidth="1" />
              <text x="60" y="28" textAnchor="middle" fontFamily="Outfit" fontSize="13" fill="#e6edf3">{c.label}</text>
              <text x="60" y="44" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="#8b949e">{c.sub}</text>
              {/* line from kinesis to consumer */}
              <line x1="-40" y1={200 - c.y - 30} x2="0" y2="30" stroke="rgba(94,234,212,0.4)" strokeDasharray="3 3" />
              {/* particles */}
              <circle r="3" fill="#5eead4" opacity="0.8">
                <animate attributeName="cx" values="-40;0" dur="1.6s" begin={(i * 0.4) + 's'} repeatCount="indefinite" />
                <animate attributeName="cy" values={`${200 - c.y - 30};30`} dur="1.6s" begin={(i * 0.4) + 's'} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;1;0" dur="1.6s" begin={(i * 0.4) + 's'} repeatCount="indefinite" />
              </circle>
            </g>
          ))}
        </svg>
      </div>
      <div className="panel-code-card glass">
        <div className="code-head"><div className="traffic"><span /><span /><span /></div><span>checkout-saga.asl.json</span></div>
        <CodePre style={{ fontSize: 12 }} html={`{
  <span class="tok-key">"StartAt"</span>: <span class="tok-str">"ReserveInventory"</span>,
  <span class="tok-key">"States"</span>: {
    <span class="tok-str">"ReserveInventory"</span>: { <span class="tok-key">"Next"</span>: <span class="tok-str">"ChargeCard"</span> },
    <span class="tok-str">"ChargeCard"</span>:        { <span class="tok-key">"Next"</span>: <span class="tok-str">"PublishEvent"</span>,
                              <span class="tok-key">"Catch"</span>: [{ <span class="tok-key">"Next"</span>: <span class="tok-str">"ReleaseInventory"</span> }] },
    <span class="tok-str">"PublishEvent"</span>:     { <span class="tok-key">"End"</span>: <span class="tok-num">true</span> },
    <span class="tok-str">"ReleaseInventory"</span>: { <span class="tok-key">"End"</span>: <span class="tok-num">true</span> }
  }
}`} />
      </div>
    </>
  );
}

function PanelObservability({ active }) {
  // Mini grafana-like dashboard
  return (
    <>
      <div className="panel-visual" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', gap: 8, padding: 10 }}>
        {[
          { title: 'p99 order latency', val: '2.14ms', color: '#2dd4bf', kind: 'line' },
          { title: 'http_requests_total', val: '4.2k/s', color: '#5eead4', kind: 'line' },
          { title: 'pod CPU usage', val: '34%', color: '#67e8f9', kind: 'area' },
          { title: 'error rate', val: '0.024%', color: '#22c55e', kind: 'bar' },
          { title: 'kinesis lag', val: '180ms', color: '#a78bfa', kind: 'line' },
          { title: 'active spans', val: '12.4k', color: '#fbbf24', kind: 'bar' },
        ].map((p, i) => <MiniChart key={i} {...p} active={active} idx={i} />)}
      </div>
      <div className="panel-code-card glass">
        <div className="code-head"><div className="traffic"><span /><span /><span /></div><span>trace waterfall · order_create</span></div>
        <div style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.9 }}>
          {[
            { l: 'next.js · POST /api/order', d: 47, x: 0, c: '#5eead4' },
            { l: '  api-gw · authorizer', d: 12, x: 8, c: '#67e8f9' },
            { l: '  lambda · order-create', d: 28, x: 20, c: '#2dd4bf' },
            { l: '    db · INSERT orders', d: 8, x: 32, c: '#a78bfa' },
            { l: '    kinesis · PutRecord', d: 4, x: 40, c: '#fbbf24' },
            { l: '  cloudfront · 201', d: 3, x: 44, c: '#5eead4' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-muted)' }}>
              <span style={{ flex: '0 0 auto', width: 180, fontSize: 11 }}>{s.l}</span>
              <div style={{ position: 'relative', flex: 1, height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                <div style={{
                  position: 'absolute', left: (s.x / 50) * 100 + '%',
                  width: (s.d / 50) * 100 + '%', height: '100%',
                  background: s.c, borderRadius: 2,
                  boxShadow: `0 0 8px ${s.c}66`,
                }} />
              </div>
              <span className="mono" style={{ flex: '0 0 auto', width: 40, textAlign: 'right', color: 'var(--fg-muted)' }}>{s.d}ms</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MiniChart({ title, val, color, kind, active, idx }) {
  const points = React.useMemo(() => {
    const seed = idx * 13;
    return Array.from({ length: 24 }, (_, i) => {
      return 0.3 + Math.abs(Math.sin(i * 0.4 + seed)) * 0.5 + Math.random() * 0.18;
    });
  }, [idx]);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i / (points.length - 1)) * 100} ${100 - p * 80}`).join(' ');
  const area = path + ` L 100 100 L 0 100 Z`;
  return (
    <div className="glass" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-muted)', letterSpacing: 0.5 }}>{title}</span>
        <span className="mono" style={{ fontSize: 12, color, fontWeight: 600 }}>{val}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 50, flex: 1 }}>
        <defs>
          <linearGradient id={`mc-${idx}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {kind === 'bar' ? (
          points.map((p, i) => (
            <rect key={i} x={(i / points.length) * 100} y={100 - p * 80} width={100 / points.length - 1} height={p * 80} fill={color} opacity="0.8" />
          ))
        ) : (
          <>
            {kind === 'area' && <path d={area} fill={`url(#mc-${idx})`} />}
            <path d={path} fill="none" stroke={color} strokeWidth="1.2" />
          </>
        )}
      </svg>
    </div>
  );
}

function PanelSecurity({ active }) {
  const badges = [
    { l: 'PSS Restricted', c: '#a78bfa' },
    { l: 'Cosign Verified', c: '#2dd4bf' },
    { l: 'WAF · 5 Rules', c: '#5eead4' },
    { l: 'RLS · FORCE', c: '#67e8f9' },
    { l: 'KMS · Encrypted', c: '#fbbf24' },
    { l: 'NetworkPolicy', c: '#22c55e' },
  ];
  return (
    <>
      <div className="panel-visual">
        <svg viewBox="0 0 520 380" style={{ width: '100%', height: '100%' }}>
          <defs>
            <radialGradient id="shieldG" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* central shield */}
          <g transform="translate(260 190)">
            <circle r="100" fill="url(#shieldG)" />
            <circle r="60" fill="rgba(167,139,250,0.1)" stroke="#a78bfa" strokeWidth="1.5">
              {active && <animate attributeName="r" values="58;64;58" dur="2s" repeatCount="indefinite" />}
            </circle>
            <path d="M 0 -38 L 32 -24 L 32 10 Q 32 38 0 50 Q -32 38 -32 10 L -32 -24 Z"
              fill="rgba(167,139,250,0.2)" stroke="#c4b5fd" strokeWidth="1.8" />
            <text y="6" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" fill="#c4b5fd" fontWeight="700">CHK</text>
          </g>
          {/* orbiting badges */}
          {badges.map((b, i) => {
            const ang = (i / badges.length) * Math.PI * 2 - Math.PI / 2;
            const r = 150;
            const x = 260 + Math.cos(ang) * r;
            const y = 190 + Math.sin(ang) * r * 0.78;
            return (
              <g key={i}>
                <line x1="260" y1="190" x2={x} y2={y} stroke="rgba(167,139,250,0.2)" strokeDasharray="2 4" />
                <g transform={`translate(${x - 50} ${y - 14})`}>
                  <rect width="100" height="28" rx="14" fill="rgba(20,28,45,0.9)" stroke={b.c} strokeWidth="1" />
                  <circle cx="14" cy="14" r="4" fill={b.c} />
                  <text x="56" y="18" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill={b.c}>{b.l}</text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="panel-code-card glass">
        <div className="code-head"><div className="traffic"><span /><span /><span /></div><span>kustomize/policies.yaml</span></div>
        <CodePre style={{ fontSize: 12 }} html={`<span class="tok-key">apiVersion</span>: <span class="tok-str">policy/v1</span>
<span class="tok-key">kind</span>: <span class="tok-str">PodSecurity</span>
<span class="tok-key">spec</span>:
  <span class="tok-key">enforce</span>: <span class="tok-str">restricted</span>
  <span class="tok-key">enforce-version</span>: <span class="tok-str">v1.28</span>
---
<span class="tok-key">apiVersion</span>: <span class="tok-str">networking.k8s.io/v1</span>
<span class="tok-key">kind</span>: <span class="tok-str">NetworkPolicy</span>
<span class="tok-key">spec</span>:
  <span class="tok-key">policyTypes</span>: [<span class="tok-str">Ingress</span>, <span class="tok-str">Egress</span>]
  <span class="tok-key">podSelector</span>: {}  <span class="tok-com"># default-deny</span>`} />
      </div>
    </>
  );
}

function PanelProduction({ active }) {
  const stages = ['PR', 'Build', 'Sign', 'Scan', 'Approve', 'Deploy', 'Verify'];
  const [activeStage, setActiveStage] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setActiveStage((s) => (s + 1) % (stages.length + 2)), 700);
    return () => clearInterval(id);
  }, [active]);
  return (
    <>
      <div className="panel-visual" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {stages.map((s, i) => (
              <React.Fragment key={s}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  background: i <= activeStage ? 'rgba(45,212,191,0.2)' : 'rgba(20,28,45,0.7)',
                  border: `1.5px solid ${i <= activeStage ? '#2dd4bf' : 'rgba(94,234,212,0.2)'}`,
                  color: i <= activeStage ? '#5eead4' : 'var(--fg-faint)',
                  boxShadow: i === activeStage ? '0 0 24px rgba(45,212,191,0.6)' : 'none',
                  transition: 'all 0.4s ease',
                  flexShrink: 0,
                }}>{s}</div>
                {i < stages.length - 1 && (
                  <div style={{ width: 32, height: 2, background: i < activeStage ? '#2dd4bf' : 'rgba(94,234,212,0.2)', position: 'relative', overflow: 'hidden' }}>
                    {i === activeStage && (
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, #5eead4, transparent)', animation: 'pktFlow 1s linear infinite' }} />
                    )}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="mono" style={{ fontSize: 13, color: '#2dd4bf', textAlign: 'center' }}>
            <span className="pulse-dot" style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />
            {activeStage <= stages.length - 1 ? `running: ${stages[activeStage]}` : 'all green · deploy complete'}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
            <span>last deploy: a4f2c91</span><span>·</span>
            <span>duration: 4m 12s</span><span>·</span>
            <span style={{ color: '#22c55e' }}>✓ verified</span>
          </div>
        </div>
        <style>{`@keyframes pktFlow { from { transform: translateX(-100%); } to { transform: translateX(100%); } }`}</style>
      </div>
      <div className="panel-code-card glass">
        <div className="code-head"><div className="traffic"><span /><span /><span /></div><span>.github/workflows/app.yml</span></div>
        <CodePre style={{ fontSize: 12 }} html={`<span class="tok-key">deploy</span>:
  <span class="tok-key">runs-on</span>: <span class="tok-str">ubuntu-latest</span>
  <span class="tok-key">needs</span>: [<span class="tok-str">build</span>, <span class="tok-str">sign</span>, <span class="tok-str">scan</span>, <span class="tok-str">approve</span>]
  <span class="tok-key">steps</span>:
    - <span class="tok-key">name</span>: <span class="tok-str">Rollout</span>
      <span class="tok-key">run</span>: |
        kubectl set image deploy/order-api \\
          api=$REGISTRY/order-api@$DIGEST
        kubectl rollout status deploy/order-api \\
          --timeout=5m`} />
      </div>
    </>
  );
}

const PANEL_COMPONENTS = [PanelMultiTenancy, PanelEventDriven, PanelObservability, PanelSecurity, PanelProduction];

function Journey() {
  const containerRef = React.useRef(null);
  const [progress, setProgress] = React.useState(0); // 0..1 through the section
  const [activeIdx, setActiveIdx] = React.useState(0);
  React.useEffect(() => {
    const onScroll = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = r.height - vh;
      const scrolled = Math.max(0, Math.min(total, -r.top));
      const p = total > 0 ? scrolled / total : 0;
      setProgress(p);
      const idx = Math.min(PANELS.length - 1, Math.floor(p * PANELS.length * 0.999));
      setActiveIdx(idx);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // Horizontal offset: each panel is full viewport width
  // We slide over (PANELS.length - 1) widths across the scroll range
  const x = -progress * 100 * (PANELS.length - 1);

  return (
    <section id="journey" ref={containerRef} style={{
      padding: 0,
      height: `${PANELS.length * 110}vh`, // gives room to scroll horizontally
      position: 'relative',
      background: 'transparent',
    }}>
      <div style={{
        position: 'sticky', top: 0, height: '100vh',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Section heading bar */}
        <div style={{ position: 'absolute', top: 88, left: 0, right: 0, zIndex: 5, textAlign: 'center', pointerEvents: 'none' }}>
          <div className="label-eyebrow">The Platform Journey</div>
          <h2 className="display display-grad" style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', marginTop: 8 }}>
            From browser to bedrock, in five panels
          </h2>
        </div>

        {/* Panel indicators */}
        <div style={{ position: 'absolute', left: 32, top: '50%', transform: 'translateY(-50%)', zIndex: 5, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {PANELS.map((p, i) => (
            <div key={p.id} className="panel-indicator" style={{
              display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              opacity: i === activeIdx ? 1 : 0.5,
              transition: 'opacity 0.3s',
            }} onClick={() => {
              if (!containerRef.current) return;
              const r = containerRef.current.getBoundingClientRect();
              const totalHeight = r.height - window.innerHeight;
              const target = r.top + window.scrollY + (totalHeight * i) / (PANELS.length - 1);
              window.scrollTo({ top: target, behavior: 'smooth' });
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: i === activeIdx ? p.accent : 'transparent',
                border: `1.5px solid ${p.accent}`,
                boxShadow: i === activeIdx ? `0 0 16px ${p.accent}` : 'none',
                transform: i === activeIdx ? 'scale(1.4)' : 'scale(1)',
                transition: 'all 0.3s',
              }} />
              <span className="mono" style={{ fontSize: 11, color: i === activeIdx ? 'var(--fg)' : 'var(--fg-muted)' }}>
                {p.n} · {p.eyebrow}
              </span>
            </div>
          ))}
        </div>

        {/* Horizontal track */}
        <div style={{
          display: 'flex', flex: 1,
          transform: `translate3d(${x}vw, 0, 0)`,
          willChange: 'transform',
          paddingTop: 130, paddingBottom: 60,
        }}>
          {PANELS.map((p, i) => {
            const Comp = PANEL_COMPONENTS[i];
            const isActive = i === activeIdx;
            // local progress 0..1 within this panel's "slot" of the scroll
            const slot = 1 / (PANELS.length - 1);
            const local = Math.max(0, Math.min(1, (progress - i * slot) / slot));
            // foreground parallax — panels translate slightly more than the base
            const fgX = (local - 0.5) * 30;
            return (
              <div key={p.id} className="journey-panel" style={{
                flex: '0 0 100vw', height: '100%',
                display: 'grid',
                gridTemplateColumns: '1fr 1.1fr',
                gap: 40,
                padding: '0 100px 0 110px',
                alignItems: 'center',
                opacity: Math.max(0.2, 1 - Math.abs(i - progress * (PANELS.length - 1)) * 0.6),
                transition: 'opacity 0.3s',
              }}>
                {/* Text side */}
                <div style={{ transform: `translate3d(${fgX * -0.4}px, 0, 0)` }}>
                  <div className="label-eyebrow" style={{ color: p.accent, marginBottom: 12 }}>{p.n} · {p.eyebrow}</div>
                  <h3 className="display" style={{ fontSize: 'clamp(28px, 3.4vw, 44px)', lineHeight: 1.05, marginBottom: 16 }}>
                    <span style={{ color: p.accent }}>{p.title}</span>
                  </h3>
                  <p className="display" style={{ fontSize: 'clamp(20px, 2.2vw, 28px)', lineHeight: 1.2, marginBottom: 24, color: 'var(--fg)', fontWeight: 400 }}>
                    {p.headline}
                  </p>
                  <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--fg-muted)', maxWidth: 480 }}>
                    {p.body}
                  </p>
                </div>
                {/* Visual side */}
                <div style={{ position: 'relative', height: 'min(70vh, 540px)', display: 'flex', flexDirection: 'column', gap: 16, transform: `translate3d(${fgX}px, 0, 0)` }}>
                  <Comp active={isActive} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom rail: scrubber */}
        <div style={{ position: 'absolute', bottom: 28, left: 110, right: 110, height: 2, background: 'rgba(94,234,212,0.12)', borderRadius: 1 }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, var(--teal-soft), var(--teal))',
            boxShadow: '0 0 12px var(--teal-glow)',
          }} />
        </div>
      </div>

      <style>{`
        .panel-visual {
          background: linear-gradient(180deg, rgba(20,28,45,0.4), rgba(8,14,28,0.6));
          border: 1px solid var(--border-default);
          border-radius: 18px;
          overflow: hidden;
          flex: 1;
          min-height: 0;
          backdrop-filter: blur(12px);
          position: relative;
        }
        .panel-code-card {
          flex: 0 0 auto;
          font-size: 12px;
        }
        .panel-code-card pre {
          margin: 0;
          padding: 12px 16px;
          font-family: var(--font-mono);
          line-height: 1.7;
          color: var(--fg);
          max-height: 200px;
          overflow: hidden;
        }
        @media (max-width: 900px) {
          .journey-panel { grid-template-columns: 1fr !important; padding: 0 40px !important; }
        }
      `}</style>
    </section>
  );
}

window.Journey = Journey;
