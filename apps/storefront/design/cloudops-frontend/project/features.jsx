// features.jsx — 9-card glass grid

const FEATURES = [
  {
    icon: 'auth',
    title: 'Cognito Auth',
    body: 'PKCE flow, JWT verify, custom:tenant_id, HttpOnly cookies.',
    tag: 'apps/storefront/lib/auth.ts',
  },
  {
    icon: 'cycle',
    title: 'Idempotency',
    body: 'Stripe-style keys, 24h replay window, payload hash, 409 on conflict.',
    tag: 'apps/order-api/middleware/idempotency.ts',
  },
  {
    icon: 'saga',
    title: 'Checkout Saga',
    body: 'Step Functions Standard. Inventory reserve, compensate on fail.',
    tag: 'infra/step-functions/checkout.asl.json',
  },
  {
    icon: 'broadcast',
    title: 'WebSocket Fanout',
    body: 'API Gateway + Lambda, Kinesis trigger, Dynamo registry, live updates.',
    tag: 'apps/ws-fanout/handler.ts',
  },
  {
    icon: 'image',
    title: 'Image Resize',
    body: 'S3 trigger, Sharp, 3 sizes, CloudFront CDN, immutable cache.',
    tag: 'apps/image-resize/index.ts',
  },
  {
    icon: 'search',
    title: 'Search Gateway',
    body: 'Lambda@VPC, LRU cache, HMAC, full-text via Postgres tsvector.',
    tag: 'apps/search-gateway/handler.ts',
  },
  {
    icon: 'audit',
    title: 'Audit Log',
    body: 'Every action, tenant-scoped, immutable, RLS FORCE-mode.',
    tag: 'migrations/008_audit.sql',
  },
  {
    icon: 'shield',
    title: 'NetworkPolicy',
    body: 'Default-deny. AWS VPC CNI eBPF. Explicit allow lists per pod.',
    tag: 'kustomize/policies/netpol-default-deny.yaml',
  },
  {
    icon: 'drift',
    title: 'Drift Detection',
    body: 'Per-env, per-stack, auto-issue creation, drift labels.',
    tag: '.github/workflows/drift.yml',
  },
];

function FeatureIcon({ name }) {
  const s = { width: 28, height: 28, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'auth': return (
      <svg viewBox="0 0 24 24" {...s}>
        <rect x="5" y="10" width="14" height="10" rx="2"/>
        <path d="M 8 10 V 7 a 4 4 0 0 1 8 0 V 10"/>
        <circle cx="12" cy="15" r="1.5" fill="currentColor"/>
      </svg>
    );
    case 'cycle': return (
      <svg viewBox="0 0 24 24" {...s}>
        <path d="M 4 12 a 8 8 0 0 1 14 -5 M 18 7 V 4 M 18 7 H 15"/>
        <path d="M 20 12 a 8 8 0 0 1 -14 5 M 6 17 V 20 M 6 17 H 9"/>
      </svg>
    );
    case 'saga': return (
      <svg viewBox="0 0 24 24" {...s}>
        <rect x="3" y="9" width="6" height="6" rx="1"/>
        <rect x="15" y="9" width="6" height="6" rx="1"/>
        <path d="M 9 12 H 15"/>
        <path d="M 12 5 V 9 M 12 15 V 19"/>
      </svg>
    );
    case 'broadcast': return (
      <svg viewBox="0 0 24 24" {...s}>
        <circle cx="12" cy="12" r="2" fill="currentColor"/>
        <path d="M 7 7 a 7 7 0 0 0 0 10 M 17 7 a 7 7 0 0 1 0 10"/>
        <path d="M 4 4 a 11 11 0 0 0 0 16 M 20 4 a 11 11 0 0 1 0 16"/>
      </svg>
    );
    case 'image': return (
      <svg viewBox="0 0 24 24" {...s}>
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <circle cx="9" cy="11" r="2"/>
        <path d="M 3 17 L 9 12 L 14 16 L 21 9"/>
      </svg>
    );
    case 'search': return (
      <svg viewBox="0 0 24 24" {...s}>
        <circle cx="11" cy="11" r="6"/>
        <path d="M 15.5 15.5 L 20 20"/>
      </svg>
    );
    case 'audit': return (
      <svg viewBox="0 0 24 24" {...s}>
        <rect x="5" y="3" width="14" height="18" rx="2"/>
        <path d="M 8 8 H 16 M 8 12 H 16 M 8 16 H 13"/>
      </svg>
    );
    case 'shield': return (
      <svg viewBox="0 0 24 24" {...s}>
        <path d="M 12 3 L 20 6 V 12 Q 20 18 12 21 Q 4 18 4 12 V 6 Z"/>
        <path d="M 9 12 L 11 14 L 15 10"/>
      </svg>
    );
    case 'drift': return (
      <svg viewBox="0 0 24 24" {...s}>
        <path d="M 4 14 L 9 9 L 13 13 L 20 6"/>
        <path d="M 15 6 H 20 V 11"/>
      </svg>
    );
    default: return null;
  }
}

function Features() {
  return (
    <section id="features" style={{ position: 'relative' }}>
      <div className="container">
        <SectionHead
          eyebrow="What's Inside"
          title="Nine things we got right"
          lede="The patterns that make this production-grade. Each card links to the line of code that implements it."
        />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
        }}>
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} delay={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, delay }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div className="feature-card glass reveal" style={{
      padding: '28px 24px 24px',
      display: 'flex', flexDirection: 'column', gap: 14,
      transition: 'all 0.3s cubic-bezier(.2,.7,.3,1)',
      transform: hover ? 'translateY(-4px)' : 'translateY(0)',
      borderColor: hover ? 'var(--border-strong)' : 'var(--border-default)',
      transitionDelay: (delay * 60) + 'ms',
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden',
    }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
       data-hover>
      {/* corner accent */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 80, height: 80,
        background: 'radial-gradient(circle at top right, var(--teal-faint), transparent 70%)',
        opacity: hover ? 1 : 0.5, transition: 'opacity 0.3s', pointerEvents: 'none',
      }} />
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'var(--teal-faint)',
        border: '1px solid var(--border-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--teal)',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 0 20px var(--teal-glow)' : 'none',
        transition: 'all 0.3s',
      }}>
        <FeatureIcon name={feature.icon} />
      </div>
      <h3 className="display" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--fg-bright)' }}>{feature.title}</h3>
      <p style={{ fontSize: 14.5, color: 'var(--fg-muted)', lineHeight: 1.55, margin: 0 }}>{feature.body}</p>
      <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid rgba(94,234,212,0.08)' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feature.tag}</span>
        <span className="mono" style={{ fontSize: 12, color: hover ? 'var(--teal-soft)' : 'var(--teal)', flexShrink: 0, position: 'relative' }}>
          view code
          <span style={{ position: 'absolute', left: 0, right: hover ? 0 : '100%', bottom: -2, height: 1, background: 'var(--teal-soft)', transition: 'right 0.3s' }} />
        </span>
      </div>
    </div>
  );
}

window.Features = Features;
