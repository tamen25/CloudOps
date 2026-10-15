// storefront/hero-cinematic.jsx — combined cinematic hero
// Layered: cluster orbit visual + parallax terminal + editorial headline

// ─── EKS Cluster orbit (background visual, behind text) ─────────────────
function ClusterOrbit() {
  const m = useMouseParallax(6);
  const [activePod, setActivePod] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setActivePod((p) => (p + 1) % 8), 900);
    return () => clearInterval(id);
  }, []);
  const pods = React.useMemo(() => {
    const r = 220;
    return Array.from({ length: 8 }, (_, i) => {
      const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(ang) * r, y: Math.sin(ang) * r * 0.5, i };
    });
  }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transform: `translate3d(${m.x * 0.4}px, ${m.y * 0.4}px, 0)`,
      pointerEvents: 'none', opacity: 0.62,
    }} aria-hidden="true">
      <svg viewBox="-320 -180 640 360" style={{ width: '110%', maxWidth: 1400, height: 'auto' }}>
        <defs>
          <radialGradient id="podGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#2dd4bf" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5eead4" stopOpacity="1" />
            <stop offset="60%" stopColor="#2dd4bf" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#0a0e1a" stopOpacity="0" />
          </radialGradient>
          <filter id="podGlow"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <ellipse cx="0" cy="0" rx="300" ry="150" fill="none" stroke="rgba(94,234,212,0.12)" strokeDasharray="2 4" />
        <ellipse cx="0" cy="0" rx="220" ry="110" fill="none" stroke="rgba(94,234,212,0.16)" strokeDasharray="2 4" />
        <ellipse cx="0" cy="0" rx="130" ry="65"  fill="none" stroke="rgba(94,234,212,0.2)"  strokeDasharray="2 4" />
        {pods.map((p, i) => (
          <line key={'s' + i} x1={p.x} y1={p.y} x2="0" y2="0"
            stroke={i === activePod ? '#5eead4' : 'rgba(94,234,212,0.2)'}
            strokeWidth={i === activePod ? 1.5 : 0.6}
            opacity={i === activePod ? 0.9 : 0.5}
          />
        ))}
        <circle cx="0" cy="0" r="38" fill="url(#coreGrad)" filter="url(#podGlow)" />
        <circle cx="0" cy="0" r="20" fill="#5eead4" opacity="0.95">
          <animate attributeName="r" values="18;22;18" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <text x="0" y="4" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#06181c" fontWeight="700">EKS</text>
        {pods.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="22" fill="url(#podGrad)" filter="url(#podGlow)" opacity={i === activePod ? 1 : 0.55} />
            <rect x={p.x - 16} y={p.y - 11} width="32" height="22" rx="5"
              fill={i === activePod ? 'rgba(94,234,212,0.9)' : 'rgba(13,17,23,0.85)'}
              stroke={i === activePod ? '#5eead4' : 'rgba(94,234,212,0.35)'}
              strokeWidth="1" />
            <text x={p.x} y={p.y + 3} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="6.5"
              fill={i === activePod ? '#06181c' : 'rgba(94,234,212,0.95)'} fontWeight="600">
              {['order','front','ws','search','otel','audit','image','sched'][i]}
            </text>
          </g>
        ))}
        {/* Data packets along spokes */}
        {pods.map((p, i) => (
          <circle key={'pk' + i} r="2.2" fill="#5eead4">
            <animate attributeName="cx" values={`${p.x};0;${p.x}`} dur={`${2.4 + i * 0.2}s`} repeatCount="indefinite" />
            <animate attributeName="cy" values={`${p.y};0;${p.y}`} dur={`${2.4 + i * 0.2}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.95;0" dur={`${2.4 + i * 0.2}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>
    </div>
  );
}

// ─── Terminal with typewriter + CRT scanlines + parallax + DRAGGABLE ────
function Terminal() {
  const m = useMouseParallax(8);
  // Drag state — offset from natural position. Title-bar is the handle.
  const [drag, setDrag] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0, pointerId: null, handleEl: null });
  const onHandlePointerDown = (e) => {
    // Ignore right-clicks / non-primary buttons
    if (e.button !== 0) return;
    dragRef.current.active = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.baseX = drag.x;
    dragRef.current.baseY = drag.y;
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.handleEl = e.currentTarget;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    setDragging(true);
    e.preventDefault();
  };
  const onHandlePointerMove = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setDrag({ x: dragRef.current.baseX + dx, y: dragRef.current.baseY + dy });
  };
  const endDrag = (e) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    try {
      if (dragRef.current.handleEl && dragRef.current.pointerId != null) {
        dragRef.current.handleEl.releasePointerCapture(dragRef.current.pointerId);
      }
    } catch (_) {}
    setDragging(false);
  };
  const resetDrag = () => setDrag({ x: 0, y: 0 });
  const SCRIPT = [
    { kind: 'cmd',  text: 'kubectl logs -l app=order-api --tail=4 --since=14s', typing: true },
    { kind: 'log',  ts: '14:22:01.482Z', lvl: 'INFO', tenant: 'acme',
      msg: 'order_created', kv: { order_id: '549302', dur_ms: 47 } },
    { kind: 'log',  ts: '14:22:01.489Z', lvl: 'INFO', tenant: 'acme',
      msg: 'audit.write', kv: { actor: 'usr_8a3f', action: 'CREATE_ORDER' } },
    { kind: 'log',  ts: '14:22:01.512Z', lvl: 'INFO', tenant: 'acme',
      msg: 'kinesis.put', kv: { stream: 'orders', bytes: 412 } },
    { kind: 'log',  ts: '14:22:01.518Z', lvl: 'INFO', tenant: 'acme',
      msg: 'ws.broadcast', kv: { route: 'order.updated', conns: 23 } },
    { kind: 'cmd',  text: 'aws stepfunctions list-executions --status-filter RUNNING' },
    { kind: 'plain', text: '7f3a8e91-4d2b-4c11-9f8a-3d7e1b0a2c5d  RUNNING  CheckoutSaga' },
    { kind: 'spacer' },
    { kind: 'meta', text: 'last updated', timer: true },
  ];
  const firstCmd = SCRIPT[0].text;
  const [typed, setTyped] = React.useState(0);
  React.useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(firstCmd.length); return;
    }
    let i = 0;
    const id = setInterval(() => {
      i++; setTyped(i);
      if (i >= firstCmd.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, []);
  const [secs, setSecs] = React.useState(14);
  React.useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="reveal reveal-1" style={{ position: 'relative' }}>
    <div className="surface surface-glow" style={{
      padding: 0, overflow: 'hidden', position: 'relative',
      background: 'rgba(13,17,23,0.88)',
      borderColor: dragging ? 'rgba(94,234,212,0.55)' : 'rgba(94,234,212,0.22)',
      boxShadow: dragging ? '0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(94,234,212,0.35), 0 0 60px -10px rgba(45,212,191,0.35)' : undefined,
      transform: dragging
        ? `translate3d(${drag.x}px, ${drag.y}px, 0)`
        : `translate3d(${drag.x + m.x * 1.2}px, ${drag.y + m.y}px, 0) perspective(1400px) rotateX(${m.y * -0.25}deg) rotateY(${m.x * 0.35}deg)`,
      transition: dragging ? 'border-color 0.15s, box-shadow 0.15s' : 'transform 0.18s ease-out, border-color 0.15s, box-shadow 0.15s',
      transformStyle: 'preserve-3d',
      willChange: 'transform',
      touchAction: 'none',
    }} role="img" aria-label="Live log output from order-api pods">
      {/* CRT scanlines */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(94,234,212,0.05) 0 1px, transparent 1px 3px)',
        opacity: 0.55, mixBlendMode: 'overlay',
      }} />
      {/* Sweep */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4,
        background: 'linear-gradient(180deg, transparent 30%, rgba(94,234,212,0.05) 50%, transparent 70%)',
        animation: 'crtSweep 9s ease-in-out infinite',
      }} />
      <div
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={resetDrag}
        title="Drag to move · double-click to recenter"
        style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-default)',
        background: 'rgba(13,17,23,0.95)', position: 'relative', zIndex: 5,
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
      }}>
        <span style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 5.5, background: '#ff5f57' }} />
          <span style={{ width: 11, height: 11, borderRadius: 5.5, background: '#febc2e' }} />
          <span style={{ width: 11, height: 11, borderRadius: 5.5, background: '#28c840' }} />
        </span>
        <span className="mono" style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--fg-subtle)' }}>
          ~/cloudops $
        </span>
        <span className="mono" aria-hidden="true" style={{
          marginLeft: 10, fontSize: 10, color: 'var(--fg-subtle)', opacity: 0.55,
          letterSpacing: '0.04em',
        }}>
          ⠿ drag
        </span>
        <span className="pill-live" style={{ marginLeft: 'auto', fontSize: 10 }}>
          <span className="dot" /> live
        </span>
      </div>
      <pre className="mono" style={{
        margin: 0, padding: '18px 18px 16px',
        fontSize: 12.5, lineHeight: 1.75, minHeight: 320,
        color: 'var(--fg-base)', overflowX: 'auto',
        position: 'relative', zIndex: 2,
      }}>
        {SCRIPT.map((line, i) => {
          if (line.kind === 'cmd') {
            const text = i === 0 ? firstCmd.slice(0, typed) : line.text;
            const showCaret = i === 0 && typed < firstCmd.length;
            return (
              <div key={i}>
                <span className="tok-fn">$</span>{' '}
                <span className="tok-ident">{text}</span>
                {showCaret && <span className="caret">▍</span>}
              </div>
            );
          }
          if (line.kind === 'plain') return <div key={i} style={{ color: 'var(--fg-subtle)' }}>{line.text}</div>;
          if (line.kind === 'spacer') return <div key={i} style={{ height: 6 }} />;
          if (line.kind === 'meta') return (
            <div key={i} style={{ color: 'var(--fg-subtle)', fontSize: 11, marginTop: 8, opacity: 0.7 }}>
              <span className="tok-com">{`// ${line.text}`}</span>{' '}
              <span>{secs}s ago</span><span className="caret">▍</span>
            </div>
          );
          return (
            <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
              <span style={{ color: 'var(--fg-subtle)' }}>{line.ts}</span>{'  '}
              <span style={{ color: line.lvl === 'INFO' ? 'var(--brand-400)' : 'var(--warning)', fontWeight: 600 }}>{line.lvl}</span>{'  '}
              <span style={{ color: 'var(--fg-subtle)' }}>tenant=</span>
              <span style={{ color: 'var(--info)' }}>{line.tenant}</span>{'  '}
              <span style={{ color: 'var(--fg-base)' }}>{line.msg}</span>
              {line.kv && Object.entries(line.kv).map(([k, v]) => (
                <React.Fragment key={k}>
                  {'  '}<span style={{ color: 'var(--fg-subtle)' }}>{k}=</span>
                  <span style={{ color: typeof v === 'number' ? '#f0883e' : 'var(--brand-400)' }}>
                    {typeof v === 'string' ? `"${v}"` : v}
                  </span>
                </React.Fragment>
              ))}
            </div>
          );
        })}
      </pre>
      <style>{`
        @keyframes crtSweep { 0%,100% { transform: translateY(-100%); } 50% { transform: translateY(100%); } }
        .caret { display: inline-block; margin-left: 2px; color: var(--brand-400); animation: caret-blink 1s steps(1) infinite; }
        @keyframes caret-blink { 50% { opacity: 0; } }
      `}</style>
    </div>
    </div>
  );
}

function SignalPills() {
  const pills = [
    { label: 'API', val: '200', kind: 'ok' },
    { label: 'DB', val: 'connected', kind: 'ok' },
    { label: 'WS', val: '23 conns', kind: 'info' },
    { label: 'TF', val: 'no drift', kind: 'ok' },
  ];
  return (
    <div className="row gap-2 reveal reveal-2" style={{ flexWrap: 'wrap', marginTop: 28, marginBottom: 32 }}>
      {pills.map((p) => (
        <span key={p.label} className="badge" style={{
          padding: '5px 10px', fontSize: 10.5,
          background: p.kind === 'ok' ? 'rgba(87,171,90,0.08)' : 'rgba(83,155,245,0.08)',
          borderColor: p.kind === 'ok' ? 'rgba(87,171,90,0.25)' : 'rgba(83,155,245,0.22)',
          color: p.kind === 'ok' ? 'var(--success)' : 'var(--info)',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 6px currentColor' }} />
          <span style={{ color: 'var(--fg-subtle)' }}>{p.label}</span>
          <span style={{ color: 'currentColor', fontWeight: 500 }}>{p.val}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Hero log stream — three faint columns scrolling upward like prints ─
function HeroLogStream() {
  const LINES = [
    '$ kubectl logs -l app=order-api --tail=4 --since=14s',
    '14:22:01.482Z  INFO  tenant=acme  order_created       order_id="549302"  dur_ms=47',
    '14:22:01.489Z  INFO  tenant=acme  audit.write         actor="usr_8a3f"  action="CREATE_ORDER"',
    '14:22:01.512Z  INFO  tenant=acme  kinesis.put         stream="orders"   bytes=412',
    '14:22:01.518Z  INFO  tenant=acme  ws.broadcast        route="order.updated"  conns=23',
    '14:22:01.601Z  INFO  tenant=acme  saga.transition     from="reserve" to="charge"  exec=7f3a8e91',
    '14:22:01.847Z  INFO  tenant=acme  stripe.charge       amount_cents=18900  status="succeeded"',
    '14:22:02.011Z  INFO  tenant=acme  saga.complete       exec=7f3a8e91  dur_ms=410',
    '$ aws stepfunctions list-executions --status-filter RUNNING',
    '7f3a8e91-4d2b-4c11-9f8a-3d7e1b0a2c5d  RUNNING  CheckoutSaga    started=14:22:01.601Z',
    'b2c4d6e8-1f3a-4b5c-9d8e-2f7a1b0c4d6e  RUNNING  RefundSaga      started=14:21:58.220Z',
    '$ kubectl get pods -n prod -l tier=api',
    'NAME                         READY   STATUS    RESTARTS   AGE',
    'order-api-7d9c6b4f8-xk2pq    1/1     Running   0          4d2h',
    'order-api-7d9c6b4f8-9wm4r    1/1     Running   0          4d2h',
    'order-api-7d9c6b4f8-c3v8t    1/1     Running   0          4d2h',
    'order-api-7d9c6b4f8-h7k1n    1/1     Running   0          4d2h',
    '$ aws logs tail /aws/eks/cloudops-prod/cluster --follow',
    '14:22:03.114Z  INFO  ingress  conn_accept     remote="52.91.4.18"  tls="1.3"',
    '14:22:03.220Z  INFO  envoy    upstream_healthy clusters=12  endpoints=47',
    '14:22:03.318Z  INFO  redis    cache.hit       key="catalog:sku:8821"  ttl=298',
    '14:22:03.402Z  WARN  rds      slow_query      ms=812  rows=14  query="SELECT * FROM orders WHERE..."',
    '14:22:03.598Z  INFO  s3       put_object      bucket="acme-invoices"  bytes=14820',
    '14:22:03.701Z  INFO  cloudtrail  AssumeRole   role="OrdersWriter"  src="lambda-checkout"',
    '$ kubectl top nodes',
    'NAME              CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%',
    'ip-10-0-12-44     412m         21%    3812Mi          47%',
    'ip-10-0-12-88     368m         18%    3502Mi          43%',
    'ip-10-0-14-22     521m         26%    4108Mi          51%',
    '// p50 18ms  ·  p95 47ms  ·  p99 112ms  ·  err 0.02%',
    '14:22:04.012Z  INFO  hpa      scaled_up       deployment="order-api"  from=4 to=5  reason="cpu>70%"',
    '14:22:04.140Z  INFO  istio    mtls_handshake  src="checkout"  dst="orders"  ms=2.4',
    '14:22:04.260Z  INFO  opa      policy.allow    sub="usr_8a3f"  act="orders:write"  ms=1.1',
    '$ helm list -n prod',
    'NAME            NAMESPACE  REVISION  STATUS    CHART                 APP VERSION',
    'cloudops        prod       42        deployed  cloudops-platform-1.4 1.4.0',
    'monitoring      prod       18        deployed  kube-prometheus-0.65  0.65.2',
    '// last updated just now',
  ];

  // Triple the list for a seamless loop and to fill tall columns.
  const block = [...LINES, ...LINES, ...LINES];

  const colStyle = {
    flex: 1, minWidth: 0,
    color: 'var(--fg-base)',
    fontSize: 10.5, lineHeight: 1.9,
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'pre', overflow: 'hidden',
    willChange: 'transform',
  };

  return (
    <div aria-hidden="true" style={{
      position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
      display: 'flex', gap: '4vw', padding: '0 3vw',
      opacity: 0.06,
      maskImage: 'linear-gradient(180deg, transparent 0%, black 14%, black 86%, transparent 100%), radial-gradient(ellipse 38% 32% at 50% 50%, transparent 30%, black 90%)',
      WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, black 14%, black 86%, transparent 100%), radial-gradient(ellipse 38% 32% at 50% 50%, transparent 30%, black 90%)',
      maskComposite: 'intersect', WebkitMaskComposite: 'source-in',
      userSelect: 'none',
    }}>
      <div style={colStyle}>
        <div style={{ animation: 'log-print-a 38s linear infinite' }}>
          {block.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
      <div style={{ ...colStyle, marginTop: '-9vh' }}>
        <div style={{ animation: 'log-print-b 46s linear infinite' }}>
          {block.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
      <div style={colStyle}>
        <div style={{ animation: 'log-print-c 32s linear infinite' }}>
          {block.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
      <style>{`
        @keyframes log-print-a { from { transform: translateY(0); } to { transform: translateY(-33.333%); } }
        @keyframes log-print-b { from { transform: translateY(-33.333%); } to { transform: translateY(-66.666%); } }
        @keyframes log-print-c { from { transform: translateY(-16.666%); } to { transform: translateY(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          [style*="log-print-a"], [style*="log-print-b"], [style*="log-print-c"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function Hero() {
  return (
    <section id="hero" style={{ paddingTop: 80, paddingBottom: 80, position: 'relative', overflow: 'hidden', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {/* EKS cluster orbit — ambient visual behind copy */}
      <ClusterOrbit />
      <div className="hero-orb" style={{ top: -120, right: '-100px', width: 480, height: 480, opacity: 0.3 }} aria-hidden="true" />
      <div className="noise" aria-hidden="true" />

      {/* Faint log watermark — streams upward like a live print job,
         spread across the entire hero area. */}
      <HeroLogStream />

      <div className="container" style={{ position: 'relative', zIndex: 2, textAlign: 'center', width: '100%' }}>
        <div className="reveal" style={{ display: 'inline-flex', marginBottom: 28 }}>
          <span className="pill-live" style={{ fontSize: 12, padding: '6px 14px' }}>
            <span className="dot" />
            v1.4.0 · production · 30-day uptime 99.94%
          </span>
        </div>
        <h1 className="display reveal reveal-1" style={{
          margin: '0 auto',
          fontSize: 'clamp(64px, 11vw, 148px)',
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 400,
          letterSpacing: '-0.025em',
          lineHeight: 0.98,
          color: 'var(--fg-base)',
        }}>
          CloudOps Platform
        </h1>
        <p className="reveal reveal-2" style={{
          margin: '28px auto 0',
          fontSize: 'clamp(16px, 1.6vw, 20px)',
          color: 'var(--fg-muted)', maxWidth: 640, lineHeight: 1.55,
        }}>
          Multi-tenant SaaS on Kubernetes. Built for scale, designed for interviews —
          every layer instrumented, every line open source.
        </p>
        <div className="row gap-3 reveal reveal-3" style={{
          marginTop: 40, justifyContent: 'center', flexWrap: 'wrap',
        }}>
          <a className="btn btn-primary" href="#how-it-works">
            Explore the platform <span className="arr">→</span>
          </a>
          <a className="btn btn-ghost" href="#architecture">
            View architecture <span className="arr">↓</span>
          </a>
        </div>
      </div>

      {/* Subtle scroll cue */}
      <div className="reveal reveal-4" style={{
        position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.6,
      }} aria-hidden="true">
        <div style={{ width: 1, height: 28, background: 'linear-gradient(180deg, var(--brand-400), transparent)', animation: 'scroll-fade 1.8s ease-in-out infinite' }} />
      </div>

      <Connector />

      <style>{`
        @keyframes scroll-fade { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.8; } }
        @media (max-width: 720px) {
          .hero-metrics { right: 16px; bottom: 16px; }
          .hero-metrics .surface { min-width: 130px; padding: 8px 12px; }
        }
      `}</style>
    </section>
  );
}

// ─── LiveOps band — terminal as its own section, after hero ─────────────
function LiveOps() {
  return (
    <section id="live-ops" style={{ paddingTop: 32, paddingBottom: 96 }}>
      <div className="container">
        <div className="row between items-center reveal" style={{ marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div className="col" style={{ gap: 8 }}>
            <div className="eyebrow">
              <span className="e-tag">live ops</span>
              <span style={{ color: 'var(--fg-subtle)' }}>·</span>
              <span>sampled from prod · 5s ago</span>
            </div>
            <h2 className="display" style={{
              margin: 0, fontSize: 'clamp(24px, 2.6vw, 32px)', color: 'var(--fg-base)',
            }}>
              What the platform is doing <span className="display-italic">right now</span>.
            </h2>
          </div>
          <span className="pill-live"><span className="dot" /> streaming</span>
        </div>
        <Terminal />
      </div>
      <Connector />
    </section>
  );
}

window.Hero = Hero;
window.LiveOps = LiveOps;
