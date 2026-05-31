// hero.jsx — "The Abyss Awakens"
// Floating terminal + 3D cluster diagram + parallax + live metric pills

function HeroTerminal() {
  const m = useMouseParallax(8);
  const SCRIPT = [
    { p: '$', t: 'kubectl get pods -n cloudops --watch', c: 'cmd', delay: 40 },
    { t: 'NAME                                  READY   STATUS    AGE', c: 'hdr', delay: 8 },
    { t: 'order-api-7f6b4c8d9-x4kqz             1/1     Running   12d', c: 'ok', delay: 6 },
    { t: 'order-api-7f6b4c8d9-h2mwn             1/1     Running   12d', c: 'ok', delay: 6 },
    { t: 'order-api-7f6b4c8d9-bvtr3             1/1     Running   12d', c: 'ok', delay: 6 },
    { t: 'storefront-844c9b5b-7gqxs             1/1     Running    4d', c: 'ok', delay: 6 },
    { t: 'storefront-844c9b5b-mn8pq             1/1     Running    4d', c: 'ok', delay: 6 },
    { t: 'ws-fanout-69d8b4c-fr2hz               1/1     Running    7h', c: 'ok', delay: 6 },
    { t: 'search-gateway-5d4f8c6c-q8wlx         1/1     Running   12d', c: 'ok', delay: 6 },
    { t: 'otel-collector-c5b9d8e7-pjk9w         1/1     Running   30d', c: 'ok', delay: 6 },
  ];
  // Type-on intro: progressively reveal scripted lines, then start the
  // live-pod ticker once the script finishes.
  const [lines, setLines] = React.useState([]);
  const [typingIdx, setTypingIdx] = React.useState(0); // # of chars typed on current line
  const [scriptDone, setScriptDone] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    let cursor = 0;
    async function run() {
      for (let i = 0; i < SCRIPT.length; i++) {
        if (cancelled) return;
        const line = SCRIPT[i];
        if (line.c === 'cmd') {
          // Animate character-by-character; commit line on completion.
          for (let c = 0; c <= line.t.length; c++) {
            if (cancelled) return;
            setLines((cur) => {
              const next = [...cur];
              next[i] = { ...line, t: line.t.slice(0, c), typing: c < line.t.length };
              return next;
            });
            await new Promise((r) => setTimeout(r, line.delay));
          }
        } else {
          setLines((cur) => [...cur, { ...line }]);
          await new Promise((r) => setTimeout(r, line.delay * 18));
        }
      }
      setScriptDone(true);
    }
    run();
    return () => { cancelled = true; };
  }, []);

  // After script done, start the live ticker (replace random rows)
  React.useEffect(() => {
    if (!scriptDone) return;
    const pods = ['order-api', 'storefront', 'ws-fanout', 'search-gateway', 'image-resize', 'audit-worker'];
    const id = setInterval(() => {
      setLines((cur) => {
        const next = pods[Math.floor(Math.random() * pods.length)];
        const newLine = {
          t: `${next}-${Math.random().toString(36).slice(2,11)}    1/1     Running   ${Math.floor(Math.random()*30)+1}s`,
          c: 'new',
        };
        // Keep the cmd line, swap one of the rows
        const rest = cur.slice(1);
        const idx = Math.floor(Math.random() * rest.length);
        rest.splice(idx, 1, newLine);
        // Decay 'new' tag after a second so highlight fades
        return [cur[0], ...rest];
      });
    }, 3200);
    return () => clearInterval(id);
  }, [scriptDone]);

  return (
    <div
      className="glass code-block shadow-deep"
      style={{
        width: '100%',
        maxWidth: 600,
        position: 'relative',
        overflow: 'hidden',
        transform: `perspective(1200px) rotateX(${m.y * -0.4}deg) rotateY(${m.x * 0.6}deg) translate3d(${m.x * 1.5}px, ${m.y * 1.2}px, 0)`,
        transition: 'transform 0.15s ease-out',
      }}
    >
      {/* CRT scanline overlay */}
      <div className="crt-scan" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(94,234,212,0.04) 0 1px, transparent 1px 3px)',
        opacity: 0.65,
        mixBlendMode: 'overlay',
      }} />
      {/* Sweeping highlight */}
      <div className="crt-sweep" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4,
        background: 'linear-gradient(180deg, transparent 30%, rgba(94,234,212,0.04) 50%, transparent 70%)',
        animation: 'crtSweep 8s ease-in-out infinite',
      }} />
      <div className="code-head">
        <div className="traffic"><span /><span /><span /></div>
        <span style={{ marginLeft: 8 }}>cloudops@prod-eks ~ kubectl</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pulse-dot" style={{ width: 7, height: 7 }} />
          live
        </span>
      </div>
      <pre style={{ minHeight: 280, position: 'relative', zIndex: 2 }}>
        {lines.map((l, i) => (
          <div key={i} style={{
            color: l.c === 'cmd' ? 'var(--fg)' : l.c === 'hdr' ? 'var(--fg-muted)' : l.c === 'new' ? 'var(--teal-soft)' : 'var(--fg)',
            opacity: l.c === 'hdr' ? 0.7 : 1,
            animation: l.c === 'new' ? 'rowFlash 1.6s ease-out' : 'none',
          }}>
            {l.p && <span className="tok-fn" style={{ marginRight: 8 }}>{l.p}</span>}
            <span>{l.t}</span>
            {l.typing && <span className="term-caret">█</span>}
          </div>
        ))}
        {scriptDone && (
          <div style={{ color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="pulse-dot" style={{ width: 5, height: 5 }} /> watching for changes…<span className="term-caret">█</span>
          </div>
        )}
      </pre>
      <style>{`
        @keyframes crtSweep { 0%, 100% { transform: translateY(-100%); } 50% { transform: translateY(100%); } }
        @keyframes rowFlash { from { background: rgba(94,234,212,0.18); } to { background: transparent; } }
        @keyframes caretBlink { 50% { opacity: 0; } }
        .term-caret { display: inline-block; margin-left: 1px; color: var(--teal); animation: caretBlink 1s steps(1) infinite; }
      `}</style>
    </div>
  );
}

// SVG cluster — pods orbiting / pulsing
function HeroCluster() {
  const m = useMouseParallax(4);
  // Animate a pulse on a rotating "active" pod
  const [activePod, setActivePod] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setActivePod((p) => (p + 1) % 8), 800);
    return () => clearInterval(id);
  }, []);
  const pods = React.useMemo(() => {
    const r = 200;
    return Array.from({ length: 8 }, (_, i) => {
      const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(ang) * r, y: Math.sin(ang) * r * 0.55, i };
    });
  }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transform: `translate3d(${m.x * 0.5}px, ${m.y * 0.5}px, 0)`,
      pointerEvents: 'none',
    }}>
      <svg viewBox="-300 -200 600 400" style={{ width: '110%', maxWidth: 1400, height: 'auto', opacity: 0.75 }}>
        <defs>
          <radialGradient id="podGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#2dd4bf" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5eead4" stopOpacity="1" />
            <stop offset="60%" stopColor="#2dd4bf" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#0a0e27" stopOpacity="0" />
          </radialGradient>
          <filter id="podGlow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {/* concentric ellipses (the "orbit" floor) */}
        <ellipse cx="0" cy="0" rx="280" ry="155" fill="none" stroke="rgba(94,234,212,0.15)" strokeDasharray="2 4" />
        <ellipse cx="0" cy="0" rx="200" ry="110" fill="none" stroke="rgba(94,234,212,0.18)" strokeDasharray="2 4" />
        <ellipse cx="0" cy="0" rx="120" ry="66" fill="none" stroke="rgba(94,234,212,0.22)" strokeDasharray="2 4" />
        {/* spokes from pods to core */}
        {pods.map((p, i) => (
          <line key={'s' + i} x1={p.x} y1={p.y} x2="0" y2="0"
            stroke={i === activePod ? '#5eead4' : 'rgba(94,234,212,0.25)'}
            strokeWidth={i === activePod ? 1.5 : 0.6}
            opacity={i === activePod ? 0.9 : 0.6}
          >
            {i === activePod && (
              <animate attributeName="opacity" values="0.2;1;0.2" dur="0.8s" repeatCount="1" />
            )}
          </line>
        ))}
        {/* Core */}
        <circle cx="0" cy="0" r="34" fill="url(#coreGrad)" filter="url(#podGlow)" />
        <circle cx="0" cy="0" r="18" fill="#5eead4" opacity="0.95">
          <animate attributeName="r" values="16;20;16" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <text x="0" y="4" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="#06121f" fontWeight="700">EKS</text>

        {/* Pods */}
        {pods.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="18" fill="url(#podGrad)" filter="url(#podGlow)" opacity={i === activePod ? 1 : 0.7} />
            <rect x={p.x - 14} y={p.y - 10} width="28" height="20" rx="4"
              fill={i === activePod ? 'rgba(94,234,212,0.95)' : 'rgba(20,28,45,0.85)'}
              stroke={i === activePod ? '#5eead4' : 'rgba(94,234,212,0.4)'}
              strokeWidth="1"
            />
            <text x={p.x} y={p.y + 2} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="6"
              fill={i === activePod ? '#06121f' : 'rgba(94,234,212,0.95)'} fontWeight="600">
              {['order','front','ws','search','otel','audit','image','sched'][i]}
            </text>
          </g>
        ))}
        {/* moving data packets along spokes */}
        {pods.map((p, i) => (
          <circle key={'pk' + i} r="2" fill="#5eead4" opacity="0.95">
            <animate attributeName="cx" values={`${p.x};0;${p.x}`} dur={`${2.4 + i * 0.2}s`} repeatCount="indefinite" />
            <animate attributeName="cy" values={`${p.y};0;${p.y}`} dur={`${2.4 + i * 0.2}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.95;0" dur={`${2.4 + i * 0.2}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>
    </div>
  );
}

function LiveMetricPill({ label, value, unit, color = 'var(--teal)' }) {
  return (
    <div className="glass" style={{ padding: '12px 18px', minWidth: 168, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div className="mono" style={{ fontSize: 26, fontWeight: 600, color, textShadow: `0 0 14px ${color}66` }}>{value}</div>
        {unit && <div className="mono muted" style={{ fontSize: 11 }}>{unit}</div>}
      </div>
      <div className="mono muted" style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
      <span style={{ position: 'absolute', top: 12, right: 12, width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }}>
        <span className="pulse-dot" style={{ position: 'absolute', inset: 0, background: color }} />
      </span>
    </div>
  );
}

function Hero() {
  const scrollY = useScrollY();
  const [showCta, setShowCta] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setShowCta(true), 1200); return () => clearTimeout(t); }, []);
  // Live metrics
  const pods = Math.round(useTicker(47, 2, 4500));
  const lat = useTicker(2.1, 0.4, 4500).toFixed(2);
  const slo = useTicker(99.94, 0.02, 6000).toFixed(2);
  // Parallax math: progress 0..1 through hero
  const hh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const p = Math.min(1, scrollY / hh);
  const fgY = p * -80;
  const midY = p * -40;
  const bgY = p * -10;
  const bgScale = 1 + p * 0.25;
  const fgOp = 1 - p * 1.4;
  const midOp = 1 - p * 0.85;
  return (
    <section id="hero" style={{
      minHeight: '100vh', paddingTop: 0, paddingBottom: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <Bioluminescence count={18} />
      {/* Background cluster */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translateY(${bgY}px) scale(${bgScale})`,
        opacity: Math.max(0.5, 1 - p * 0.6),
      }}>
        <HeroCluster />
      </div>

      {/* Mid-ground content */}
      <div className="container" style={{
        position: 'relative', zIndex: 2, textAlign: 'center',
        transform: `translateY(${midY}px)`,
        opacity: Math.max(0, midOp),
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div className="pill teal-pill" style={{ animation: 'fadeIn 1s ease 0.2s both' }}>
            <span className="pulse-dot" style={{ width: 6, height: 6 }} /> v1.4.0 · production · 30-day uptime 99.94%
          </div>
        </div>
        <h1 className="display display-grad" style={{
          fontSize: 'clamp(56px, 9vw, 124px)',
          fontWeight: 700,
          marginBottom: 24,
          textShadow: '0 0 80px rgba(45,212,191,0.18)',
          letterSpacing: '-0.04em',
        }}>
          CloudOps Platform
        </h1>
        <p style={{ fontSize: 'clamp(16px, 1.6vw, 20px)', color: 'var(--fg-muted)', maxWidth: 620, margin: '0 auto 40px', lineHeight: 1.5 }}>
          Multi-tenant SaaS on Kubernetes. Built for scale, designed for interviews — every layer instrumented, every line open source.
        </p>

        {/* Floating terminal — foreground */}
        <div style={{
          display: 'flex', justifyContent: 'center', marginTop: 32,
          transform: `translateY(${fgY}px)`,
          opacity: Math.max(0, fgOp),
        }}>
          <HeroTerminal />
        </div>
      </div>

      {/* Live metric pills — bottom right */}
      <div style={{
        position: 'absolute', bottom: 32, right: 32, zIndex: 3,
        display: 'flex', flexDirection: 'column', gap: 10,
        transform: `translateY(${midY * 0.5}px)`,
      }} className="hero-pills">
        <LiveMetricPill label="pods running" value={pods} unit="" />
        <LiveMetricPill label="p99 latency" value={lat} unit="ms" />
        <LiveMetricPill label="30d SLO" value={slo} unit="%" />
      </div>

      {/* CTA — bottom center */}
      <div style={{
        position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)', zIndex: 3,
        opacity: showCta ? 1 : 0, transition: 'opacity 0.8s ease',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}>
        <a className="btn ghost" href="#journey">
          Explore Architecture <span className="arr">↓</span>
        </a>
        <div style={{ width: 1, height: 32, background: 'linear-gradient(180deg, var(--teal), transparent)', opacity: 0.6 }} />
      </div>

      {/* Horizon glow */}
      <div style={{
        position: 'absolute', bottom: -100, left: 0, right: 0, height: 220,
        background: 'radial-gradient(ellipse 60% 100% at 50% 100%, var(--horizon), transparent 70%)',
        opacity: 0.4, pointerEvents: 'none',
      }} />

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 900px) {
          .hero-pills { right: 16px; bottom: 16px; }
          .hero-pills .glass { min-width: 130px; padding: 8px 12px; }
        }
      `}</style>
    </section>
  );
}

window.Hero = Hero;
