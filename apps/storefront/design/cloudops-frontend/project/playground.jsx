// playground.jsx — Split-screen interactive API playground

const ENDPOINTS = [
  {
    id: 'create',
    method: 'POST',
    path: '/order',
    desc: 'Create order',
    headers: [
      ['Authorization', 'Bearer eyJraWQ…●●●●●'],
      ['X-Tenant-Id', 'acme'],
      ['Idempotency-Key', '7f3a8e91-…'],
      ['Content-Type', 'application/json'],
    ],
    body: `{
  "items": [
    { "sku": "widget-pro", "qty": 2 },
    { "sku": "gizmo-mini", "qty": 1 }
  ],
  "total": 49.98,
  "currency": "USD"
}`,
    response: {
      status: 201,
      ms: 127,
      trace: '8a3f1d…',
      body: `{
  "order_id": "549302",
  "tenant_id": "acme",
  "status": "confirmed",
  "items": [
    { "sku": "widget-pro", "qty": 2, "price": 24.99 },
    { "sku": "gizmo-mini", "qty": 1, "price": 9.99 }
  ],
  "subtotal": 49.98,
  "total": 49.98,
  "created_at": "2026-05-14T18:42:11Z"
}`,
    },
  },
  {
    id: 'list',
    method: 'GET',
    path: '/orders',
    desc: 'List orders, tenant-scoped',
    headers: [
      ['Authorization', 'Bearer eyJraWQ…●●●●●'],
      ['X-Tenant-Id', 'acme'],
    ],
    body: `// no body — GET request
// query: ?limit=10&cursor=549299`,
    response: {
      status: 200,
      ms: 38,
      trace: '8b2e0d…',
      body: `{
  "orders": [
    { "id": "549302", "total": 49.98, "status": "confirmed" },
    { "id": "549301", "total": 12.50, "status": "shipped" },
    { "id": "549300", "total": 8.99,  "status": "shipped" }
  ],
  "next_cursor": "549299"
}`,
    },
  },
  {
    id: 'products',
    method: 'GET',
    path: '/products',
    desc: 'Full-text product search',
    headers: [
      ['Authorization', 'Bearer eyJraWQ…●●●●●'],
      ['X-Tenant-Id', 'acme'],
    ],
    body: `// query: ?q=widget&limit=5`,
    response: {
      status: 200,
      ms: 22,
      trace: '8c4a2f…',
      body: `{
  "results": [
    { "sku": "widget-pro",   "name": "Widget Pro",   "price": 24.99 },
    { "sku": "widget-mini",  "name": "Widget Mini",  "price": 12.99 },
    { "sku": "widget-bulk",  "name": "Widget Bulk",  "price": 89.99 }
  ],
  "took_ms": 18
}`,
    },
  },
  {
    id: 'search',
    method: 'POST',
    path: '/_internal/search',
    desc: 'HMAC-signed internal search',
    headers: [
      ['X-Api-Key', '●●●●●●●●●●'],
      ['X-Signature', 'sha256=●●●●●'],
      ['X-Tenant-Id', 'acme'],
    ],
    body: `{
  "index": "orders",
  "query": "status:shipped",
  "size": 10
}`,
    response: {
      status: 401,
      ms: 5,
      trace: '8d1b5e…',
      body: `{
  "error": "invalid_signature",
  "code": "AUTH_HMAC_MISMATCH",
  "message": "Computed HMAC does not match X-Signature header.",
  "doc": "https://cloudops.dev/docs/internal/hmac"
}`,
    },
  },
];

function tokenize(json) {
  // Basic JSON syntax highlight — wraps in <span> tokens
  return json
    .replace(/(\/\/[^\n]*)/g, '<span class="tok-com">$1</span>')
    .replace(/"([^"]+)"(?=\s*:)/g, '<span class="tok-key">"$1"</span>')
    .replace(/:\s*"([^"]*)"/g, ': <span class="tok-str">"$1"</span>')
    .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="tok-num">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="tok-num">$1</span>');
}

function statusInfo(s) {
  if (s >= 200 && s < 300) return { c: '#22c55e', l: 'OK' };
  if (s >= 400 && s < 500) return { c: '#ef4444', l: 'Client Error' };
  if (s >= 500) return { c: '#ef4444', l: 'Server Error' };
  return { c: '#fbbf24', l: '' };
}

function Playground() {
  const [activeId, setActiveId] = React.useState('create');
  const [sending, setSending] = React.useState(false);
  const [hasResponse, setHasResponse] = React.useState(true);
  const [respTab, setRespTab] = React.useState('body');
  const ep = ENDPOINTS.find((e) => e.id === activeId);
  function send() {
    setSending(true);
    setHasResponse(false);
    setTimeout(() => { setSending(false); setHasResponse(true); }, 700 + Math.random() * 500);
  }
  // when endpoint changes, briefly mark "stale"
  React.useEffect(() => { setHasResponse(true); }, [activeId]);
  const si = statusInfo(ep.response.status);

  return (
    <section id="playground" style={{ position: 'relative' }}>
      <Bioluminescence count={8} />
      <div className="container">
        <SectionHead
          eyebrow="Try It Live"
          title="The API, in your browser"
          lede="Hits the demo tenant against a real EKS cluster. Responses are actual DB data — seeded but live."
        />
        <div className="reveal glass" style={{
          padding: 0, overflow: 'hidden',
          display: 'grid', gridTemplateColumns: '1.05fr 1fr',
        }} id="playground-grid">

          {/* LEFT — request builder */}
          <div style={{ borderRight: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', overflowX: 'auto' }}>
              {ENDPOINTS.map((e) => (
                <button key={e.id} className="api-tab"
                  data-hover
                  onClick={() => setActiveId(e.id)}
                  style={{
                    flex: '1 0 auto',
                    padding: '14px 18px',
                    background: e.id === activeId ? 'rgba(45,212,191,0.07)' : 'transparent',
                    border: 'none',
                    borderBottom: `2px solid ${e.id === activeId ? 'var(--teal)' : 'transparent'}`,
                    color: e.id === activeId ? 'var(--fg)' : 'var(--fg-muted)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 12.5,
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'background 0.2s, color 0.2s',
                    whiteSpace: 'nowrap',
                  }}>
                  <span style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                    background: 'rgba(45,212,191,0.15)', color: 'var(--teal-soft)',
                  }}>{e.method}</span>
                  <span>{e.path}</span>
                </button>
              ))}
            </div>

            {/* Endpoint desc */}
            <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="muted" style={{ fontSize: 13 }}>{ep.desc}</div>
              <div className="row gap-8">
                <span className="pill teal-pill">JWT</span>
                <span className="pill">60/min</span>
                <span className="pill">idempotent</span>
              </div>
            </div>

            {/* Headers */}
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-default)' }}>
              <div className="label-eyebrow" style={{ marginBottom: 10 }}>Headers</div>
              <div className="col gap-8">
                {ep.headers.map(([k, v]) => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    <span style={{ color: 'var(--fg-muted)' }}>{k}</span>
                    <span style={{ color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Body editor (read-only mock) */}
            <div style={{ padding: '16px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="row between" style={{ alignItems: 'center' }}>
                <div className="label-eyebrow">Body · {ep.method === 'GET' ? 'query' : 'json'}</div>
                <div className="row gap-8" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-faint)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 5, height: 5, background: 'var(--teal)', borderRadius: '50%', boxShadow: '0 0 6px var(--teal)' }} />
                    valid · 0 errors
                  </span>
                </div>
              </div>
              <div className="code-block" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex' }}>
                  <div style={{
                    padding: '12px 0', fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: 'var(--fg-faint)', textAlign: 'right',
                    width: 40, flex: '0 0 40px',
                    borderRight: '1px solid rgba(94,234,212,0.06)',
                    userSelect: 'none',
                    background: 'rgba(8,14,28,0.7)',
                  }}>
                    {ep.body.split('\n').map((_, i) => (
                      <div key={i} style={{ padding: '0 8px', lineHeight: 1.65 }}>{i + 1}</div>
                    ))}
                  </div>
                  <pre style={{ flex: 1, padding: '12px 16px', margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.65, overflow: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: tokenize(ep.body) }} />
                </div>
              </div>
            </div>

            {/* Send button */}
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-default)', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                api.cloudops.dev{ep.path}
              </div>
              <div className="row gap-8">
                <button className="btn ghost" data-hover style={{ fontSize: 12, padding: '8px 14px' }}>⧉ cURL</button>
                <button className="btn primary" data-hover onClick={send} disabled={sending}
                  style={{ fontSize: 13, padding: '10px 18px', minWidth: 140, justifyContent: 'center' }}>
                  {sending ? (<><span style={{ width: 12, height: 12, border: '2px solid #06121f', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> sending…</>) : (<>▶ Send Request</>)}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT — response panel */}
          <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(8,14,28,0.4)' }}>
            {/* Status bar */}
            <div style={{
              padding: '14px 22px', borderBottom: '1px solid var(--border-default)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              minHeight: 60,
            }}>
              {!hasResponse ? (
                <div className="mono muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, border: '2px solid var(--teal)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  awaiting response…
                </div>
              ) : (
                <>
                  <div className="row gap-12" style={{ alignItems: 'center' }}>
                    <span style={{
                      padding: '6px 12px', borderRadius: 6,
                      background: `${si.c}22`, border: `1px solid ${si.c}66`,
                      color: si.c, fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                      boxShadow: `0 0 16px ${si.c}33`,
                    }}>{ep.response.status} {si.l}</span>
                    <span className="mono muted" style={{ fontSize: 12 }}>{ep.response.ms}ms</span>
                  </div>
                  <div className="row gap-12" style={{ alignItems: 'center' }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>trace</span>
                    <a className="mono" style={{ fontSize: 12, color: 'var(--teal)' }} href="#" onClick={(e) => e.preventDefault()}>{ep.response.trace} ↗</a>
                  </div>
                </>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)' }}>
              {['body', 'headers', 'trace'].map((t) => (
                <button key={t} className="api-tab" data-hover onClick={() => setRespTab(t)}
                  style={{
                    padding: '10px 18px', background: 'transparent', border: 'none',
                    borderBottom: `2px solid ${t === respTab ? 'var(--teal)' : 'transparent'}`,
                    color: t === respTab ? 'var(--fg)' : 'var(--fg-muted)',
                    cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, textTransform: 'lowercase',
                  }}>{t}</button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              {respTab === 'body' && (
                <pre style={{ margin: 0, padding: '18px 22px', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.7, height: '100%', overflow: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: tokenize(ep.response.body) }} />
              )}
              {respTab === 'headers' && (
                <div style={{ padding: '18px 22px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 2 }}>
                  {[
                    ['content-type', 'application/json; charset=utf-8'],
                    ['x-trace-id', ep.response.trace],
                    ['x-tenant-id', 'acme'],
                    ['x-rate-limit-remaining', '57/60'],
                    ['x-served-by', 'order-api-7f6b4c8d9-x4kqz'],
                    ['cache-control', 'no-store'],
                    ['date', 'Wed, 14 May 2026 18:42:11 GMT'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12 }}>
                      <span style={{ color: 'var(--teal-soft)' }}>{k}</span>
                      <span style={{ color: 'var(--fg-muted)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {respTab === 'trace' && (
                <div style={{ padding: '18px 22px' }}>
                  <div className="label-eyebrow" style={{ marginBottom: 12 }}>Trace · {ep.response.trace}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.9 }}>
                    {[
                      { l: 'next.js · POST /api/order', d: 12, x: 0, c: '#5eead4' },
                      { l: '  api-gw · authorizer', d: 8, x: 4, c: '#67e8f9' },
                      { l: '  order-api · createOrder', d: 67, x: 14, c: '#2dd4bf' },
                      { l: '    pg · BEGIN', d: 1, x: 18, c: '#a78bfa' },
                      { l: '    pg · SELECT inventory', d: 8, x: 22, c: '#a78bfa' },
                      { l: '    pg · INSERT orders', d: 14, x: 32, c: '#a78bfa' },
                      { l: '    pg · COMMIT', d: 2, x: 50, c: '#a78bfa' },
                      { l: '    kinesis · PutRecord', d: 6, x: 60, c: '#fbbf24' },
                      { l: '  ws-fanout · broadcast', d: 4, x: 86, c: '#5eead4' },
                    ].map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-muted)' }}>
                        <span style={{ flex: '0 0 auto', width: 200, fontSize: 11 }}>{s.l}</span>
                        <div style={{ position: 'relative', flex: 1, height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                          <div style={{ position: 'absolute', left: s.x + '%', width: s.d + '%', height: '100%', background: s.c, borderRadius: 2, boxShadow: `0 0 6px ${s.c}55` }} />
                        </div>
                        <span style={{ flex: '0 0 auto', width: 36, textAlign: 'right' }}>{s.d}ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          #playground-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

window.Playground = Playground;
