// wireframes.jsx — CloudOps wireframe exploration on a design canvas

// ─── shared chrome ──────────────────────────────────────────────────────
function Nav({ scrolled = false }) {
  return (
    <div className="nav">
      <div className="brand">
        <div className="mark">▲</div>
        <span>CloudOps</span>
        <span className="label" style={{ fontSize: 14, color: 'var(--ink-faint)' }}>order-api</span>
      </div>
      <div className="links">
        <span>API Docs</span>
        <span>Architecture</span>
        <span>Features</span>
        <span>Security</span>
        <span className="teal">GitHub ↗</span>
      </div>
    </div>
  );
}

function Browser({ children, url = "cloudops.dev" }) {
  return (
    <div className="col" style={{ width: '100%', height: '100%' }}>
      <div className="row gap-6" style={{ padding: '8px 12px', borderBottom: '1.5px solid var(--line)', alignItems: 'center', background: 'rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, border: '1.5px solid var(--ink)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, border: '1.5px solid var(--ink)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 5, border: '1.5px solid var(--ink)' }} />
        </div>
        <div className="label" style={{ fontSize: 13, color: 'var(--ink-soft)', marginLeft: 12 }}>● {url}</div>
      </div>
      <div className="grow" style={{ overflow: 'hidden', position: 'relative' }}>{children}</div>
    </div>
  );
}

function Arrow({ from, to, color = "var(--ink)", curve = 0, dashed = false }) {
  const mx = (from[0] + to[0]) / 2 + curve;
  const my = (from[1] + to[1]) / 2 - Math.abs(curve) * 0.3;
  return (
    <g>
      <path d={`M ${from[0]} ${from[1]} Q ${mx} ${my} ${to[0]} ${to[1]}`} stroke={color} fill="none" strokeWidth="1.5" strokeDasharray={dashed ? "4 4" : "0"} />
      <path d={`M ${to[0]} ${to[1]} l -7 -3 m 7 3 l -5 5`} stroke={color} fill="none" strokeWidth="1.5" />
    </g>
  );
}

// ─── HERO VARIANTS ──────────────────────────────────────────────────────

function HeroA() {
  // Classic centered hero w/ aurora orbs + live status pills
  return (
    <div className="wf">
      <Nav />
      <div className="grid-bg" style={{ position: 'absolute', inset: '60px 0 0 0', opacity: 0.6 }} />
      {/* aurora orbs */}
      <div style={{ position: 'absolute', top: 140, left: 80, width: 260, height: 260, borderRadius: '50%', background: 'var(--teal-soft)', filter: 'blur(0px)', border: '1.5px dashed var(--teal-line)' }}>
        <div className="label" style={{ position: 'absolute', top: -22, left: 8, color: 'var(--teal)' }}>aurora orb (drifts)</div>
      </div>
      <div style={{ position: 'absolute', top: 280, right: 100, width: 200, height: 200, borderRadius: '50%', background: 'rgba(180,140,255,0.14)', border: '1.5px dashed rgba(140,100,200,0.6)' }} />
      <div style={{ position: 'absolute', top: 420, left: 280, width: 140, height: 140, borderRadius: '50%', background: 'rgba(80,200,220,0.16)', border: '1.5px dashed rgba(60,160,180,0.55)' }} />
      <div style={{ position: 'absolute', inset: '90px 0 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, textAlign: 'center', zIndex: 2 }}>
        <div style={{ fontSize: 56, lineHeight: 1.05, marginBottom: 16 }}>
          CloudOps <span className="teal">Order API</span>
        </div>
        <div className="label" style={{ fontSize: 22, color: 'var(--ink-soft)', marginBottom: 28 }}>
          Multi-tenant · Row-level security · Event-driven · Production-grade
        </div>
        <div className="row gap-12" style={{ marginBottom: 36 }}>
          <span className="pill teal"><span className="dot pulse" /> API · 200ms p95</span>
          <span className="pill teal"><span className="dot pulse" /> DB · 12 active connections</span>
          <span className="pill teal"><span className="dot pulse" /> Events · 2.3k/day</span>
        </div>
        <div className="row gap-12">
          <span className="btn primary">Explore API Docs →</span>
          <span className="btn">View Architecture</span>
        </div>
        <div className="note" style={{ marginTop: 28, fontSize: 18 }}>↓ scroll for arch story</div>
      </div>
      <div className="stamp" style={{ position: 'absolute', top: 90, right: 40, fontSize: 16 }}>A · centered + live pills</div>
    </div>
  );
}

function HeroB() {
  // Split: copy left, live terminal/dashboard right
  return (
    <div className="wf">
      <Nav />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, padding: 60, height: 'calc(100% - 60px)' }}>
        <div className="col" style={{ justifyContent: 'center', gap: 20 }}>
          <span className="pill teal" style={{ alignSelf: 'flex-start' }}><span className="dot pulse" /> v1.0.0 · live</span>
          <h1 style={{ fontSize: 56, lineHeight: 1.05 }}>
            The order API,<br/><span className="teal underline">opened up.</span>
          </h1>
          <div className="label" style={{ fontSize: 20, color: 'var(--ink-soft)', maxWidth: 460 }}>
            Multi-tenant. RLS-enforced. Event-driven. Every layer wired with OpenTelemetry — every request traceable.
          </div>
          <div className="row gap-12" style={{ marginTop: 16 }}>
            <span className="btn primary">Try the API ↗</span>
            <span className="btn">Read the docs</span>
          </div>
          <div className="row gap-16" style={{ marginTop: 20, fontFamily: 'var(--label)', color: 'var(--ink-soft)', fontSize: 16 }}>
            <span>● 200ms p95</span>
            <span>● 1247 req/s peak</span>
            <span>● 0.02% errors</span>
          </div>
        </div>
        <div className="box" style={{ padding: 14, fontFamily: 'var(--mono)', fontSize: 13, position: 'relative', background: '#181c20', color: '#dde4ea', borderColor: '#181c20' }}>
          <div className="row gap-6" style={{ marginBottom: 10 }}>
            <div style={{ width: 9, height: 9, borderRadius: 5, background: '#ff5f57' }} />
            <div style={{ width: 9, height: 9, borderRadius: 5, background: '#febc2e' }} />
            <div style={{ width: 9, height: 9, borderRadius: 5, background: '#28c840' }} />
            <span style={{ marginLeft: 12, opacity: 0.6 }}>~/cloudops</span>
          </div>
          <div style={{ color: '#7eecd9' }}>$ curl -X POST https://api.cloudops.dev/order \</div>
          <div style={{ paddingLeft: 14 }}>-H "Authorization: Bearer $JWT" \</div>
          <div style={{ paddingLeft: 14 }}>-H "Idempotency-Key: $(uuidgen)" \</div>
          <div style={{ paddingLeft: 14 }}>-d '{`{"items":[{"sku":"widget-pro","qty":2}]}`}'</div>
          <div style={{ marginTop: 12, color: '#7eecd9' }}>HTTP/1.1 201 Created</div>
          <div style={{ opacity: 0.85 }}>{`{ "order_id": "549302", "tenant_id": "acme",`}</div>
          <div style={{ opacity: 0.85, paddingLeft: 14 }}>{`"created_at": "2026-05-14T12:34Z" }`}</div>
          <div className="stamp" style={{ position: 'absolute', top: -14, right: -14, fontSize: 14 }}>live terminal</div>
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', top: 90, right: 40, fontSize: 16 }}>B · split, code-forward</div>
    </div>
  );
}

function HeroC() {
  // Dashboard-style: hero IS the live metrics, headline above
  return (
    <div className="wf">
      <Nav />
      <div className="col" style={{ padding: '40px 60px', gap: 26, height: 'calc(100% - 60px)' }}>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div className="col gap-8">
            <span className="pill teal" style={{ alignSelf: 'flex-start' }}><span className="dot pulse" /> cluster · healthy</span>
            <h1 style={{ fontSize: 44, lineHeight: 1.1 }}>CloudOps Order API <span className="soft" style={{ fontSize: 22 }}>/ live</span></h1>
            <div className="label" style={{ fontSize: 18, color: 'var(--ink-soft)' }}>Multi-tenant SaaS backend, running right now on EKS.</div>
          </div>
          <div className="row gap-12">
            <span className="btn primary">Docs →</span>
            <span className="btn">GitHub ↗</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, flex: 1 }}>
          {[
            { l: 'p95 latency', v: '127ms', sub: 'target <200ms' },
            { l: 'requests / sec', v: '1.2k', sub: '15min avg' },
            { l: 'error rate', v: '0.02%', sub: 'target <0.1%' },
            { l: 'active tenants', v: '38', sub: 'last 1h' },
          ].map((m, i) => (
            <div key={i} className="box" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
              <div className="label" style={{ fontSize: 15, color: 'var(--ink-soft)' }}>{m.l}</div>
              <div style={{ fontSize: 38, lineHeight: 1, fontFamily: 'var(--mono)' }} className="teal">{m.v}</div>
              <div className="ph" style={{ height: 56, marginTop: 6, fontSize: 12 }}>chart placeholder</div>
              <div className="label" style={{ fontSize: 13, color: 'var(--ink-faint)' }}>{m.sub}</div>
            </div>
          ))}
        </div>
        <div className="row between" style={{ fontFamily: 'var(--label)', fontSize: 16, color: 'var(--ink-soft)' }}>
          <span>Scroll for architecture story ↓</span>
          <span className="mono" style={{ fontSize: 12 }}>last updated 2s ago · prometheus</span>
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', top: 90, right: 40, fontSize: 16 }}>C · dashboard-as-hero</div>
    </div>
  );
}

// ─── ARCH VIZ ───────────────────────────────────────────────────────────

function ArchA() {
  // Horizontal scroll story (as specced)
  return (
    <div className="wf">
      <div className="row between" style={{ padding: '20px 40px', borderBottom: '1.5px solid var(--line)' }}>
        <div className="label" style={{ fontSize: 18 }}>§ architecture · scroll →</div>
        <div className="row gap-8">
          <span className="dot" style={{ background: 'var(--teal)' }} />
          <span style={{ width: 28, height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.15)' }} />
          <span style={{ width: 28, height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.15)' }} />
        </div>
      </div>
      <div style={{ display: 'flex', height: 'calc(100% - 60px)', position: 'relative', overflow: 'hidden' }}>
        {/* panel 1 full, panels 2/3 peeking */}
        <div style={{ flex: '0 0 75%', padding: 40, borderRight: '1.5px dashed var(--dash)' }}>
          <div className="row between" style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 36 }}><span className="teal">01</span> — Ingress to Database</h2>
            <span className="label" style={{ fontSize: 16, color: 'var(--ink-soft)' }}>panel 1 / 3</span>
          </div>
          <div className="label" style={{ fontSize: 17, color: 'var(--ink-soft)', maxWidth: 560, marginBottom: 24 }}>
            ALB → WAF → EKS pod → Cognito JWT → Postgres RLS → Aurora. Sub-50ms p95 on the hot path.
          </div>
          {/* diagram row */}
          <div className="row gap-12" style={{ alignItems: 'center', marginBottom: 30 }}>
            {['ALB', 'WAF', 'EKS Pod', 'Cognito', 'RLS', 'Aurora'].map((n, i) => (
              <React.Fragment key={n}>
                <div className="box" style={{ padding: '14px 14px', minWidth: 86, textAlign: 'center', fontFamily: 'var(--label)', fontSize: 17, background: i === 2 ? 'var(--teal-soft)' : undefined, borderColor: i === 2 ? 'var(--teal-line)' : undefined }}>{n}</div>
                {i < 5 && <span style={{ color: 'var(--ink-soft)' }}>→</span>}
              </React.Fragment>
            ))}
          </div>
          {/* code snippet */}
          <div className="box" style={{ padding: 12, fontFamily: 'var(--mono)', fontSize: 13, background: '#181c20', color: '#dde4ea', borderColor: '#181c20', maxWidth: 580 }}>
            <div style={{ color: '#7eecd9' }}>POST /order  →  201 Created</div>
            <div style={{ opacity: 0.7 }}>x-trace-id: 8a3f...  · 47ms</div>
            <div style={{ opacity: 0.85 }}>{`{ "order_id": "549302", "tenant_id": "acme" }`}</div>
          </div>
        </div>
        <div style={{ flex: '0 0 22%', padding: 40, opacity: 0.45 }}>
          <h2 style={{ fontSize: 30 }}><span className="teal">02</span></h2>
          <div className="label">Event Fanout</div>
          <div className="ph" style={{ height: 180, marginTop: 14 }}>kinesis flow</div>
        </div>
        <div className="stamp" style={{ position: 'absolute', bottom: 28, right: 40, fontSize: 14 }}>A · horizontal scroll story</div>
      </div>
    </div>
  );
}

function ArchB() {
  // Vertical with sticky diagram on left, scrolling copy right
  return (
    <div className="wf">
      <div className="row" style={{ height: '100%' }}>
        <div className="col center" style={{ flex: '0 0 50%', padding: 36, borderRight: '1.5px solid var(--line)', position: 'relative' }}>
          <div className="stamp" style={{ position: 'absolute', top: 24, left: 24, fontSize: 14 }}>sticky diagram</div>
          {/* layered system diagram */}
          <svg viewBox="0 0 400 480" style={{ width: '90%', maxWidth: 460 }}>
            <g fontFamily="Caveat, cursive" fontSize="16" fill="#20201d">
              {/* boxes */}
              <rect x="20" y="10" width="360" height="56" rx="8" fill="none" stroke="#20201d" strokeWidth="1.5"/>
              <text x="40" y="42">browser / fetch</text>
              <rect x="20" y="90" width="360" height="56" rx="8" fill="none" stroke="#20201d" strokeWidth="1.5"/>
              <text x="40" y="122">ALB + WAF (AWS managed)</text>
              <rect x="20" y="170" width="360" height="74" rx="8" fill="rgba(45,212,191,0.16)" stroke="#1c8e7e" strokeWidth="1.5"/>
              <text x="40" y="200">EKS · order-api pods (HPA)</text>
              <text x="40" y="222" fill="#5b5a55" fontSize="13">Node22 + Express · pino · OTel</text>
              <rect x="20" y="270" width="170" height="60" rx="8" fill="none" stroke="#20201d" strokeWidth="1.5"/>
              <text x="40" y="300">Aurora (RLS)</text>
              <rect x="210" y="270" width="170" height="60" rx="8" fill="none" stroke="#20201d" strokeWidth="1.5"/>
              <text x="230" y="300">Kinesis stream</text>
              <rect x="20" y="354" width="360" height="60" rx="8" fill="none" stroke="#20201d" strokeWidth="1.5" strokeDasharray="5 4"/>
              <text x="40" y="384">OTel · Prom · Loki · Tempo</text>
              {/* arrows */}
              <g stroke="#20201d" fill="none" strokeWidth="1.5">
                <path d="M200 66 L200 88"/><path d="M195 84 l5 8 l5 -8"/>
                <path d="M200 146 L200 168"/><path d="M195 164 l5 8 l5 -8"/>
                <path d="M120 244 L120 268"/><path d="M115 264 l5 8 l5 -8"/>
                <path d="M280 244 L280 268"/><path d="M275 264 l5 8 l5 -8"/>
              </g>
            </g>
          </svg>
        </div>
        <div className="col" style={{ flex: 1, padding: 40, gap: 28, overflow: 'hidden' }}>
          <div className="label" style={{ fontSize: 16, color: 'var(--ink-soft)' }}>§ architecture · scroll ↓</div>
          {[
            { n: '01', t: 'Ingress to Database', body: 'ALB → WAF → pod → Cognito JWT → Postgres RLS → Aurora. Sub-50ms p95.' },
            { n: '02', t: 'Event-Driven Fanout', body: 'Post-commit Kinesis publish. Lambda consumer → WebSocket. Zero polling.' },
            { n: '03', t: 'Full-Stack Telemetry', body: 'OTel spans Next.js → API GW → Lambda → Express → RDS. Grafana SLO alerts.' },
          ].map((p, i) => (
            <div key={p.n} className="box" style={{ padding: 18, opacity: i === 0 ? 1 : 0.55 }}>
              <div className="row between" style={{ alignItems: 'baseline' }}>
                <h3 style={{ fontSize: 24 }}><span className="teal">{p.n}</span> · {p.t}</h3>
                {i === 0 && <span className="note" style={{ fontSize: 14 }}>← in view</span>}
              </div>
              <div className="label" style={{ marginTop: 8, color: 'var(--ink-soft)', fontSize: 17 }}>{p.body}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', bottom: 28, right: 40, fontSize: 14 }}>B · sticky diagram · scroll-revealed copy</div>
    </div>
  );
}

function ArchC() {
  // Interactive node graph — clickable / hoverable
  return (
    <div className="wf">
      <div className="row between" style={{ padding: '20px 40px', borderBottom: '1.5px solid var(--line)' }}>
        <div className="label" style={{ fontSize: 18 }}>§ architecture · click any node</div>
        <div className="row gap-8">
          <span className="pill">tenant: acme</span>
          <span className="pill">env: prod</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 'calc(100% - 60px)', padding: 30 }}>
        <svg viewBox="0 0 900 560" style={{ width: '100%', height: '100%' }}>
          <g fontFamily="Caveat, cursive" fontSize="17" fill="#20201d">
            {/* nodes */}
            {[
              { x: 60,  y: 40,  w: 130, h: 50, t: 'Browser' },
              { x: 60,  y: 160, w: 130, h: 50, t: 'CloudFront' },
              { x: 60,  y: 280, w: 130, h: 50, t: 'ALB + WAF' },
              { x: 280, y: 100, w: 150, h: 60, t: 'API Gateway WS', hl: true },
              { x: 280, y: 220, w: 150, h: 60, t: 'EKS · order-api', hl: true },
              { x: 280, y: 340, w: 150, h: 60, t: 'Lambda fanout' },
              { x: 510, y: 80,  w: 140, h: 50, t: 'Cognito' },
              { x: 510, y: 180, w: 140, h: 50, t: 'Aurora RLS' },
              { x: 510, y: 280, w: 140, h: 50, t: 'Kinesis' },
              { x: 510, y: 380, w: 140, h: 50, t: 'DynamoDB' },
              { x: 720, y: 160, w: 140, h: 50, t: 'Prom · Tempo' },
              { x: 720, y: 280, w: 140, h: 50, t: 'Step Functions' },
            ].map((n, i) => (
              <g key={i}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="8"
                  fill={n.hl ? 'rgba(45,212,191,0.18)' : 'rgba(255,255,255,0.6)'}
                  stroke={n.hl ? '#1c8e7e' : '#20201d'} strokeWidth="1.5" />
                <text x={n.x + 12} y={n.y + n.h / 2 + 6}>{n.t}</text>
              </g>
            ))}
            {/* edges (mostly straight) */}
            <g stroke="#20201d" strokeWidth="1.5" fill="none">
              <path d="M125 90 L125 160"/>
              <path d="M125 210 L125 280"/>
              <path d="M190 305 L280 250"/>
              <path d="M190 305 L280 130"/>
              <path d="M430 250 L510 205"/>
              <path d="M430 250 L510 305"/>
              <path d="M430 250 L510 105"/>
              <path d="M430 370 L510 405"/>
              <path d="M650 205 L720 185"/>
              <path d="M650 305 L720 305"/>
              <path d="M430 130 L510 105"/>
            </g>
            {/* selection callout */}
            <g>
              <rect x="280" y="430" width="320" height="110" rx="10" fill="white" stroke="#1c8e7e" strokeWidth="1.5"/>
              <text x="296" y="456" fontSize="16" fill="#1c8e7e">▸ EKS · order-api</text>
              <text x="296" y="478" fill="#5b5a55" fontSize="14">Node22 · Express · pino · OTel SDK</text>
              <text x="296" y="498" fill="#5b5a55" fontSize="14">HPA: 2–12 pods · p95 47ms</text>
              <text x="296" y="522" fill="#5b5a55" fontSize="14">→ Open in Grafana · Logs · Tempo</text>
            </g>
          </g>
        </svg>
        <div className="note" style={{ position: 'absolute', top: 40, right: 60, fontSize: 16 }}>hover = highlight path<br/>click = drawer</div>
      </div>
      <div className="stamp" style={{ position: 'absolute', bottom: 24, right: 40, fontSize: 14 }}>C · interactive node graph</div>
    </div>
  );
}

// ─── API EXPLORER ───────────────────────────────────────────────────────

function EndpointCard({ method, path, desc, open, color = 'var(--teal)' }) {
  return (
    <div className="box" style={{ padding: 12, marginBottom: 8 }}>
      <div className="row gap-12" style={{ alignItems: 'center' }}>
        <span className="pill" style={{ borderColor: color, color, fontFamily: 'var(--mono)', fontSize: 12, padding: '2px 8px' }}>{method}</span>
        <span className="mono" style={{ fontSize: 14 }}>{path}</span>
        <span className="label" style={{ color: 'var(--ink-soft)', fontSize: 14, marginLeft: 'auto' }}>{desc}</span>
        <span className="faint">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="col gap-8" style={{ marginTop: 12, paddingTop: 12, borderTop: '1.5px dashed var(--dash)' }}>
          <div className="row gap-8" style={{ fontFamily: 'var(--label)', fontSize: 14, color: 'var(--ink-soft)' }}>
            <span className="pill teal" style={{ fontSize: 12, padding: '1px 8px' }}>JWT</span>
            <span className="pill" style={{ fontSize: 12, padding: '1px 8px' }}>X-Api-Key</span>
            <span className="pill" style={{ fontSize: 12, padding: '1px 8px' }}>idempotent</span>
            <span className="pill" style={{ fontSize: 12, padding: '1px 8px' }}>60/min</span>
          </div>
          <div className="label" style={{ fontSize: 14 }}>Request schema ▾</div>
          <div className="ph" style={{ height: 70, fontSize: 12 }}>json schema</div>
          <div className="label" style={{ fontSize: 14 }}>Response · 201 · 400 · 401 · 409 · 429</div>
        </div>
      )}
    </div>
  );
}

function ApiA() {
  // Split pane: docs left, request builder right
  return (
    <div className="wf">
      <Nav />
      <div className="row" style={{ height: 'calc(100% - 60px)' }}>
        <div className="col" style={{ flex: '0 0 58%', padding: 24, gap: 12, borderRight: '1.5px solid var(--line)', overflow: 'hidden' }}>
          <div className="row between">
            <h2 style={{ fontSize: 30 }}>API Reference</h2>
            <span className="pill teal mono" style={{ fontSize: 12 }}>v1.0.0</span>
          </div>
          <EndpointCard method="POST" path="/order" desc="Create order" open color="var(--teal)" />
          <EndpointCard method="GET" path="/orders" desc="List, tenant-scoped" color="#3b82f6" />
          <EndpointCard method="GET" path="/products" desc="Full-text search" color="#3b82f6" />
          <EndpointCard method="GET" path="/products/:id" desc="Product detail" color="#3b82f6" />
          <div className="box-dashed" style={{ padding: 12, marginTop: 12, fontFamily: 'var(--label)', color: 'var(--ink-soft)' }}>
            ▸ Auth Guide · JWT (Cognito + PKCE) · API key fallback
          </div>
        </div>
        <div className="col" style={{ flex: 1, padding: 24, gap: 14, background: 'rgba(0,0,0,0.025)' }}>
          <div className="row between">
            <h3 style={{ fontSize: 22 }}>Try it</h3>
            <span className="label faint" style={{ fontSize: 14 }}>sticky →</span>
          </div>
          <div className="box" style={{ padding: 10 }}>
            <div className="label" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>endpoint</div>
            <div className="row gap-8" style={{ alignItems: 'center', marginTop: 4 }}>
              <span className="pill teal mono" style={{ fontSize: 12 }}>POST</span>
              <span className="mono">/order</span>
              <span className="faint" style={{ marginLeft: 'auto' }}>▾</span>
            </div>
          </div>
          <div className="box" style={{ padding: 10 }}>
            <div className="label" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>headers</div>
            <div className="mono" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.7 }}>
              Authorization: Bearer ●●●●●<br/>
              X-Tenant-Id: acme<br/>
              Idempotency-Key: 7f3...
            </div>
          </div>
          <div className="box" style={{ padding: 10, flex: 1 }}>
            <div className="label" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>body</div>
            <div className="mono" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.6, color: 'var(--ink)' }}>
              {`{`}<br/>
              &nbsp;&nbsp;"items": [<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;{`{ "sku": "widget-pro", "qty": 2 }`}<br/>
              &nbsp;&nbsp;],<br/>
              &nbsp;&nbsp;"total": 49.98<br/>
              {`}`}
            </div>
          </div>
          <div className="row gap-8">
            <span className="btn primary grow center">Send Request →</span>
            <span className="btn">⧉ copy cURL</span>
          </div>
          <div className="box" style={{ padding: 10 }}>
            <div className="row between" style={{ alignItems: 'center' }}>
              <span className="pill" style={{ borderColor: '#22c55e', color: '#16a34a', fontFamily: 'var(--mono)', fontSize: 12 }}>201</span>
              <span className="label" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>127ms · 8a3f...</span>
            </div>
            <div className="mono" style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
              {`{ "order_id": "549302", "tenant_id": "acme" }`}
            </div>
          </div>
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', bottom: 24, right: 40, fontSize: 14 }}>A · split-pane (as spec'd)</div>
    </div>
  );
}

function ApiB() {
  // Three-pane: list · docs · builder
  return (
    <div className="wf">
      <Nav />
      <div className="row" style={{ height: 'calc(100% - 60px)' }}>
        <div className="col" style={{ flex: '0 0 220px', padding: 18, gap: 6, borderRight: '1.5px solid var(--line)', background: 'rgba(0,0,0,0.03)' }}>
          <div className="label" style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 4 }}>endpoints</div>
          {[
            { m: 'POST', p: '/order', a: true },
            { m: 'GET', p: '/orders' },
            { m: 'GET', p: '/products' },
            { m: 'GET', p: '/products/:id' },
            { m: '—', p: 'auth guide' },
            { m: '—', p: 'rate limits' },
            { m: '—', p: 'errors' },
          ].map((e, i) => (
            <div key={i} className="row gap-8" style={{ padding: '6px 8px', borderRadius: 6, background: e.a ? 'var(--teal-soft)' : 'transparent', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: 11, color: e.m === '—' ? 'var(--ink-faint)' : 'var(--ink-soft)', minWidth: 36 }}>{e.m}</span>
              <span className="mono" style={{ fontSize: 13 }}>{e.p}</span>
            </div>
          ))}
        </div>
        <div className="col" style={{ flex: 1, padding: 24, gap: 14, borderRight: '1.5px solid var(--line)', overflow: 'hidden' }}>
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 26 }}><span className="teal mono" style={{ fontSize: 18 }}>POST</span> /order</h2>
            <span className="label faint">create an order</span>
          </div>
          <div className="row gap-8">
            <span className="pill teal" style={{ fontSize: 12 }}>JWT</span>
            <span className="pill" style={{ fontSize: 12 }}>idempotent</span>
            <span className="pill" style={{ fontSize: 12 }}>60/min</span>
          </div>
          <h3 style={{ fontSize: 18 }}>Request body</h3>
          <div className="ph" style={{ height: 110, fontSize: 12 }}>json schema · items[] · total · currency</div>
          <h3 style={{ fontSize: 18 }}>Responses</h3>
          <div className="col gap-6">
            {[['201','created'],['400','validation'],['401','unauth'],['409','idem conflict'],['429','rate limit']].map(([c, t]) => (
              <div key={c} className="row gap-12 box" style={{ padding: '6px 10px', alignItems: 'center' }}>
                <span className="mono" style={{ width: 40 }}>{c}</span><span className="label">{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="col" style={{ flex: '0 0 320px', padding: 18, gap: 10, background: '#181c20', color: '#dde4ea', fontFamily: 'var(--mono)', fontSize: 12 }}>
          <div className="row between" style={{ color: '#7eecd9' }}>
            <span>▸ try it</span>
            <span style={{ opacity: 0.5 }}>cURL · JS · Py · Go</span>
          </div>
          <div style={{ flex: 1, lineHeight: 1.7 }}>
            $ curl -X POST \<br/>
            &nbsp; https://api.cloudops.dev/order \<br/>
            &nbsp; -H "Authorization: Bearer ●●" \<br/>
            &nbsp; -H "Idempotency-Key: ●●" \<br/>
            &nbsp; -d '{`{...}`}'<br/><br/>
            <span style={{ color: '#7eecd9' }}>HTTP/1.1 201</span><br/>
            <span style={{ opacity: 0.85 }}>{`{ "order_id": "549302" }`}</span>
          </div>
          <div className="row gap-6">
            <span className="btn primary grow center" style={{ background: 'rgba(45,212,191,0.25)', borderColor: '#2dd4bf', color: '#7eecd9' }}>▶ run</span>
            <span className="btn" style={{ background: 'transparent', borderColor: '#3a4148', color: '#dde4ea' }}>⧉</span>
          </div>
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', bottom: 24, right: 40, fontSize: 14 }}>B · three-pane · IDE feel</div>
    </div>
  );
}

function ApiC() {
  // Terminal-first REPL
  return (
    <div className="wf" style={{ background: '#0d1117', color: '#dde4ea' }}>
      <div className="row between" style={{ padding: '14px 28px', borderBottom: '1.5px solid #2a313a', fontFamily: 'var(--label)', fontSize: 16 }}>
        <div className="row gap-8">
          <span className="dot" style={{ background: '#2dd4bf' }} />
          <span>cloudops·repl</span>
          <span style={{ opacity: 0.4, marginLeft: 8 }}>connected · tenant=acme · jwt=●●</span>
        </div>
        <div className="row gap-12" style={{ opacity: 0.7 }}>
          <span>?help</span><span>?endpoints</span><span>?docs</span>
        </div>
      </div>
      <div className="col" style={{ padding: 28, gap: 12, fontFamily: 'var(--mono)', fontSize: 14, lineHeight: 1.7, height: 'calc(100% - 60px)' }}>
        <div style={{ color: '#7eecd9' }}>▸ welcome to the order-api REPL. type a command, or ?help.</div>
        <div><span style={{ color: '#7eecd9' }}>›</span> POST /order items=[widget-pro:2]</div>
        <div style={{ paddingLeft: 14, opacity: 0.7 }}>...resolving · authenticating · idempotency-key auto · 47ms</div>
        <div style={{ paddingLeft: 14, color: '#7eecd9' }}>← 201 Created</div>
        <div style={{ paddingLeft: 14, opacity: 0.85 }}>{`{ order_id: "549302", tenant_id: "acme" }`}</div>
        <div style={{ marginTop: 8 }}><span style={{ color: '#7eecd9' }}>›</span> GET /orders limit=3</div>
        <div style={{ paddingLeft: 14, opacity: 0.7 }}>...12ms</div>
        <div style={{ paddingLeft: 14, opacity: 0.85 }}>{`[ {id:549302...}, {id:549301...}, {id:549300...} ]`}</div>
        <div style={{ marginTop: 16 }}>
          <span style={{ color: '#7eecd9' }}>›</span> <span style={{ borderBottom: '1.5px solid #2dd4bf', paddingBottom: 1 }}>POST /order &nbsp;</span><span style={{ animation: 'none', opacity: 0.6 }}>▍</span>
        </div>
        <div className="row gap-8" style={{ marginTop: 'auto', fontFamily: 'var(--label)', fontSize: 14, opacity: 0.7 }}>
          <span style={{ border: '1.5px solid #2a313a', borderRadius: 6, padding: '4px 10px' }}>↑↓ history</span>
          <span style={{ border: '1.5px solid #2a313a', borderRadius: 6, padding: '4px 10px' }}>⇥ complete</span>
          <span style={{ border: '1.5px solid #2a313a', borderRadius: 6, padding: '4px 10px' }}>⌘K endpoints</span>
          <span style={{ border: '1.5px solid #2a313a', borderRadius: 6, padding: '4px 10px' }}>⌘⏎ run</span>
          <span style={{ marginLeft: 'auto', color: '#2dd4bf' }}>side panel: docs · curl · share</span>
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', bottom: 24, right: 28, fontSize: 14, background: '#0d1117' }}>C · terminal REPL (bold)</div>
    </div>
  );
}

// ─── FEATURES GRID ──────────────────────────────────────────────────────

const FEATURES = [
  { i: '⛨', t: 'Multi-Tenant Isolation', b: 'Postgres RLS w/ FORCE mode. Owner can\'t bypass tenant boundaries.' },
  { i: '↻', t: 'Idempotency Keys', b: 'Same key+payload = 201 replay. Diff payload = 409. 24h window.' },
  { i: '◔', t: 'Two-Tier Rate Limit', b: 'IP pre-auth + tenant post-auth. Noisy tenant ≠ everyone\'s problem.' },
  { i: '☷', t: 'Structured Audit Log', b: 'Every state change → audit_events. RLS-enforced, survives rollback.' },
  { i: '⤳', t: 'Event Sourcing', b: 'Post-commit Kinesis publish. Durable, replayable, tenant-partitioned.' },
  { i: '∿', t: 'Full Observability', b: 'OTel traces · Prom :9090 · Loki · Tempo. Every request traceable.' },
];

function FeaturesA() {
  // 3x2 grid, simple cards
  return (
    <div className="wf">
      <div className="col" style={{ padding: 40, gap: 18, height: '100%' }}>
        <h2 style={{ fontSize: 30 }}>What makes it production-grade <span className="soft" style={{ fontSize: 18 }}>· 6 things</span></h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flex: 1 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="box" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, border: '1.5px solid var(--teal-line)', background: 'var(--teal-soft)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{f.i}</div>
              <h3 style={{ fontSize: 19 }}>{f.t}</h3>
              <div className="label" style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{f.b}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', top: 24, right: 24, fontSize: 14 }}>A · classic 3×2</div>
    </div>
  );
}

function FeaturesB() {
  // Bento — varied sizes, one hero feature
  return (
    <div className="wf">
      <div className="col" style={{ padding: 40, gap: 18, height: '100%' }}>
        <h2 style={{ fontSize: 30 }}>Production-grade, by design</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 14, flex: 1 }}>
          <div className="box" style={{ gridColumn: 'span 2', gridRow: 'span 2', padding: 22, background: 'var(--teal-soft)', borderColor: 'var(--teal-line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row between"><div className="label teal" style={{ fontSize: 14 }}>flagship</div><div style={{ fontSize: 22 }} className="teal">⛨</div></div>
            <h3 style={{ fontSize: 28 }}>Multi-tenant isolation, enforced at the row.</h3>
            <div className="label" style={{ color: 'var(--ink-soft)', fontSize: 16 }}>Postgres RLS with FORCE. JWT-bound tenant context. Even the table owner can't bypass the boundary.</div>
            <div className="ph" style={{ flex: 1, marginTop: 6 }}>RLS policy snippet</div>
          </div>
          {FEATURES.slice(1).map((f, i) => (
            <div key={i} className="box" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 20, color: 'var(--teal)' }}>{f.i}</div>
              <h3 style={{ fontSize: 17 }}>{f.t}</h3>
              <div className="label" style={{ color: 'var(--ink-soft)', fontSize: 14 }}>{f.b}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', top: 24, right: 24, fontSize: 14 }}>B · bento w/ flagship</div>
    </div>
  );
}

function FeaturesC() {
  // Vertical numbered list — editorial feel
  return (
    <div className="wf">
      <div className="col" style={{ padding: '40px 60px', gap: 18, height: '100%' }}>
        <div className="row between">
          <h2 style={{ fontSize: 30 }}>Six things we got right</h2>
          <span className="label soft">scroll ↓</span>
        </div>
        <div className="col gap-12" style={{ flex: 1 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="row gap-20" style={{ padding: '12px 0', borderBottom: '1.5px dashed var(--dash)', alignItems: 'flex-start' }}>
              <div className="mono teal" style={{ fontSize: 22, width: 60 }}>0{i + 1}</div>
              <div className="col gap-4" style={{ flex: 1 }}>
                <h3 style={{ fontSize: 22 }}>{f.t}</h3>
                <div className="label" style={{ color: 'var(--ink-soft)', fontSize: 16, maxWidth: 760 }}>{f.b}</div>
              </div>
              <div style={{ fontSize: 26, color: 'var(--teal)' }}>{f.i}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', top: 24, right: 24, fontSize: 14 }}>C · editorial numbered list</div>
    </div>
  );
}

// ─── SECURITY ───────────────────────────────────────────────────────────

const SEC_BADGES = [
  'Pod Security · restricted',
  'NetworkPolicy · default-deny',
  'OPA Gatekeeper · 7 policies',
  'WAF · 5 managed rule groups',
  'Secrets rotation · ESO',
  'TLS everywhere',
  'Audit log · CloudTrail + app',
  'IRSA · least privilege',
  'Cosign image signing',
];

function SecurityA() {
  return (
    <div className="wf">
      <div className="col" style={{ padding: 40, gap: 18, height: '100%' }}>
        <div className="row gap-16" style={{ alignItems: 'baseline' }}>
          <div className="teal" style={{ fontSize: 32 }}>⛨</div>
          <h2 style={{ fontSize: 30 }}>Enterprise security guardrails</h2>
          <span className="stamp" style={{ marginLeft: 'auto', fontSize: 16 }}>review: 90/100 · STRONG</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, flex: 1 }}>
          {SEC_BADGES.map((b, i) => (
            <div key={i} className="row gap-12 box" style={{ padding: 14, alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--teal-soft)', border: '1.5px solid var(--teal-line)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✓</div>
              <div className="label" style={{ fontSize: 16, color: 'var(--ink)' }}>{b}</div>
            </div>
          ))}
        </div>
        <div className="label soft" style={{ fontSize: 14 }}>→ link to detailed findings (BACKLOG.md backlog)</div>
      </div>
      <div className="stamp" style={{ position: 'absolute', top: 24, right: 24, fontSize: 14 }}>A · 3×3 badge grid</div>
    </div>
  );
}

function SecurityB() {
  // Score-led + layered defense diagram
  return (
    <div className="wf">
      <div className="row" style={{ padding: 40, gap: 30, height: '100%' }}>
        <div className="col gap-16" style={{ flex: '0 0 38%' }}>
          <div className="teal label" style={{ fontSize: 16 }}>security posture</div>
          <h2 style={{ fontSize: 36, lineHeight: 1.1 }}>9 layers between<br/>your data and the internet.</h2>
          <div className="box" style={{ padding: 18, background: 'var(--teal-soft)', borderColor: 'var(--teal-line)' }}>
            <div className="label" style={{ color: 'var(--ink-soft)', fontSize: 14 }}>internal review</div>
            <div className="mono teal" style={{ fontSize: 48, lineHeight: 1 }}>90<span style={{ fontSize: 24, opacity: 0.6 }}>/100</span></div>
            <div className="label" style={{ marginTop: 4 }}>STRONG · see findings →</div>
          </div>
          <div className="label soft" style={{ fontSize: 16, maxWidth: 360 }}>From WAF at the edge to IRSA at the workload — every layer is opt-out, not opt-in.</div>
        </div>
        <div className="col gap-8" style={{ flex: 1 }}>
          {SEC_BADGES.map((b, i) => (
            <div key={i} className="row gap-12" style={{ padding: '10px 14px', borderLeft: '3px solid var(--teal)', alignItems: 'center', background: 'rgba(255,255,255,0.5)' }}>
              <span className="mono teal" style={{ fontSize: 13, width: 28 }}>L{i+1}</span>
              <span className="label" style={{ fontSize: 17 }}>{b}</span>
              <span className="faint" style={{ marginLeft: 'auto', fontSize: 14 }}>✓ enforced</span>
            </div>
          ))}
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', top: 24, right: 24, fontSize: 14 }}>B · score-led, layered</div>
    </div>
  );
}

// ─── FOOTER ─────────────────────────────────────────────────────────────

function FooterA() {
  return (
    <div className="wf" style={{ background: '#181c20', color: '#dde4ea' }}>
      <div className="col" style={{ padding: '40px 60px', gap: 24, height: '100%' }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="col gap-8" style={{ flex: 1 }}>
            <div className="row gap-8" style={{ alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(45,212,191,0.2)', border: '1.5px solid #2dd4bf', color: '#2dd4bf', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▲</div>
              <span style={{ fontSize: 22 }}>CloudOps</span>
            </div>
            <div className="label" style={{ color: '#9ba6b0', maxWidth: 320, fontSize: 15 }}>Portfolio project. Production-grade SaaS patterns on AWS + Kubernetes.</div>
            <div className="row gap-8" style={{ marginTop: 8 }}>
              <span style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #2a313a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>gh</span>
              <span style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #2a313a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>li</span>
            </div>
          </div>
          {[
            ['Product', ['API Docs', 'Architecture', 'Security', 'Performance']],
            ['Resources', ['GitHub', 'Backlog', 'ADRs', 'Runbooks']],
            ['Community', ['Discussions', 'Issues', 'Contributing', 'Code of Conduct']],
            ['Legal', ['Privacy', 'Terms', 'MIT License']],
          ].map(([h, items]) => (
            <div key={h} className="col gap-6" style={{ flex: 1 }}>
              <div className="label" style={{ color: '#9ba6b0', fontSize: 14 }}>{h}</div>
              {items.map(i => <div key={i} style={{ fontSize: 16 }}>{i}</div>)}
            </div>
          ))}
        </div>
        <div className="row between" style={{ paddingTop: 18, borderTop: '1.5px solid #2a313a', fontFamily: 'var(--label)', fontSize: 14, color: '#9ba6b0' }}>
          <span>© 2026 CloudOps Platform · Built with Next.js 15 + EKS</span>
          <div className="row gap-12">
            <span className="pill" style={{ borderColor: '#2a313a', color: '#9ba6b0', fontSize: 12 }}>AWS</span>
            <span className="pill" style={{ borderColor: '#2a313a', color: '#9ba6b0', fontSize: 12 }}>k8s</span>
            <span className="pill" style={{ borderColor: '#2a313a', color: '#9ba6b0', fontSize: 12 }}>TypeScript</span>
            <span className="pill" style={{ borderColor: '#2a313a', color: '#9ba6b0', fontSize: 12 }}>Postgres</span>
          </div>
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', top: 24, right: 24, fontSize: 14, background: '#181c20' }}>A · 4 columns + tech badges</div>
    </div>
  );
}

function FooterB() {
  // Big mono "sitemap" footer — single column big type
  return (
    <div className="wf">
      <div className="col" style={{ padding: 50, gap: 22, height: '100%' }}>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <h2 style={{ fontSize: 48, lineHeight: 1 }}>cloudops/<br/><span className="teal">order-api</span></h2>
          <div className="col gap-4" style={{ alignItems: 'flex-end' }}>
            <span className="label soft" style={{ fontSize: 14 }}>last deploy</span>
            <span className="mono">a4f2c91 · 2h ago</span>
            <span className="pill teal" style={{ fontSize: 12, marginTop: 6 }}>● deployed</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, flex: 1 }}>
          {[
            ['→ docs',          ['api reference','architecture','security','performance']],
            ['→ source',        ['github repo','ADRs','runbooks','Backlog']],
            ['→ community',     ['discussions','issues','contributing','CoC']],
            ['→ legal',         ['privacy','terms','MIT license']],
          ].map(([h, items]) => (
            <div key={h} className="col gap-6">
              <div className="mono teal" style={{ fontSize: 16 }}>{h}</div>
              {items.map(i => <div key={i} className="label" style={{ fontSize: 16 }}>{i}</div>)}
            </div>
          ))}
        </div>
        <div className="row between" style={{ borderTop: '1.5px dashed var(--dash)', paddingTop: 16, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-soft)' }}>
          <span>© 2026 cloudops · MIT</span>
          <span>built with next.js 15 + EKS · run on aurora · observed by grafana</span>
        </div>
      </div>
      <div className="stamp" style={{ position: 'absolute', top: 24, right: 24, fontSize: 14 }}>B · mono sitemap, big type</div>
    </div>
  );
}

// ─── APP ────────────────────────────────────────────────────────────────

function App() {
  // Sizing notes:
  //  - "Full-page" artboards: 1280 × 800 (desktop hero feel, fits 2-up)
  //  - "Component" artboards (security, footer): 1280 × 600
  const W = 1280, H = 800, HC = 600;
  return (
    <DesignCanvas>
      <DCPostIt top={20} left={20} width={240}>
        CloudOps Order API — Wireframes
        <br/><br/>
        Sketchy / low-fi. 2–3 directions per section. Hints of teal where the brand will land.
        <br/><br/>
        Sections: Hero · Architecture · API Explorer · Features · Security · Footer
      </DCPostIt>

      <DCSection id="hero" title="Hero" subtitle="Three directions for the front door — pick a posture: marketing, technical, or operational.">
        <DCArtboard id="hero-a" label="A · Centered + live pills" width={W} height={H}><HeroA /></DCArtboard>
        <DCArtboard id="hero-b" label="B · Split · code-forward" width={W} height={H}><HeroB /></DCArtboard>
        <DCArtboard id="hero-c" label="C · Dashboard-as-hero" width={W} height={H}><HeroC /></DCArtboard>
      </DCSection>

      <DCSection id="arch" title="Architecture story" subtitle="How we explain ALB → DB → Kinesis without losing recruiters at panel 1.">
        <DCArtboard id="arch-a" label="A · Horizontal scroll panels" width={W} height={H}><ArchA /></DCArtboard>
        <DCArtboard id="arch-b" label="B · Sticky diagram · scrolled copy" width={W} height={H}><ArchB /></DCArtboard>
        <DCArtboard id="arch-c" label="C · Interactive node graph" width={W} height={H}><ArchC /></DCArtboard>
      </DCSection>

      <DCSection id="api" title="API explorer" subtitle="Where developers actually do something. Spec → reference → run-it-now.">
        <DCArtboard id="api-a" label="A · Split-pane (spec)" width={W} height={H}><ApiA /></DCArtboard>
        <DCArtboard id="api-b" label="B · Three-pane · IDE" width={W} height={H}><ApiB /></DCArtboard>
        <DCArtboard id="api-c" label="C · Terminal REPL (bold)" width={W} height={H}><ApiC /></DCArtboard>
      </DCSection>

      <DCSection id="features" title="Features grid" subtitle="The 6 things that make this 'production-grade'.">
        <DCArtboard id="feat-a" label="A · Classic 3×2" width={W} height={HC}><FeaturesA /></DCArtboard>
        <DCArtboard id="feat-b" label="B · Bento + flagship" width={W} height={HC}><FeaturesB /></DCArtboard>
        <DCArtboard id="feat-c" label="C · Editorial numbered list" width={W} height={HC}><FeaturesC /></DCArtboard>
      </DCSection>

      <DCSection id="security" title="Security posture" subtitle="Earning trust — badges vs. layered defense.">
        <DCArtboard id="sec-a" label="A · 3×3 badge grid" width={W} height={HC}><SecurityA /></DCArtboard>
        <DCArtboard id="sec-b" label="B · Score-led · layered" width={W} height={HC}><SecurityB /></DCArtboard>
      </DCSection>

      <DCSection id="footer" title="Footer" subtitle="The last thing they see.">
        <DCArtboard id="foot-a" label="A · 4 columns + tech badges (dark)" width={W} height={400}><FooterA /></DCArtboard>
        <DCArtboard id="foot-b" label="B · Mono sitemap, big type" width={W} height={400}><FooterB /></DCArtboard>
      </DCSection>

      <DCPostIt bottom={20} left={20} width={240} rotate={2}>
        Next steps →
        <br/><br/>
        1. Pick a hero direction.
        2. Pick arch viz.
        3. Decide API explorer ambition.
        4. Move chosen direction to hi-fi (CloudOps Dim).
      </DCPostIt>
    </DesignCanvas>
  );
}
