// storefront/cta.jsx — S8 closing band + Footer

function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border-muted)',
      padding: '48px 0 32px',
      background: 'rgba(13,17,23,0.7)',
      position: 'relative', zIndex: 1,
    }}>
      <div className="container">
        <div className="footer-grid" style={{
          display: 'grid', gridTemplateColumns: '1.6fr repeat(3, 1fr)', gap: 32,
        }}>
          <div className="col" style={{ gap: 12, maxWidth: 360 }}>
            <div className="row items-center" style={{ gap: 10 }}>
              <span className="mark" style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))',
                color: '#06181c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13,
              }}>▲</span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>CloudOps Storefront</span>
            </div>
            <p style={{ color: 'var(--fg-muted)', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
              A reference platform for multi-tenant SaaS on AWS + Kubernetes. Open source · MIT.
              Built in public, torn down at midnight.
            </p>
          </div>
          {[
            ['Platform',  ['Overview', 'Architecture', 'Pipeline', 'Security']],
            ['Resources', ['ADRs', 'Runbooks', 'CLAUDE.md', 'Changelog']],
            ['Project',   ['GitHub', 'Issues', 'Contributing', 'License']],
          ].map(([h, items]) => (
            <div key={h} className="col" style={{ gap: 8 }}>
              <div className="mono" style={{ fontSize: 10.5, letterSpacing: '0.14em', color: 'var(--fg-subtle)', textTransform: 'uppercase', marginBottom: 6 }}>{h}</div>
              {items.map((i) => (
                <a key={i} href="#" className="footer-link" style={{
                  color: 'var(--fg-muted)', fontSize: 13.5, textDecoration: 'none',
                  padding: '2px 0', transition: 'color 0.15s',
                }}>{i}</a>
              ))}
            </div>
          ))}
        </div>
        <div className="row between items-center" style={{
          marginTop: 40, paddingTop: 20,
          borderTop: '1px solid var(--border-muted)',
          flexWrap: 'wrap', gap: 12,
        }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
            © 2026 CloudOps · MIT · built with Next.js 15 + EKS
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
            last deploy <span style={{ color: 'var(--brand-400)' }}>a4f2c91</span> · 2h ago
          </span>
        </div>
      </div>
      <style>{`
        .footer-link:hover { color: var(--brand-400) !important; }
        @media (max-width: 900px) { .footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; } }
        @media (max-width: 540px) { .footer-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </footer>
  );
}

function CTABand() {
  const [ref, inView] = useInView({ threshold: 0.2 });
  const adrs = useCountUp(23,   { duration: 1400, start: inView });
  const tfm  = useCountUp(89,   { duration: 1600, start: inView });
  const loc  = useCountUp(12.4, { duration: 1800, decimals: 1, start: inView });
  return (
    <section id="cta" ref={ref} style={{ paddingTop: 80, paddingBottom: 100, position: 'relative', overflow: 'hidden' }}>
      {/* Background motifs — quieter echo of hero */}
      <div className="line-grid" style={{
        position: 'absolute', inset: 0, opacity: 0.35,
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 80%)',
      }} aria-hidden="true" />
      <div className="hero-orb" style={{ bottom: -200, right: '12%', width: 460, height: 460, opacity: 0.4 }} aria-hidden="true" />
      <div className="noise" aria-hidden="true" />

      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        <SectionEyebrow n={8} label="100% open source · MIT" />
        <h2 className="display-italic reveal" style={{
          fontSize: 'clamp(48px, 6.5vw, 84px)',
          margin: 0, color: 'var(--fg-base)', maxWidth: 1000,
          lineHeight: 1.02,
        }}>
          Read it. Run it. Tear it{' '}
          <span style={{
            background: 'linear-gradient(180deg, var(--brand-300), var(--brand-500))',
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>down before midnight.</span>
        </h2>
        <p className="reveal reveal-1" style={{
          color: 'var(--fg-muted)', fontSize: 18, marginTop: 24, maxWidth: 620, lineHeight: 1.55,
        }}>
          A one-command bring-up. An idle cost of about twenty cents an hour. An overnight
          teardown that ships green every morning.
        </p>

        <div className="cta-stats reveal reveal-2" style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
          marginTop: 56, maxWidth: 760,
        }}>
          {[
            { v: adrs, suf: '',  l: 'ADRs',             href: '#' },
            { v: tfm,  suf: '',  l: 'Terraform modules',href: '#' },
            { v: loc,  suf: 'k', l: 'lines of code',    href: '#' },
          ].map((s) => (
            <a key={s.l} href={s.href} className="surface cta-stat" style={{
              padding: '22px 24px',
              textDecoration: 'none', color: 'inherit',
              transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
            }}>
              <div className="display-italic" style={{
                fontSize: 'clamp(40px, 5vw, 60px)', color: 'var(--brand-400)', lineHeight: 1,
              }}>
                {s.v}{s.suf}
              </div>
              <div className="mono" style={{
                marginTop: 8, fontSize: 11, color: 'var(--fg-subtle)',
                letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>{s.l}</div>
            </a>
          ))}
        </div>

        <div className="row gap-3 reveal reveal-3" style={{ marginTop: 48, flexWrap: 'wrap' }}>
          <a className="btn btn-primary" href="https://github.com">
            View on GitHub <span className="arr">↗</span>
          </a>
          <a className="btn btn-ghost" href="#">
            Read the ADRs <span className="arr">→</span>
          </a>
          <a className="btn btn-ghost" href="#">
            Bring-up runbook <span className="arr">→</span>
          </a>
        </div>
      </div>
      <style>{`
        .cta-stat:hover { border-color: rgba(94,234,212,0.45) !important; transform: translateY(-3px); box-shadow: 0 14px 32px -16px rgba(0,0,0,0.5), 0 0 22px -8px rgba(45,212,191,0.3); }
        @media (max-width: 720px) { .cta-stats { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}

window.CTABand = CTABand;
window.Footer = Footer;
