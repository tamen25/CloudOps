// compliance.jsx — Security, Pipeline, OSS CTA, Footer

// ─── Security ───────────────────────────────────────────────────────────

const COMPLIANCE = [
  { k: 'SOC 2',       s: 'ready',    n: 'Type II controls mapped' },
  { k: 'ISO 27001',   s: 'ready',    n: 'Annex A controls in place' },
  { k: 'GDPR',        s: 'ready',    n: 'DPIA · Right to Erasure' },
  { k: 'HIPAA',       s: 'baa',      n: 'BAA required for PHI workloads' },
  { k: 'PCI-DSS',     s: 'oos',      n: 'Out of scope · Stripe tokenized' },
];

const DEFENSE = [
  { l: 'Edge',         t: 'WAF v2 · ALB · TLS 1.3',                  c: '#67e8f9' },
  { l: 'Network',      t: 'NetworkPolicy · PrivateLink · NACLs',     c: '#5eead4' },
  { l: 'Compute',      t: 'PSS Restricted · Gatekeeper · Cosign',    c: '#2dd4bf' },
  { l: 'Data',         t: 'RLS FORCE · KMS · Secrets rotation',      c: '#a78bfa' },
  { l: 'Observability',t: 'Audit logs · CloudTrail · GuardDuty',     c: '#fbbf24' },
];

function statusBadge(s) {
  if (s === 'ready') return { c: '#22c55e', icon: '✓', l: 'ready' };
  if (s === 'baa')   return { c: '#f59e0b', icon: '⚠', l: 'BAA needed' };
  if (s === 'oos')   return { c: '#ef4444', icon: '×', l: 'out of scope' };
  return { c: 'var(--fg-muted)', icon: '?', l: '' };
}

function Security() {
  return (
    <section id="security" style={{ position: 'relative', background: 'linear-gradient(180deg, transparent, rgba(20,28,45,0.4) 30%, transparent)' }}>
      <Bioluminescence count={8} />
      <div className="container">
        <SectionHead
          eyebrow="The Audit Trail"
          title="Security & Compliance"
          lede="What auditors ask about, mapped to where it lives in code."
        />
        <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 32 }} id="sec-grid">
          {/* Compliance matrix */}
          <div className="glass" style={{ padding: 32 }}>
            <Eyebrow>Compliance</Eyebrow>
            <h3 className="display" style={{ fontSize: 32, marginTop: 8, marginBottom: 24 }}>Audit-ready</h3>
            <div className="col gap-12">
              {COMPLIANCE.map((row, i) => {
                const b = statusBadge(row.s);
                return (
                  <div key={row.k} className="row gap-16" style={{
                    padding: '14px 18px', borderRadius: 12,
                    background: 'rgba(20,28,45,0.5)',
                    border: '1px solid var(--border-default)',
                    alignItems: 'center',
                    transition: 'all 0.2s',
                  }} data-hover>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${b.c}22`, color: b.c, border: `1px solid ${b.c}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      boxShadow: b.c === '#22c55e' ? `0 0 12px ${b.c}44` : 'none',
                    }}>{b.icon}</div>
                    <div className="col" style={{ flex: 1, gap: 2 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500 }}>{row.k}</span>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{row.n}</span>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: b.c, padding: '4px 10px', borderRadius: 4, background: `${b.c}15`, textTransform: 'uppercase', letterSpacing: 0.5 }}>{b.l}</span>
                  </div>
                );
              })}
            </div>
            <a className="btn ghost" href="#" onClick={(e) => e.preventDefault()} style={{ marginTop: 24 }}>
              View Security ADRs <span className="arr">↗</span>
            </a>
          </div>

          {/* Defense in depth */}
          <div className="glass" style={{ padding: 32 }}>
            <Eyebrow>Defense in Depth</Eyebrow>
            <h3 className="display" style={{ fontSize: 32, marginTop: 8, marginBottom: 24 }}>Five layers</h3>
            <div style={{ position: 'relative' }}>
              {DEFENSE.map((d, i) => (
                <div key={d.l} className="glass" style={{
                  padding: '18px 22px',
                  marginTop: i === 0 ? 0 : -10, // overlap stack
                  position: 'relative', zIndex: DEFENSE.length - i,
                  border: `1px solid ${d.c}33`,
                  background: `linear-gradient(180deg, rgba(20,28,45,0.85), rgba(20,28,45,0.6))`,
                  display: 'flex', alignItems: 'center', gap: 18,
                  transition: 'all 0.3s cubic-bezier(.2,.7,.3,1)',
                  cursor: 'pointer',
                }}
                  data-hover
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 32px ${d.c}33`; e.currentTarget.style.borderColor = `${d.c}99`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = `${d.c}33`; }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: d.c,
                    boxShadow: `0 0 12px ${d.c}`,
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500 }}>{d.l}</div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{d.t}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: d.c, opacity: 0.7 }}>L{i + 1}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) { #sec-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}

// ─── Pipeline ───────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { n: 'PR',       tool: 'GitHub PR', dur: '—',     rate: '—' },
  { n: 'Build',    tool: 'npm ci · tsc · next build', dur: '1.2m', rate: '99.1%' },
  { n: 'Sign',     tool: 'cosign sign --identity-token', dur: '14s', rate: '99.8%' },
  { n: 'Scan',     tool: 'trivy image --severity HIGH,CRITICAL', dur: '38s', rate: '97.2%' },
  { n: 'Approve',  tool: 'GitHub Environment · 1 reviewer', dur: '~3m', rate: '100%' },
  { n: 'Deploy',   tool: 'kubectl set image · rollout', dur: '52s', rate: '98.7%' },
  { n: 'Verify',   tool: 'rollout status · /healthz', dur: '8s', rate: '99.4%' },
  { n: 'Rollback', tool: 'kubectl rollout undo', dur: '~20s', rate: '—' },
];

function Pipeline() {
  const [hoveredIdx, setHoveredIdx] = React.useState(-1);
  const [ref, inView] = useInView();
  const [progress, setProgress] = React.useState(-1);
  React.useEffect(() => {
    if (!inView) return;
    let i = -1;
    const id = setInterval(() => {
      i++;
      setProgress(i);
      if (i >= PIPELINE_STAGES.length - 1) clearInterval(id);
    }, 320);
    return () => clearInterval(id);
  }, [inView]);

  return (
    <section id="pipeline" ref={ref} style={{ position: 'relative', background: 'rgba(8,14,28,0.4)' }}>
      <div className="container">
        <SectionHead
          eyebrow="Ship It"
          title="Approval gates. Digest-pinned. Zero-downtime."
          lede="Eight stages, all green, every time — or auto-rollback."
        />
        <div className="reveal glass" style={{ padding: 32, position: 'relative', overflow: 'visible' }}>
          <div style={{ position: 'relative', minHeight: 200 }}>
            {/* track */}
            <div style={{ position: 'absolute', top: 28, left: 28, right: 28, height: 2, background: 'rgba(94,234,212,0.12)', borderRadius: 1 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: progress >= 0 ? `${(Math.min(progress, PIPELINE_STAGES.length - 1) / (PIPELINE_STAGES.length - 1)) * 100}%` : '0%', background: 'linear-gradient(90deg, var(--teal), var(--teal-soft))', boxShadow: '0 0 8px var(--teal-glow)', transition: 'width 0.35s ease' }} />
            </div>
            {/* dots */}
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
              {PIPELINE_STAGES.map((s, i) => {
                const isActive = i <= progress;
                const isCurrent = i === progress;
                return (
                  <div key={s.n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, position: 'relative', cursor: 'pointer', flex: 1 }}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(-1)}
                    data-hover>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: isActive ? 'rgba(45,212,191,0.25)' : 'rgba(20,28,45,0.7)',
                      border: `1.5px solid ${isActive ? 'var(--teal)' : 'rgba(94,234,212,0.25)'}`,
                      boxShadow: isCurrent ? '0 0 20px var(--teal-glow)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isActive ? 'var(--teal-soft)' : 'var(--fg-faint)',
                      fontSize: 12,
                      transition: 'all 0.3s',
                    }}>
                      {isActive ? '✓' : '○'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: isActive ? 'var(--fg)' : 'var(--fg-muted)', whiteSpace: 'nowrap' }}>{s.n}</div>
                    {hoveredIdx === i && (
                      <div className="glass glass-strong" style={{
                        position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
                        padding: '12px 14px', minWidth: 240, zIndex: 20,
                        borderColor: 'var(--border-strong)',
                      }}>
                        <div className="display" style={{ fontSize: 16, marginBottom: 6 }}>{s.n}</div>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 6 }}>{s.tool}</div>
                        <div className="row gap-16" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          <span><span style={{ color: 'var(--fg-faint)' }}>dur:</span> <span style={{ color: 'var(--teal-soft)' }}>{s.dur}</span></span>
                          <span><span style={{ color: 'var(--fg-faint)' }}>pass:</span> <span style={{ color: '#22c55e' }}>{s.rate}</span></span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Code excerpt below */}
          <div className="code-block" style={{ marginTop: 64 }}>
            <div className="code-head">
              <div className="traffic"><span /><span /><span /></div>
              <span style={{ marginLeft: 8 }}>.github/workflows/app.yml</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--teal-soft)' }}>
                <span className="pulse-dot" style={{ width: 6, height: 6 }} /> last run · 4m 12s · ✓
              </span>
            </div>
            <pre style={{ fontSize: 12.5, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: `<span class="tok-key">name</span>: <span class="tok-str">app · deploy</span>
<span class="tok-key">on</span>:
  <span class="tok-key">push</span>: { <span class="tok-key">branches</span>: [<span class="tok-str">main</span>] }

<span class="tok-key">jobs</span>:
  <span class="tok-key">deploy</span>:
    <span class="tok-key">runs-on</span>: <span class="tok-str">ubuntu-latest</span>
    <span class="tok-key">needs</span>: [<span class="tok-str">build</span>, <span class="tok-str">sign</span>, <span class="tok-str">scan</span>, <span class="tok-str">approve</span>]
    <span class="tok-key">environment</span>: <span class="tok-str">production</span>  <span class="tok-com"># requires manual approval</span>
    <span class="tok-key">steps</span>:
      - <span class="tok-key">name</span>: <span class="tok-str">Rollout</span>
        <span class="tok-key">run</span>: |
          kubectl set image deploy/order-api \\
            api=$REGISTRY/order-api@$DIGEST    <span class="tok-com"># digest-pinned</span>
          kubectl rollout status deploy/order-api --timeout=5m
      - <span class="tok-key">name</span>: <span class="tok-str">Rollback on fail</span>
        <span class="tok-key">if</span>: <span class="tok-str">failure()</span>
        <span class="tok-key">run</span>: kubectl rollout undo deploy/order-api` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── OSS CTA ────────────────────────────────────────────────────────────

function OpenSource() {
  const [ref, inView] = useInView();
  const adrs = useCountUp(23, { duration: 1400, start: inView });
  const modules = useCountUp(89, { duration: 1600, start: inView });
  const loc = useCountUp(12, { duration: 1800, decimals: 1, start: inView });
  return (
    <section id="oss" ref={ref} style={{
      position: 'relative', overflow: 'hidden',
      minHeight: '85vh',
      display: 'flex', alignItems: 'center',
      padding: '120px 0',
      background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(45,212,191,0.08), transparent 60%)',
    }}>
      <Bioluminescence count={28} />
      {/* horizon glow */}
      <div style={{ position: 'absolute', bottom: -100, left: 0, right: 0, height: 240, background: 'radial-gradient(ellipse 60% 100% at 50% 100%, var(--horizon), transparent 70%)', opacity: 0.5, pointerEvents: 'none' }} />
      <div className="container" style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <div className="reveal" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 96, height: 96, borderRadius: 24, border: '1.5px solid var(--border-strong)', background: 'rgba(20,28,45,0.6)', backdropFilter: 'blur(12px)', boxShadow: '0 0 48px var(--teal-glow)' }}>
          <svg viewBox="0 0 24 24" style={{ width: 48, height: 48, fill: 'var(--teal-soft)' }}>
            <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
          </svg>
        </div>
        <h2 className="display display-grad reveal reveal-delay-1" style={{ fontSize: 'clamp(48px, 7vw, 88px)', fontWeight: 700, marginTop: 32, marginBottom: 20, letterSpacing: '-0.03em' }}>
          100% Open Source
        </h2>
        <p className="reveal reveal-delay-2" style={{ fontSize: 19, color: 'var(--fg-muted)', maxWidth: 620, margin: '0 auto 56px', lineHeight: 1.55 }}>
          Every line. Every ADR. Every workflow. Built as a technical portfolio, shared as a learning resource.
        </p>
        <div className="reveal reveal-delay-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, maxWidth: 720, margin: '0 auto 56px' }} id="oss-stats">
          {[
            ['ADRs',              adrs, ''],
            ['Terraform modules', modules, ''],
            ['lines of code',     loc, 'k'],
          ].map(([l, v, suf]) => (
            <div key={l}>
              <div className="mono text-glow" style={{ fontSize: 'clamp(40px, 5vw, 56px)', fontWeight: 600, color: 'var(--teal)', lineHeight: 1 }}>{v}{suf}</div>
              <div className="mono" style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{l}</div>
            </div>
          ))}
        </div>
        <a className="btn primary reveal reveal-delay-3" href="https://github.com" style={{ fontSize: 16, padding: '18px 36px' }}>
          View on GitHub <span className="arr">→</span>
        </a>
      </div>
      <style>{`
        @media (max-width: 700px) {
          #oss-stats { grid-template-columns: 1fr !important; gap: 20px !important; }
        }
      `}</style>
    </section>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer style={{
      position: 'relative', zIndex: 2,
      padding: '64px 0 40px',
      borderTop: '1px solid var(--border-default)',
      background: 'rgba(5,8,22,0.5)',
    }}>
      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48 }} id="footer-grid">
          <div className="col gap-12" style={{ maxWidth: 360 }}>
            <div className="row" style={{ alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, var(--teal), #0891b2)',
                color: '#06121f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                boxShadow: '0 0 18px var(--teal-glow)',
              }}>▲</div>
              <span className="display" style={{ fontSize: 20, fontWeight: 600 }}>CloudOps</span>
            </div>
            <p style={{ color: 'var(--fg-muted)', fontSize: 14, lineHeight: 1.6 }}>
              Multi-tenant SaaS reference architecture. Production-grade patterns on AWS + Kubernetes — open source as a learning resource.
            </p>
            <div className="row gap-8" style={{ marginTop: 4 }}>
              {['gh', 'in', 'tw'].map((s) => (
                <a key={s} href="#" onClick={(e) => e.preventDefault()} data-hover style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: '1px solid var(--border-default)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', fontSize: 11,
                  textDecoration: 'none', transition: 'all 0.2s',
                }}>{s}</a>
              ))}
            </div>
          </div>
          {[
            ['Docs', ['API Reference', 'Architecture', 'Runbooks', 'Migrations']],
            ['Resources', ['GitHub', 'ADRs', 'Changelog', 'Status']],
            ['Legal', ['Privacy', 'Terms', 'Security', 'License (MIT)']],
          ].map(([h, items]) => (
            <div key={h} className="col gap-10">
              <div className="label-eyebrow">{h}</div>
              {items.map((i) => (
                <a key={i} href="#" onClick={(e) => e.preventDefault()} data-hover style={{
                  color: 'var(--fg-muted)', fontSize: 14, textDecoration: 'none', transition: 'color 0.15s',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--teal-soft)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-muted)'; }}>{i}</a>
              ))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 56, paddingTop: 24, borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="mono" style={{ fontSize: 12, color: 'var(--fg-faint)' }}>© 2026 CloudOps · Built with Next.js, EKS, and ☕</div>
          <div className="row gap-8">
            {['Next.js 15', 'EKS 1.28', 'TypeScript', 'Postgres 16'].map((t) => (
              <span key={t} className="pill" style={{ fontSize: 10 }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) { #footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; } }
        @media (max-width: 600px) { #footer-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </footer>
  );
}

window.Security = Security;
window.Pipeline = Pipeline;
window.OpenSource = OpenSource;
window.Footer = Footer;
