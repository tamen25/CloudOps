// effects.jsx — particle bg, custom cursor, scroll handlers, shared primitives
// All effects boot on DOMContentLoaded and live for the page lifetime.

// ─── Hide splash once first paint settles ───────────────────────────────
window.addEventListener('load', () => { setTimeout(hideSplashCO, 600); });
function hideSplashCO() {
  const s = document.getElementById('splash');
  if (s) s.classList.add('hide');
}
if (document.readyState === 'complete') setTimeout(hideSplashCO, 500);
// Safety: always hide after 4s.
setTimeout(hideSplashCO, 4000);

// ─── Particle network bg (hashgraphvc-inspired) ─────────────────────────
(function initParticles() {
  if (typeof document === 'undefined') return;
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let mouse = { x: -9999, y: -9999, active: false };
  let scrollY = 0;
  const PCOUNT = Math.min(110, Math.floor(window.innerWidth / 14));
  const particles = [];

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; });
  window.addEventListener('mouseleave', () => { mouse.active = false; });
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

  for (let i = 0; i < PCOUNT; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -Math.random() * 0.15 - 0.04, // drift upward
      r: Math.random() * 1.5 + 0.5,
      glow: Math.random() > 0.85, // some are brighter "bioluminescent"
      phase: Math.random() * Math.PI * 2,
    });
  }

  function tick(t) {
    ctx.clearRect(0, 0, W, H);
    // slight overall vignette darkening at bottom for ocean depth
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(10,14,39,0)');
    grad.addColorStop(1, 'rgba(5,8,22,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // update + draw particles
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      p.phase += 0.012;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;

      // mouse repel + attract glow
      if (mouse.active) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 14400) {
          const d = Math.sqrt(d2) || 1;
          p.x += (dx / d) * 0.4;
          p.y += (dy / d) * 0.4;
        }
      }
      const flicker = 0.5 + Math.sin(p.phase) * 0.5;
      const alpha = p.glow ? 0.45 + flicker * 0.35 : 0.22 + flicker * 0.12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.glow
        ? `rgba(94, 234, 212, ${alpha})`
        : `rgba(140, 180, 220, ${alpha * 0.7})`;
      ctx.shadowBlur = p.glow ? 12 : 0;
      ctx.shadowColor = 'rgba(45,212,191,0.7)';
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // connect nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 12000) {
          const d = Math.sqrt(d2);
          const op = (1 - d / 110) * 0.18;
          ctx.strokeStyle = `rgba(94, 234, 212, ${op})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

// ─── Custom cursor ──────────────────────────────────────────────────────
(function initCursor() {
  if (typeof document === 'undefined') return;
  if (!matchMedia('(hover: hover)').matches) return;
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;
  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  let rx = x, ry = y;
  window.addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; });
  function tick() {
    rx += (x - rx) * 0.18;
    ry += (y - ry) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // hover hooks via event delegation
  const HOVER_SEL = 'a, button, .btn, [data-hover], .feature-card, .api-tab, .panel-indicator, .rail-dot, .service-icon';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest && e.target.closest(HOVER_SEL)) document.documentElement.classList.add('cursor-hover');
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest(HOVER_SEL)) document.documentElement.classList.remove('cursor-hover');
  });

  // Click ripple — emit a quick ring at click pos
  document.addEventListener('click', (e) => {
    const r = document.createElement('div');
    r.className = 'click-ring';
    r.style.left = e.clientX + 'px';
    r.style.top = e.clientY + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 600);
  });
})();

// ─── Scroll progress + navbar + reveal-on-scroll ────────────────────────
(function initScroll() {
  const bar = document.getElementById('scroll-progress');
  const nav = document.getElementById('navbar');
  const rail = document.getElementById('section-rail');

  let ticking = false;
  function update() {
    const sy = window.scrollY;
    const dh = (document.documentElement.scrollHeight - window.innerHeight) || 1;
    const pct = Math.min(1, sy / dh);
    if (bar) bar.style.width = (pct * 100) + '%';
    if (nav) nav.classList.toggle('visible', sy > window.innerHeight * 0.85);
    if (rail) rail.classList.toggle('visible', sy > window.innerHeight * 0.85);

    // active rail dot
    if (rail) {
      const dots = rail.querySelectorAll('.rail-dot');
      let active = -1;
      dots.forEach((d, i) => {
        const id = d.dataset.target;
        const el = id && document.getElementById(id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.55) active = i;
      });
      dots.forEach((d, i) => d.classList.toggle('active', i === active));
    }
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();

  // Reveal-on-scroll: scroll handler in JS adds .is-visible. The CSS-only
  // fallback already animates everything on first paint, so this is just
  // a no-op in environments without scroll events.
  function checkReveals() {
    const vh = window.innerHeight;
    document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh - 40 && r.bottom > 0) {
        el.classList.add('is-visible');
      }
    });
  }
  let lastCheck = 0;
  function onScrollCheck() {
    const t = performance.now();
    if (t - lastCheck < 80) return;
    lastCheck = t;
    requestAnimationFrame(checkReveals);
  }
  window.addEventListener('scroll', onScrollCheck, { passive: true });
  checkReveals();
  setTimeout(checkReveals, 80);
  setTimeout(checkReveals, 400);
  setTimeout(checkReveals, 1200);
  window._attachReveal = checkReveals;
})();

// ─── Smooth-scroll handler for nav links ────────────────────────────────
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 12, behavior: 'smooth' });
});

// ─── Build the section rail (called by App after mount) ─────────────────
window.__buildRail = function buildRail(sections) {
  const rail = document.getElementById('section-rail');
  if (!rail) return;
  rail.innerHTML = '';
  sections.forEach(([id, label]) => {
    const d = document.createElement('div');
    d.className = 'rail-dot';
    d.dataset.target = id;
    d.dataset.label = label;
    d.setAttribute('aria-label', label);
    d.onclick = () => {
      const el = document.getElementById(id);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 12, behavior: 'smooth' });
    };
    rail.appendChild(d);
  });
};

// ─── Shared React hooks/components ──────────────────────────────────────
function useScrollY() {
  const [y, setY] = React.useState(0);
  React.useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return y;
}

function useMouseParallax(strength = 1) {
  const [d, setD] = React.useState({ x: 0, y: 0 });
  React.useEffect(() => {
    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setD({ x: x * strength, y: y * strength });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [strength]);
  return d;
}

function useInView(opts = {}) {
  const ref = React.useRef(null);
  const [v, setV] = React.useState(false);
  React.useEffect(() => {
    if (!ref.current || v) return;
    const threshold = opts.threshold ?? 0.12;
    let alive = true;
    function check() {
      if (!alive || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const visible = Math.max(0, Math.min(vh, r.bottom) - Math.max(0, r.top));
      const target = Math.min(r.height * threshold, vh * threshold);
      if (visible > target) {
        setV(true);
        alive = false;
        window.removeEventListener('scroll', check);
        clearInterval(pollId);
      }
    }
    window.addEventListener('scroll', check, { passive: true });
    // Safety: poll every 250ms in environments that don't fire scroll events
    const pollId = setInterval(check, 250);
    check();
    return () => { alive = false; window.removeEventListener('scroll', check); clearInterval(pollId); };
  }, [v]);
  return [ref, v];
}

function useCountUp(target, { duration = 1400, decimals = 0, start = false } = {}) {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    if (!start) return;
    let raf, startT;
    const step = (t) => {
      if (!startT) startT = t;
      const p = Math.min(1, (t - startT) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return val.toFixed(decimals);
}

function Eyebrow({ children, style }) {
  return <div className="label-eyebrow" style={style}>{children}</div>;
}

function SectionHead({ eyebrow, title, lede, align = 'center' }) {
  return (
    <div className="section-head reveal" style={{ alignItems: align === 'left' ? 'flex-start' : 'center', textAlign: align }}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="display display-grad display-title">{title}</h2>
      {lede && <p className="lede">{lede}</p>}
    </div>
  );
}

// Bioluminescent floating dots inside a section
function Bioluminescence({ count = 14, area }) {
  const dots = React.useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: Math.random() * 100,
    delay: Math.random() * 18,
    dur: 12 + Math.random() * 14,
    size: 2 + Math.random() * 3,
  })), [count]);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {dots.map((d, i) => (
        <div key={i} className="biolum" style={{
          left: d.x + '%', bottom: -10,
          width: d.size, height: d.size,
          animationDuration: d.dur + 's',
          animationDelay: -d.delay + 's',
        }} />
      ))}
    </div>
  );
}

// Section divider — layered wave SVG. Flip via `flip` to ripple from below.
function WaveDivider({ flip = false, color = 'rgba(45,212,191,0.06)', height = 80 }) {
  return (
    <div style={{
      position: 'relative', height, width: '100%',
      overflow: 'hidden', pointerEvents: 'none',
      transform: flip ? 'scaleY(-1)' : 'none',
      zIndex: 2,
    }} aria-hidden="true">
      <svg viewBox="0 0 1440 80" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id="waveTop" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(45,212,191,0)" />
            <stop offset="50%" stopColor="rgba(45,212,191,0.4)" />
            <stop offset="100%" stopColor="rgba(45,212,191,0)" />
          </linearGradient>
        </defs>
        <path d="M0 40 Q 360 10, 720 40 T 1440 40 L 1440 80 L 0 80 Z" fill={color} />
        <path d="M0 50 Q 360 25, 720 50 T 1440 50 L 1440 80 L 0 80 Z" fill={color} opacity="0.6" />
        <path d="M0 40 Q 360 10, 720 40 T 1440 40" fill="none" stroke="url(#waveTop)" strokeWidth="1" opacity="0.6" />
      </svg>
    </div>
  );
}

// Section number marker — floating index used at the top of major sections
function SectionMarker({ n, label }) {
  return (
    <div className="reveal" style={{
      display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 24,
      padding: '6px 14px 6px 8px', borderRadius: 999,
      background: 'var(--bg-glass)', backdropFilter: 'blur(8px)',
      border: '1px solid var(--border-soft)',
    }}>
      <span className="mono" style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: '50%',
        background: 'var(--teal-faint)', color: 'var(--teal-soft)',
        fontSize: 11, fontWeight: 700,
      }}>{n}</span>
      <span className="mono" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--fg-muted)' }}>{label}</span>
    </div>
  );
}

// Live metric "tickers" — fake updates on an interval
function useTicker(baseValue, range, intervalMs = 4000) {
  const [v, setV] = React.useState(baseValue);
  React.useEffect(() => {
    const id = setInterval(() => {
      const next = baseValue + (Math.random() - 0.5) * 2 * range;
      setV(next);
    }, intervalMs);
    return () => clearInterval(id);
  }, [baseValue, range, intervalMs]);
  return v;
}

// Export to window so other files can use
Object.assign(window, {
  useScrollY, useMouseParallax, useInView, useCountUp, useTicker,
  Eyebrow, SectionHead, Bioluminescence, WaveDivider, SectionMarker,
});
