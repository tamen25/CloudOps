// storefront/hero.jsx — S1
// Asymmetric two-column grid. Left: editorial pull-quote headline.
// Right: live-feeling terminal card with one typewriter line on mount.

function Terminal() {
  // Typewriter ONLY on first line; rest of script is static.
  const SCRIPT = [
    { kind: 'cmd',  text: 'kubectl logs -l app=order-api --tail=4 --since=14s', typing: true },
    { kind: 'log',  ts: '14:22:01.482Z', lvl: 'INFO', tenant: 'acme',
      msg: 'order_created', kv: { order_id: '549302', tenant: 'acme', dur_ms: 47 } },
    { kind: 'log',  ts: '14:22:01.489Z', lvl: 'INFO', tenant: 'acme',
      msg: 'audit.log.write', kv: { actor: 'usr_8a3f', action: 'CREATE_ORDER' } },
    { kind: 'log',  ts: '14:22:01.512Z', lvl: 'INFO', tenant: 'acme',
      msg: 'kinesis.put', kv: { stream: 'orders', shard: 'shardId-2', bytes: 412 } },
    { kind: 'log',  ts: '14:22:01.518Z', lvl: 'INFO', tenant: 'acme',
      msg: 'ws.broadcast', kv: { route: 'order.updated', conns: 23 } },
    { kind: 'cmd',  text: 'aws stepfunctions list-executions --status-filter RUNNING' },
    { kind: 'plain', text: '7f3a8e91-4d2b-4c11-9f8a-3d7e1b0a2c5d  RUNNING  CheckoutSaga' },
    { kind: 'spacer' },
    { kind: 'meta', text: 'last updated', timer: true },
  ];

  // Type out only the first command, then settle.
  const [typedIdx, setTypedIdx] = React.useState(0);
  const firstCmd = SCRIPT[0].text;
  React.useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedIdx(firstCmd.length); return;
    }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTypedIdx(i);
      if (i >= firstCmd.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, []);

  // Tiny live timestamp — only after type-on completes
  const [secs, setSecs] = React.useState(14);
  React.useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="surface reveal reveal-1" role="img" aria-label="Sample CloudOps platform log output"
      style={{
        padding: 0, overflow: 'hidden',
        background: 'rgba(13,17,23,0.85)',
        borderColor: 'rgba(94,234,212,0.18)',
        boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 0 40px -10px rgba(45,212,191,0.25)',
      }}>
      {/* Window chrome */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-default)',
        background: 'rgba(13,17,23,0.95)',
      }}>
        <span style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 5.5, background: '#ff5f57' }} />
          <span style={{ width: 11, height: 11, borderRadius: 5.5, background: '#febc2e' }} />
          <span style={{ width: 11, height: 11, borderRadius: 5.5, background: '#28c840' }} />
        </span>
        <span className="mono" style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--fg-subtle)' }}>
          ~/cloudops $
        </span>
        <span className="pill-live" style={{ marginLeft: 'auto', fontSize: 10 }}>
          <span className="dot" /> live
        </span>
      </div>
      {/* Body */}
      <pre className="mono" style={{
        margin: 0, padding: '18px 18px 16px',
        fontSize: 12.5, lineHeight: 1.75, minHeight: 320,
        color: 'var(--fg-base)',
        overflowX: 'auto',
      }}>
        {SCRIPT.map((line, i) => {
          if (line.kind === 'cmd') {
            const text = i === 0 ? firstCmd.slice(0, typedIdx) : line.text;
            const showCaret = i === 0 && typedIdx < firstCmd.length;
            return (
              <div key={i}>
                <span className="tok-fn">$</span>{' '}
                <span className="tok-ident">{text}</span>
                {showCaret && <span className="caret">▍</span>}
              </div>
            );
          }
          if (line.kind === 'plain') {
            return <div key={i} style={{ color: 'var(--fg-subtle)' }}>{line.text}</div>;
          }
          if (line.kind === 'spacer') {
            return <div key={i} style={{ height: 6 }} />;
          }
          if (line.kind === 'meta') {
            return (
              <div key={i} style={{ color: 'var(--fg-subtle)', fontSize: 11, marginTop: 8, opacity: 0.7 }}>
                <span className="tok-com">{`// ${line.text}`}</span>{' '}
                <span>{secs}s ago</span>
                <span className="caret">▍</span>
              </div>
            );
          }
          // log line
          return (
            <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
              <span style={{ color: 'var(--fg-subtle)' }}>{line.ts}</span>{'  '}
              <span style={{
                color: line.lvl === 'INFO' ? 'var(--brand-400)' : 'var(--warning)',
                fontWeight: 600,
              }}>{line.lvl}</span>{'  '}
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
        .caret { display: inline-block; margin-left: 2px; color: var(--brand-400); animation: caret-blink 1s steps(1) infinite; }
        @keyframes caret-blink { 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}

function SignalPills() {
  // Static signal pills — these are static facts about the running platform.
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
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'currentColor', boxShadow: '0 0 6px currentColor',
          }} />
          <span style={{ color: 'var(--fg-subtle)' }}>{p.label}</span>
          <span style={{ color: 'currentColor', fontWeight: 500 }}>{p.val}</span>
        </span>
      ))}
    </div>
  );
}

function Hero() {
  return (
    <section id="hero" style={{ paddingTop: 140, paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
      {/* Hero-only background motifs */}
      <div className="line-grid" style={{ position: 'absolute', inset: 0, opacity: 0.5, maskImage: 'linear-gradient(180deg, black 0%, black 60%, transparent 100%)' }} aria-hidden="true" />
      <div className="hero-orb" style={{ top: -120, left: '38%' }} aria-hidden="true" />
      <div className="hero-orb" style={{ top: 80, right: '-160px', width: 360, height: 360, opacity: 0.45 }} aria-hidden="true" />
      <div className="noise" aria-hidden="true" />

      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="hero-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)',
          gap: 56, alignItems: 'center',
        }}>
          {/* LEFT — copy */}
          <div className="col">
            <div className="eyebrow reveal" style={{ marginBottom: 32 }}>
              <span className="e-tag">platform demo</span>
              <span style={{ color: 'var(--fg-subtle)' }}>·</span>
              <span>v0.1.0</span>
              <span style={{ color: 'var(--fg-subtle)' }}>·</span>
              <span>commit a4f2c91</span>
            </div>
            <h1 className="display-italic reveal reveal-1" style={{
              margin: 0,
              fontSize: 'clamp(56px, 7.5vw, 92px)',
              color: 'var(--fg-base)',
            }}>
              A storefront that{' '}
              <span style={{
                background: 'linear-gradient(180deg, var(--brand-300), var(--brand-500))',
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>survives 3 AM.</span>
            </h1>
            <p className="reveal reveal-2" style={{
              marginTop: 28, fontSize: 19, color: 'var(--fg-muted)', maxWidth: '60ch', lineHeight: 1.55,
            }}>
              Multi-tenant Next.js + Express on EKS, fronted by Cognito, fanned out via Kinesis,
              observed by OTel. Built in public, torn down at midnight, brought back at 9 AM —
              all from the same repo.
            </p>
            <SignalPills />
            <div className="row gap-3 reveal reveal-3" style={{ flexWrap: 'wrap' }}>
              <a className="btn btn-primary" href="/products">
                Browse the catalog <span className="arr">→</span>
              </a>
              <a className="btn btn-ghost" href="#architecture">
                View architecture <span className="arr">↓</span>
              </a>
            </div>
            {/* Subtle footnote */}
            <div className="mono reveal reveal-4" style={{
              marginTop: 36, fontSize: 11, color: 'var(--fg-subtle)',
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>
              <span style={{ color: 'var(--brand-400)' }}>↳</span>
              <span>EKS · 1.28 · t3.medium × 2</span>
              <span>·</span>
              <span>Aurora Serverless v2 · 0.5 ACU min</span>
              <span>·</span>
              <span>~$0.20 / hr idle</span>
            </div>
          </div>

          {/* RIGHT — terminal */}
          <div style={{ minWidth: 0 }}>
            <Terminal />
          </div>
        </div>
      </div>

      {/* Section connector to S2 */}
      <Connector />

      <style>{`
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
        }
      `}</style>
    </section>
  );
}

window.Hero = Hero;
