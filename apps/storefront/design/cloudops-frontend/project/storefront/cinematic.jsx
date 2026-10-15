// storefront/cinematic.jsx — particle canvas + splash hide + click ripple
// Layered behind the entire page. Activates regardless of scroll-event support.

// ─── Hide splash ────────────────────────────────────────────────────────
(function() {
  const KEY = 'cloudops:splash-seen';
  const splash = document.getElementById('splash');
  if (!splash) return;

  // Returning visitors skip the splash entirely.
  if (sessionStorage.getItem(KEY)) {
    splash.remove();
    return;
  }

  splash.hidden = false;
  function hide() {
    splash.classList.add('hide');
    try { sessionStorage.setItem(KEY, '1'); } catch (_) {}
  }
  if (document.readyState === 'complete') setTimeout(hide, 500);
  else window.addEventListener('load', () => setTimeout(hide, 600));
  setTimeout(hide, 3500); // safety
})();

// ─── Particle network background ────────────────────────────────────────
(function initParticles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let mouse = { x: -9999, y: -9999, active: false };
  const COUNT = Math.min(95, Math.floor(window.innerWidth / 16));
  const parts = [];

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; });
  window.addEventListener('mouseleave', () => mouse.active = false);

  for (let i = 0; i < COUNT; i++) {
    parts.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.16,
      vy: -Math.random() * 0.12 - 0.03,
      r: Math.random() * 1.4 + 0.5,
      glow: Math.random() > 0.86,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function tick() {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy;
      p.phase += 0.012;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (mouse.active) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 14400) {
          const d = Math.sqrt(d2) || 1;
          p.x += (dx / d) * 0.5;
          p.y += (dy / d) * 0.5;
        }
      }
      const flicker = 0.5 + Math.sin(p.phase) * 0.5;
      const alpha = p.glow ? 0.4 + flicker * 0.35 : 0.18 + flicker * 0.1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.glow ? `rgba(94, 234, 212, ${alpha})` : `rgba(140, 180, 220, ${alpha * 0.7})`;
      ctx.shadowBlur = p.glow ? 12 : 0;
      ctx.shadowColor = 'rgba(45,212,191,0.7)';
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // connect nearby
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 11000) {
          const d = Math.sqrt(d2);
          const op = (1 - d / 105) * 0.16;
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

// ─── Click ripple ───────────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  if (e.button !== 0) return;
  const target = e.target.closest('a, button, .btn, [role="button"]');
  if (!target) return;
  const r = document.createElement('div');
  r.className = 'click-ring';
  r.style.left = e.clientX + 'px';
  r.style.top = e.clientY + 'px';
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 600);
});

// ─── Mouse parallax hook (shared) ───────────────────────────────────────
function useMouseParallax(strength = 8) {
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

window.useMouseParallax = useMouseParallax;
