// storefront/effects.jsx — scroll progress, reveal, shared helpers
// Works in real browsers AND throttled iframes (CSS-only reveal animation
// runs on first paint; scroll-driven progress bar uses scroll + setInterval
// poll fallback).

(function initScrollProgress() {
  const bar = document.getElementById('scroll-progress');
  if (!bar) return;
  function update() {
    const sy = window.scrollY;
    const dh = document.documentElement.scrollHeight - window.innerHeight;
    const pct = dh > 0 ? Math.min(1, sy / dh) : 0;
    bar.style.width = (pct * 100).toFixed(2) + '%';
  }
  window.addEventListener('scroll', update, { passive: true });
  // Polling fallback for throttled environments
  setInterval(update, 250);
  update();
})();

// Section eyebrow factory — used by every section
function SectionEyebrow({ n, label, anchor }) {
  return (
    <div className="eyebrow section-eyebrow reveal" id={anchor}>
      <span className="e-tag">S{String(n).padStart(2, '0')}</span>
      <span style={{ color: 'var(--fg-subtle)' }}>·</span>
      <span>{label}</span>
    </div>
  );
}

// Connector hairline between sections
function Connector() {
  return <div className="connector" aria-hidden="true" />;
}

// In-view hook (poll-based, robust)
function useInView(opts = {}) {
  const ref = React.useRef(null);
  const [v, setV] = React.useState(false);
  React.useEffect(() => {
    if (!ref.current || v) return;
    const threshold = opts.threshold ?? 0.15;
    let alive = true;
    function check() {
      if (!alive || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const visible = Math.max(0, Math.min(vh, r.bottom) - Math.max(0, r.top));
      if (visible > Math.min(r.height * threshold, vh * threshold)) {
        setV(true); alive = false;
        window.removeEventListener('scroll', check);
        clearInterval(id);
      }
    }
    window.addEventListener('scroll', check, { passive: true });
    const id = setInterval(check, 250);
    check();
    return () => { alive = false; window.removeEventListener('scroll', check); clearInterval(id); };
  }, [v]);
  return [ref, v];
}

function useCountUp(target, { duration = 1400, decimals = 0, start = false } = {}) {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    if (!start) return;
    // Respect reduced-motion: skip animation entirely
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(target); return;
    }
    let raf, t0;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return val.toFixed(decimals);
}

Object.assign(window, { SectionEyebrow, Connector, useInView, useCountUp });
