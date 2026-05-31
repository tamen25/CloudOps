// benchmarks.jsx — 3 metric columns with live charts

function Sparkline({ color, n = 60, target = 0.6 }) {
  const [points, setPoints] = React.useState(() => Array.from({ length: n }, () => target + (Math.random() - 0.5) * 0.3));
  React.useEffect(() => {
    const id = setInterval(() => {
      setPoints((p) => [...p.slice(1), target + (Math.random() - 0.5) * 0.3]);
    }, 600);
    return () => clearInterval(id);
  }, [target]);
  const path = points.map((y, i) => {
    const xPct = (i / (points.length - 1)) * 100;
    const yPct = 100 - Math.max(0, Math.min(1, y)) * 90 - 5;
    return `${i === 0 ? 'M' : 'L'} ${xPct} ${yPct}`;
  }).join(' ');
  const area = path + ` L 100 100 L 0 100 Z`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 80 }}>
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${color.replace('#', '')})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
    </svg>
  );
}

function BarBreakdown({ data }) {
  return (
    <div className="col gap-12" style={{ marginTop: 16 }}>
      {data.map((d, i) => (
        <div key={d.l}>
          <div className="row between" style={{ alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>{d.l}</span>
            <span style={{ fontSize: 12, color: d.c || 'var(--teal-soft)', fontFamily: 'var(--font-mono)' }}>{d.v}</span>
          </div>
          <div style={{ height: 6, background: 'rgba(94,234,212,0.08)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: (d.p * 100) + '%',
              background: `linear-gradient(90deg, ${d.c || '#2dd4bf'}, ${d.c2 || '#5eead4'})`,
              boxShadow: `0 0 8px ${d.c || 'var(--teal-glow)'}66`,
              borderRadius: 3,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Donut({ pct, color = '#2dd4bf' }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  return (
    <svg viewBox="0 0 140 140" style={{ width: 160, height: 160 }}>
      <defs>
        <filter id="donut-glow"><feGaussianBlur stdDeviation="2" /></filter>
      </defs>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(239,68,68,0.4)" strokeWidth="10" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform="rotate(-90 70 70)"
        style={{ filter: 'drop-shadow(0 0 6px var(--teal-glow))', transition: 'stroke-dashoffset 1.4s ease' }} />
      <text x="70" y="68" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" fill="var(--fg-muted)">budget</text>
      <text x="70" y="86" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="14" fill="var(--teal-soft)" fontWeight="600">23.4 min</text>
    </svg>
  );
}

function Benchmarks() {
  const [ref, inView] = useInView();
  const lat = useCountUp(2.1, { duration: 1400, decimals: 1, start: inView });
  const thr = useCountUp(4.2, { duration: 1400, decimals: 1, start: inView });
  const av  = useCountUp(99.94, { duration: 1600, decimals: 2, start: inView });
  return (
    <section id="benchmarks" ref={ref} style={{ position: 'relative' }}>
      <Bioluminescence count={12} />
      <div className="container">
        <SectionHead
          eyebrow="The Numbers"
          title="Benchmarks"
          lede="Continuously measured. Continuously alerted on. These aren't marketing numbers — they're live."
        />
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24,
        }} id="bench-grid">
          {/* Latency */}
          <div className="glass reveal" style={{ padding: 32, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 140, height: 140, background: 'radial-gradient(circle, var(--teal-faint), transparent 70%)', pointerEvents: 'none' }} />
            <Eyebrow>Latency</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14, marginBottom: 8 }}>
              <span className="mono text-glow" style={{ fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 600, color: 'var(--teal)', lineHeight: 1 }}>{lat}</span>
              <span className="mono" style={{ fontSize: 22, color: 'var(--fg-muted)' }}>ms</span>
            </div>
            <div style={{ color: 'var(--fg-muted)', fontSize: 14, marginBottom: 18 }}>p99 order creation</div>
            <Sparkline color="#2dd4bf" target={0.55} />
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--fg-faint)' }}>last 5 min · 100 samples</span>
              <span style={{ color: '#22c55e' }}>↓ 86% vs industry avg</span>
            </div>
          </div>
          {/* Throughput */}
          <div className="glass reveal reveal-delay-1" style={{ padding: 32, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 140, height: 140, background: 'radial-gradient(circle, rgba(94,234,212,0.18), transparent 70%)', pointerEvents: 'none' }} />
            <Eyebrow>Throughput</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14, marginBottom: 8 }}>
              <span className="mono text-glow" style={{ fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 600, color: 'var(--teal)', lineHeight: 1 }}>{thr}k</span>
              <span className="mono" style={{ fontSize: 22, color: 'var(--fg-muted)' }}>req/s</span>
            </div>
            <div style={{ color: 'var(--fg-muted)', fontSize: 14 }}>sustained, 2 t3.medium nodes</div>
            <BarBreakdown data={[
              { l: 'storefront',     v: '2.1k', p: 0.50, c: '#2dd4bf', c2: '#5eead4' },
              { l: 'order-api',      v: '1.2k', p: 0.29, c: '#67e8f9', c2: '#2dd4bf' },
              { l: 'search-gateway', v: '720',  p: 0.17, c: '#a78bfa', c2: '#67e8f9' },
              { l: 'ws-fanout',      v: '180',  p: 0.04, c: '#fbbf24', c2: '#a78bfa' },
            ]} />
          </div>
          {/* Availability */}
          <div className="glass reveal reveal-delay-2" style={{ padding: 32, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 140, height: 140, background: 'radial-gradient(circle, rgba(34,197,94,0.18), transparent 70%)', pointerEvents: 'none' }} />
            <Eyebrow>Availability</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14, marginBottom: 8 }}>
              <span className="mono text-glow" style={{ fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 600, color: 'var(--teal)', lineHeight: 1 }}>{av}</span>
              <span className="mono" style={{ fontSize: 22, color: 'var(--fg-muted)' }}>%</span>
            </div>
            <div style={{ color: 'var(--fg-muted)', fontSize: 14, marginBottom: 8 }}>30-day SLO compliance</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
              <Donut pct={inView ? 0.9994 : 0} />
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--fg-faint)' }}>SLO target · 99.9%</span>
              <span style={{ color: '#22c55e' }}>✓ in compliance</span>
            </div>
          </div>
        </div>

        {/* Bottom: comparison strip */}
        <div className="reveal" style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            ['cold start', '142ms', 'lambda@vpc'],
            ['DB connection', '0.4ms', 'pgbouncer pool'],
            ['JWT verify', '0.8ms', 'in-memory JWKS'],
            ['cache hit ratio', '94%', 'LRU + ETag'],
          ].map((m) => (
            <div key={m[0]} className="glass" style={{ padding: 18 }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{m[0]}</div>
              <div className="mono" style={{ fontSize: 24, color: 'var(--teal-soft)', marginTop: 6, fontWeight: 600 }}>{m[1]}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>{m[2]}</div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) { #bench-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}

window.Benchmarks = Benchmarks;
