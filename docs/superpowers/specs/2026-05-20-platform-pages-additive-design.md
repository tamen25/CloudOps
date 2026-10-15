# Platform Pages — Additive Design

**Date:** 2026-05-20
**Status:** Draft (awaiting user review)
**Source:** Claude Design bundle `cloudops-frontend` (CloudOps Platform v2) — extracted into `apps/storefront/design/cloudops-frontend/`

---

## 0. Mission

Add a 3-page platform-engineering showcase **on top of** the existing CloudOps Shop storefront. The new pages — `/platform`, `/architecture`, `/pipeline` — surface what the underlying AWS + EKS + Postgres + Step Functions infrastructure looks like, using the same CloudOps Dim design system that already ships.

**This is not a redesign.** The existing storefront (`/products`, `/cart`, `/checkout`, `/orders`, `/admin`, `/login`, `/design`, `/privacy`, `/cookies`, `/auth`) stays exactly as it is. The home page (`/`) gets one new band stacked **above** the existing `<Hero />`, with the existing hero unchanged below it.

The Anthropic design bundle's CSS tokens are byte-identical to `apps/storefront/src/styles/tokens.css` — same `#0d1117` base, same `#2dd4bf` brand teal, same Inter + JetBrains Mono. The only typography addition is **Instrument Serif** (italic) for editorial moments.

---

## 1. Hard constraints

### What does NOT change
- `apps/storefront/src/styles/tokens.css` — left untouched
- `apps/storefront/src/components/site/Footer.tsx` — internals untouched; only data passed in may change to point new "Platform" links at the new routes
- `apps/storefront/src/components/site/ServiceTile.tsx`, `ProductCard.tsx`, `ProductGrid.tsx`, `SearchBar.tsx`, `Pagination.tsx`, `AddToCartButton.tsx`, `CartView.tsx`, `CheckoutButton.tsx`, `OrderStatusPill.tsx`, `PrivacyActions.tsx`
- `apps/storefront/src/components/site/Hero.tsx` — kept verbatim on home page, just no longer the topmost section
- `apps/storefront/src/components/site/TechStack.tsx`, `FeatureGrid.tsx`, `CallToAction.tsx` — kept on home page
- All API routes under `apps/storefront/src/app/api/`
- All commerce pages (`/products`, `/cart`, `/checkout`, `/orders`, `/admin`)
- Legal + auth pages (`/login`, `/privacy`, `/cookies`, `/auth`, `/design`)
- The `apps/order-api/` backend in full

### What is touched
- `apps/storefront/src/app/layout.tsx` — adds Instrument Serif via `next/font/google`; mounts `<ScrollProgress />` client component
- `apps/storefront/src/components/site/Navbar.tsx` — restructured into two clusters (commerce | platform) with a hairline separator; brand text changed from "CloudOps Shop" to "CloudOps"
- `apps/storefront/src/app/page.tsx` — adds new `<PlatformHero />` band **above** `<Hero />`; nothing else removed or reordered
- `apps/storefront/src/styles/globals.css` — adds `.display-italic`, `.line-grid`, `.surface-glow`, `.font-display`, `@keyframes packet-flow`, `@keyframes pulse-line-draw`. No existing rule removed.
- New routes added at `apps/storefront/src/app/platform/page.tsx`, `apps/storefront/src/app/architecture/page.tsx`, `apps/storefront/src/app/pipeline/page.tsx`

### Tech rules (unchanged from existing storefront)
- Next.js 15 App Router, React 19, RSC by default
- Tailwind v4 with `@theme` tokens from `tokens.css` — no arbitrary `[box-shadow:...]` values for anything reused twice (add a utility to `globals.css` instead)
- `lucide-react` for icons (already a dep)
- **No new heavy deps** — animations are pure CSS keyframes or small `useInView`/`useCountUp` client hooks. No `framer-motion`, no Three.js, no Monaco
- Interactive bits marked `"use client"` only at the leaf
- No `any` in TypeScript, no `console.log` in shipped code
- Respect `prefers-reduced-motion` on every animated element

### Aesthetic — "Observatory"
Single brand accent (teal `#2dd4bf`). Editorial moments carried by **Instrument Serif italic** sparingly — one italic word per headline, big italic numerals in the metrics row, and the giant home-page "CloudOps Platform" wordmark. Everything else stays Inter / JetBrains Mono.

---

## 2. Page-by-page composition

### 2.1 Home page (`/`) — additive only

Current order (preserved exactly): `<Hero />` → `<TechStack />` → `<FeatureGrid />` → `<ArchPanel />` → `<CallToAction />`.

**New top band, inserted above:** `<PlatformHero />`

A min-`100vh` centered band, full-bleed within the existing layout:

- **Background layer 1 (`<ClusterOrbit />` client component):**
  - SVG, 8 pods orbiting a glowing EKS core on 3 concentric elliptical paths
  - Pods labeled with shortened service names (`order`, `front`, `ws`, `search`, `otel`, `audit`, `image`, `sched`)
  - One pod pulses at a time, advances every 900ms via `setInterval`
  - Data-packet circles animate along the spokes (`<animate attributeName="cx" …>`)
  - Mouse-parallax tilt — uses a small `useMouseParallax(amplitude)` hook reading `mousemove` and applying a `transform: translate3d()` to the SVG wrapper
  - `aria-hidden`, opacity 0.62, sits behind content via `position: absolute; inset: 0`
  - Skipped entirely when `prefers-reduced-motion: reduce` — only the static elliptical paths render

- **Background layer 2 (`<HeroLogStream />` client component, optional):**
  - Three vertical columns of faint scrolling pino-formatted log lines (e.g. `14:22:01.482Z  INFO  tenant=acme  order_created  order_id="549302"  dur_ms=47`)
  - Opacity 0.06, masked at top/bottom edges and in a center radial so the headline stays clean
  - Pure CSS `@keyframes log-print-{a,b,c}` translating Y over 32–46s, infinite loop
  - `aria-hidden`, `pointer-events: none`
  - Suppressed entirely under `prefers-reduced-motion`

- **Foreground content** (centered, vertically and horizontally):
  - Pill: `<StatusPill variant="live">v1.4.0 · production · 30-day uptime 99.94%</StatusPill>` (reuses existing component)
  - H1: `<h1 class="font-display italic" style="font-size: clamp(64px, 11vw, 148px)">CloudOps Platform</h1>` — flat `var(--fg-base)`, no gradient
  - Sub: `<p class="text-fg-muted">Multi-tenant SaaS on Kubernetes. Built for scale, designed for interviews — every layer instrumented, every line open source.</p>` — max-width ~640px
  - CTAs: primary `<Button asChild><Link href="/platform">Explore the platform →</Link></Button>` · ghost `<Button asChild variant="ghost"><Link href="/architecture">View architecture ↓</Link></Button>`
  - Scroll cue at the bottom: 1px hairline fading in/out, no text label

Existing `<Hero />` (the "Production-shaped storefront" one) renders directly below. No bridge component, no separator.

### 2.2 `/platform` page

```tsx
export default function PlatformPage() {
  return (
    <>
      <SubHero
        eyebrow="the platform journey"
        title="From browser to bedrock,"
        italic="in five panels."
        sub="The five primitives that make a multi-tenant SaaS on EKS feel boring in the best way."
      />
      <Journey />
      <Bento />
    </>
  );
}
```

#### `<SubHero />` (shared component, used on all 3 new pages)
Compact hero — `paddingTop: 140`, `paddingBottom: 56`. Mono eyebrow on top. H1 split into two visual parts: a plain prefix and an italic-serif suffix.

```tsx
interface SubHeroProps {
  eyebrow: string;       // mono, all lowercase, e.g. "the platform journey"
  title: string;         // plain prefix, e.g. "From browser to bedrock,"
  italic: string;        // italic-serif suffix, e.g. "in five panels."
  sub?: string;          // body paragraph under the H1
}
```

Faint hero-orb (480×480 teal blur) top-right, opacity 0.2. No grid, no noise — keep sub-heros calm so the page's main content carries weight.

#### `<Journey />` — 5 vertically stacked panels with sticky left rail

**Layout:** CSS grid with `grid-template-columns: 220px 1fr; gap: 56px`. Left column is a sticky numbered nav, right column is the panel stack.

```
01 · isolation       │  Row-Level Security
02 · workflows       │    Every query. Every tenant. Zero trust.
03 · visibility      │    Postgres RLS with FORCE. Tenant context bound at JWT verify…
04 · defense         │    ┌──────────────────────────────────────────┐
05 · shipping        │    │ migrations/003_rls.sql                   │
                     │    │ ALTER TABLE orders ENABLE ROW LEVEL SEC  │
                     │    │ ALTER TABLE orders FORCE  ROW LEVEL SEC  │
                     │    │ CREATE POLICY tenant_isolation ON orders │
                     │    │   USING (tenant_id = current_setting(…)) │
                     │    └──────────────────────────────────────────┘
```

The active rail step is determined by which panel is centered in the viewport (small client component using `IntersectionObserver` with a `rootMargin: "-40% 0px -40% 0px"` trick to pick the centered panel). Clicking a step scrolls smoothly to the matching panel via `element.scrollIntoView({behavior: 'smooth', block: 'center'})`.

**The 5 panels** (each has: large display heading, sub headline, body paragraph, visual on right side):

| # | Step name      | Heading                              | Visual                                  |
|---|----------------|--------------------------------------|-----------------------------------------|
| 1 | isolation      | Row-Level Security                   | SQL code block (4–6 lines) + 3 db icons |
| 2 | workflows      | Sagas & Streams                      | Step Functions state pills + Kinesis arrows |
| 3 | visibility     | Full-stack telemetry                 | 3-signal OTel diagram (spans/metrics/logs) |
| 4 | defense        | Zero-trust stack                     | 5-layer defense diagram                 |
| 5 | shipping       | Production ready                     | Pipeline preview (mini)                 |

**No horizontal scroll** — earlier design iterations attempted side-scroll storytelling and were rejected by both the user and the verifier as "weird side-scroll". This vertical-with-sticky-rail is the resolved shape.

**Reduced motion:** rail still highlights the centered panel, but no smooth-scroll on click — falls back to instant jump.

#### `<Bento />` — 12-column grid, 5 tiles

```
┌─────────────────────────────────────────────┬────────────────────┐
│ TILE 01 · multi-tenancy        ADR-014      │ TILE 02 · auth     │
│ "A forgotten WHERE can't leak."             │   JWT, end-to-end. │
│ [SQL code block — 6–8 lines with syntax     │   ADR-016          │
│  highlighting using existing tok-* classes] │  [animated SVG     │
│                                             │   browser → mw →   │
│ caption: Force-RLS on every customer table… │   express → λ → ws │
│                                             │   with moving      │
│                                             │   packet]          │
├──────────────────┬──────────────────────────┼────────────────────┤
│ TILE 03 · search │ TILE 04 · realtime       │ TILE 05 · saga     │
│   Warm < 100 ms. │   Push, not poll.        │   Checkout durable │
│   ADR-017        │   ADR-018                │   ADR-019          │
│  [animated SVG]  │  [animated SVG]          │  [state pills]     │
└──────────────────┴──────────────────────────┴────────────────────┘
```

- Tile 1: `col-span-8 row-span-2`
- Tile 2: `col-span-4 row-span-2`
- Tiles 3–5: `col-span-4`

Each tile is `<Link>`-wrapped to its relevant existing route (`/products`, `/orders`, `/checkout`, etc.) so clicking jumps to the running surface. The full tile is the click target, not just the title.

Glass surface: `bg-bg-raised/55 backdrop-blur-md border-border-default/80`. Hover: border lifts to `border-brand-500/40`, `translate-y: -4px`. ADR badge top-right, mono, `text-fg-subtle`.

Responsive: at `<=1100px` collapses to 6-col grid (1 stays full width, 2-5 stack 3+3). At `<=700px` single column.

### 2.3 `/architecture` page

```tsx
export default function ArchitecturePage() {
  return (
    <>
      <SubHero
        eyebrow="architecture"
        title="The same diagram you'd"
        italic="actually whiteboard."
        sub="Four flows plus one full picture. Hover any node for tech, cost, and ownership."
      />
      <FlowRows />              {/* enhanced version of existing ArchPanel */}
      <FullArchDiagram />        {/* new — 24-service SVG with animated packets */}
    </>
  );
}
```

#### `<FlowRows />` — enhanced `ArchPanel`

The existing `apps/storefront/src/components/site/ArchPanel.tsx` already renders all 4 flows with AWS category colours and the correct ServiceTile composition. **Polish on top:**

- **Sticky in-section sub-nav** above the panel: 4 chips matching the flow labels (`Page load`, `Search read`, `Order + realtime`, `Checkout saga`). Clicking a chip scrolls the corresponding flow row into view (each row gets an `id`).
- **Animated packets along each flow row** — a thin `<span>` element with `position: absolute; left: 0; top: 50%`, animated from `left: 0` to `left: 100%` over 4s, infinite. Coloured to match the flow's accent (`compute: #ED7100`, `database: #3B48CC`, etc.). One packet per row. Pure CSS, no JS.
- **Hover behaviour:** hovering one row dims the other three to 60% opacity. Pure CSS `:hover` on the row, sibling-aware selectors.
- Existing `ArchPanel` is updated in place — no second copy. Anyone visiting `/` still sees it on the home page; on `/architecture` it's the centerpiece.

#### `<FullArchDiagram />` — new client component

A single SVG containing **24 AWS service nodes** arranged on a layered grid (client edge → ingress → compute → data → messaging → observability). Edges between connected services. Animated teal packet circles travelling along each edge using `<animateMotion>` with a `dur` between 3 and 5s.

**Layers (top to bottom in the SVG):**
1. **Client** — Browser, CloudFront
2. **Ingress** — ALB, WAF, API Gateway HTTP, API Gateway WebSocket
3. **Compute** — Next.js (EKS), Express order-api (EKS), search-gateway λ, ws-fanout λ, image-resize λ, order-email λ
4. **Data** — RDS Postgres, DynamoDB (cart + WS registry), S3 (assets + invoices)
5. **Messaging** — Kinesis, Step Functions, SQS, SES
6. **Identity** — Cognito, IAM (IRSA), Secrets Manager, KMS
7. **Observability** — OpenTelemetry Collector, Prometheus, Grafana, CloudWatch Logs

Each node: rounded rect (`rx=6`) with AWS category colour as a 4px top bar, lucide icon as inline SVG path, name in `JetBrains Mono` 11px, optional one-line detail in `text-fg-subtle` 9px.

Hovering a node: light up the node's outline to `var(--brand-400)`, dim all unconnected edges to opacity 0.15. Plain CSS `:hover` with sibling-aware selectors.

On scroll-into-view: nodes fade in with a 60ms stagger, edges draw via `stroke-dasharray` transition. Uses the same `useInView` hook from `sections.jsx`.

Approximately 400 LOC. One client component. Skipped animation entirely under `prefers-reduced-motion: reduce` — the whole diagram renders static.

### 2.4 `/pipeline` page

```tsx
export default function PipelinePage() {
  return (
    <>
      <SubHero
        eyebrow="pipeline & defense"
        title="Approval gates."
        italic="Digest-pinned. Zero-downtime."
        sub="GitHub Actions → cosign → trivy → manual approval → kubectl rollout. Then verify, or roll back."
      />
      <Pipeline />
      <SecurityPanel />
    </>
  );
}
```

#### `<Pipeline />` — 11-node timeline

Horizontal line with 11 evenly-spaced nodes:

```
PR → Lint → Test → Build → Sign → Scan → Plan → Approve → Deploy → Verify → Rollback
```

Each node: a 14×14 dot, name (mono 11px), tool name (mono 10px, `fg-subtle`). Connecting hairline is two stacked SVG `<line>` elements — one dashed `border-default` (static) and one solid `brand-500` (animated draw-in).

**Animation sequence on scroll-into-view:**
1. Solid line draws left-to-right via `stroke-dashoffset` over 1.6s
2. Dots light up in sequence at 220ms intervals (so the brand-500 line and the lit dots arrive at the right edge around the same time)

**Hover:** show a `<surface-strong>` tooltip below the node with the workflow file path (e.g. `.github/workflows/app.yml:148`).

**Stage data (table in the implementation):**

| Stage    | Tool        | Workflow file path                                |
|----------|-------------|---------------------------------------------------|
| PR       | GitHub      | `.github/PULL_REQUEST_TEMPLATE.md`                |
| Lint     | eslint      | `.github/workflows/app.yml:18`                    |
| Test     | vitest      | `.github/workflows/app.yml:34`                    |
| Build    | next + tsc  | `.github/workflows/app.yml:62`                    |
| Sign     | cosign      | `.github/workflows/app.yml:88`                    |
| Scan     | trivy       | `.github/workflows/app.yml:104`                   |
| Plan     | terraform   | `.github/workflows/infra.yml:42`                  |
| Approve  | OIDC env    | `.github/workflows/app.yml:138`                   |
| Deploy   | kubectl     | `.github/workflows/app.yml:155`                   |
| Verify   | /ready      | `.github/workflows/app.yml:172`                   |
| Rollback | auto        | `.github/workflows/app.yml:188`                   |

Implementation note: verify these line numbers against the actual `.github/workflows/app.yml` and `infra.yml` files at implementation time. If a line number drifts, update the table data — don't fake it.

**Reduced motion:** skip the line-draw and dot-sequencing; all 11 dots render lit on initial paint.

#### `<SecurityPanel />` — two columns

**Left column — Compliance posture table:**

| Layer            | Control                       | Source              |
|------------------|-------------------------------|---------------------|
| Identity         | Cognito + JWKS verify         | `docs/adr/016-*`    |
| Tenancy          | Postgres RLS · force          | `migrations/003_*`  |
| Transport        | HSTS · CSP · COOP/CORP        | `next.config.ts`    |
| Secrets          | Secrets Mgr + IRSA            | `k8s/deployment.yaml` |
| Supply chain     | Cosign + Trivy + Gatekeeper   | `docs/adr/020-*`    |
| Observability    | OTel · 3 signals · SLO        | `modules/observability/` |

Mono table, hairline borders. Source column is a `<Link>` to a public GitHub URL at `https://github.com/<repo>/blob/main/<path>` — repo derived from existing `next.config.ts` or hardcoded with a placeholder constant that gets reviewed before merge.

**Right column — SLO clock + sparklines:**

- Circular gauge: 240×240 SVG, teal stroke at 99.0% of full circumference, `fg-subtle` for the missing 1%. Centre: `99.0%` (Instrument Serif italic, 64px) + `checkout availability` (mono, 11px, `fg-subtle`).
- Below the gauge: 4 mini sparklines (60×24 each) for:
  - `jwt_verify_total{outcome=ok}` — steady upward staircase
  - `order p99` — flat with one spike
  - `WS connect success` — flat ~100%
  - `rollback events` — flat zero with one bump
  
  Each sparkline is generated from a **deterministic seed** — no `Math.random()` per render — so SSR + hydration match. Implementation: a simple `seededRandom(seed: number)` function (LCG or xorshift) that returns 12 values per sparkline.

### 2.5 Navbar — sectioned

**Before:**
```
[▲ CloudOps Shop · live]   Products · Orders · Design          [Cart] [Sign in]
```

**After:**
```
[▲ CloudOps · live]   Products · Orders · Design  │  Platform · Architecture · Pipeline   [Cart] [Sign in]
```

- Brand text: `CloudOps Shop` → `CloudOps`
- The `<StatusPill>` next to the brand stays
- The middle nav `<nav>` becomes two `<ul>` clusters separated by a 1px vertical hairline (`border-r border-border-muted`, h-4, mx-3)
- Both clusters use the same hover styling (`hover:text-fg-base transition-colors`)
- Right side: `Cart` ghost button + `Sign in` primary button unchanged
- Active route gets `aria-current="page"` and `text-fg-base` (currently the existing navbar doesn't do this — add it via `usePathname()` from `next/navigation` in a small `"use client"` wrapper, or use Next's built-in support)
- Mobile (`<md`): both clusters collapse into the existing hidden-nav behaviour; the separator hides

### 2.6 Footer — minor data change only

The existing `Footer.tsx` already has a "Platform" column with placeholder links. Repoint those links:
- `Overview` → `/platform`
- `Architecture` → `/architecture`
- `Pipeline` → `/pipeline`
- `Security` → `/pipeline#security` (anchor into the SecurityPanel section)

No structural change.

---

## 3. Shared components (new)

All under `apps/storefront/src/components/site/`. Each is a focused, single-responsibility unit.

| Component               | RSC / Client | Purpose                                        |
|-------------------------|--------------|------------------------------------------------|
| `PlatformHero.tsx`      | RSC + child clients | Home-page top band wrapper                 |
| `ClusterOrbit.tsx`      | `"use client"` | SVG orbit with mouse-parallax tilt + pulsing pods |
| `HeroLogStream.tsx`     | `"use client"` (optional — see §5) | Three-column CSS-scroll log watermark |
| `useMouseParallax.ts`   | hook         | Returns `{x, y}` from `mousemove`, throttled   |
| `useInView.ts`          | hook         | Wraps `IntersectionObserver`                   |
| `useCountUp.ts`         | hook         | Animates a numeric value from 0 → target       |
| `SubHero.tsx`           | RSC          | Sub-hero shared by /platform /architecture /pipeline |
| `Journey.tsx`           | `"use client"` | 5-panel layout with sticky rail              |
| `Bento.tsx`             | RSC + leaf clients for animated SVGs | 12-col grid          |
| `BentoTile.tsx`         | RSC          | Single tile shape                              |
| `CodeBlock.tsx`         | RSC          | Static token-coloured code block               |
| `CognitoDiagram.tsx`    | `"use client"` | Animated SVG packet — JWT path               |
| `SearchDiagram.tsx`     | RSC          | Static SVG flow                                |
| `RealtimeDiagram.tsx`   | `"use client"` | Animated SVG packet — WS fanout              |
| `SagaDiagram.tsx`       | RSC          | Static SVG state pills                         |
| `FullArchDiagram.tsx`   | `"use client"` | The 24-service SVG with hover + scroll-draw  |
| `Pipeline.tsx`          | `"use client"` | 11-node timeline with line-draw + tooltip    |
| `SecurityPanel.tsx`     | RSC + client gauge | Compliance table + SLO gauge + sparklines |
| `SloGauge.tsx`          | RSC          | Static SVG donut                               |
| `Sparkline.tsx`         | RSC          | Deterministic-seed mini chart                  |
| `ScrollProgress.tsx`    | `"use client"` | 2px teal bar at top of viewport              |

Each file stays small (target: <250 lines). Where a file would exceed that, split into a leaf component.

---

## 4. Global utilities & layout

### `app/layout.tsx`
- Import `Instrument_Serif` from `next/font/google` with `subsets: ["latin"]`, `weight: ["400"]`, `style: ["italic"]`, `variable: "--font-instrument-serif"`, `display: "swap"`
- Add `${instrumentSerif.variable}` to the `<html className>`
- Mount `<ScrollProgress />` just inside `<body>`, before `<Navbar />`

### `styles/tokens.css`
**No changes.** Tokens already match the design.

### `styles/globals.css` (additions only — no deletions)

```css
@theme {
  /* ADDITION: display font variable */
  --font-display: var(--font-instrument-serif), Georgia, serif;
}

@layer utilities {
  .font-display { font-family: var(--font-display); }

  .display-italic {
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 400;
    line-height: 1.0;
    letter-spacing: -0.012em;
  }

  .line-grid {
    background-image:
      linear-gradient(rgba(48, 54, 61, 0.30) 1px, transparent 1px),
      linear-gradient(90deg, rgba(48, 54, 61, 0.30) 1px, transparent 1px);
    background-size: 32px 32px;
    background-position: -1px -1px;
  }

  .surface-glow {
    box-shadow:
      0 30px 80px -20px rgba(0, 0, 0, 0.6),
      0 12px 30px -8px rgba(0, 0, 0, 0.4);
  }
}

@keyframes packet-flow {
  from { offset-distance: 0%; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  to   { offset-distance: 100%; opacity: 0; }
}

@keyframes pulse-line-draw {
  from { stroke-dashoffset: var(--draw-len, 1200); }
  to   { stroke-dashoffset: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .display-italic { /* no-op — typographic styling, no animation */ }
  /* packet-flow + pulse-line-draw are applied via CSS animations which the
     `prefers-reduced-motion: reduce` rule in this file at line 123 already
     globalises. Verify in implementation. */
}
```

Note: existing `globals.css` already has a `prefers-reduced-motion: reduce` block at line 123 that nullifies `animate-pulse-dot` and `animate-float-slow`. Extend it to also nullify the new packet animations.

---

## 5. Things explicitly NOT built

The chat transcripts (`chat3.md`) include a design review where the user accepted ~12 cleanup suggestions. Those are honoured here:

| Cut                            | Reason                                                |
|--------------------------------|-------------------------------------------------------|
| Splash screen                  | Unnecessary friction on every load; even gating to first-visit (per chat3) is friction without payoff. Skip entirely. |
| Particle canvas                | Identified as "too much competing atmosphere" in chat3. Skip. |
| Click ripple                   | "Gets noisy fast." Skip. |
| Draggable terminal             | User explicitly opted out in clarifying questions. Skip. |
| Horizontal scroll-jacking      | Verifier rejected it in chat2; replaced with vertical layout + sticky rail. |
| `framer-motion` dependency     | Pure CSS keyframes + small hooks cover every animation in the design. No bundle cost. |
| Legacy Journey & Architecture JSX | The original prototype kept old + new side-by-side via a "legacy shim". Not needed in Next.js — components are written once. |
| Gradient-into-accent headlines | Identified as dated in chat3 design review. Headlines use flat `var(--fg-base)` with one italic word for emphasis. |
| HeroLogStream                  | **Conditional.** This is the only "atmospheric" element from the design I'd consider skipping in a follow-up if performance budgets call for it — three columns of animated DOM is the most expensive ambient piece. Default: ship it (it's pure CSS, GPU-composited). |

---

## 6. Acceptance criteria

1. `cd apps/storefront && npm ci && npm run dev` — loads `localhost:3000` with no console errors, no hydration warnings.
2. `npm run lint`, `npm run build`, `npx tsc --noEmit` — all pass.
3. `npm test` — existing tests still pass (in particular `apps/storefront/test/security-headers.test.ts` and `redirect-safety.test.ts` are untouched but must still pass).
4. `npm run contract-check` — passes (no new env vars added).
5. All four pages (`/`, `/platform`, `/architecture`, `/pipeline`) render in under 100ms TTFB locally.
6. Commerce pages (`/products`, `/cart`, `/checkout`, `/orders`, `/admin`) render byte-identical pixel output to before this PR — no visual regression.
7. `prefers-reduced-motion: reduce` (toggle in DevTools) disables: ClusterOrbit pulse + packet, HeroLogStream scroll, Pipeline line-draw + dot-sequencing, FullArchDiagram packets, count-ups, MetricsRow numeric animation.
8. Lighthouse on `/` and `/platform` and `/architecture` and `/pipeline`:
   - Performance ≥ 90
   - Accessibility = 100
   - Best Practices = 100
   - SEO ≥ 95
9. Keyboard navigation works on every new interactive element. Focus rings visible on the new CTAs, the new navbar links, and every Bento tile.
10. No `console.log` introduced. No `any` types.

---

## 6a. Implementation tooling

During the implementation phase, the following plugins/agents are explicitly required by the user and must be invoked at the appropriate point in the flow:

- **`frontend-design` skill** — invoked for component generation, producing the new section components (`PlatformHero`, `Journey`, `Bento`, `FullArchDiagram`, `Pipeline`, `SecurityPanel`). Frontend-design takes the spec sections in §2 as input and produces production-grade React + Tailwind v4.
- **`21st.dev`** — referenced as a visual style + component pattern source. When frontend-design needs precedent for things like the bento grid, the SLO gauge, or the timeline, browse 21st.dev for proven patterns before writing custom code. **Do not copy code verbatim** — match the aesthetic and structural pattern, port to our token system.
- **`code-simplifier` plugin** — invoked **after** every batch of new components is written, before committing. Code-simplifier reviews the recently modified code for clarity, consistency, and maintainability, and applies cleanups that don't change behaviour. Runs as the final pre-commit step on each phase.

The implementation plan (`docs/superpowers/plans/...`) will sequence these tools explicitly at each phase boundary.

---

## 7. Open questions (none blocking)

None. All clarifying questions were resolved with the user:

- **Brand text:** `CloudOps` (drop "Shop")
- **Home stacking:** new band above existing Hero
- **Full arch diagram:** animated (the 24-service version)
- **Terminal:** skipped entirely
- **Commerce routes:** untouched
- **Backend:** untouched
- **Backlog cleanup:** out of scope (none of the rework is destructive to the storefront code that the backlog rows reference)

---

## 8. Out of scope

- Real-time data integration. All metrics, sparklines, and "live" elements use static or deterministically-seeded values. Wiring them to actual Prometheus / OTel happens in a separate story.
- Pipeline workflow file-line audit. The implementation will verify line numbers at write time but will not refactor `.github/workflows/app.yml` to match.
- E2E tests for the new pages. Unit tests for new utility hooks (`useInView`, `useCountUp`, deterministic-seed sparkline) are in-scope; route-level Playwright tests are not.
- Mobile-specific micro-interactions beyond the existing breakpoint behaviour described per-section.
- Internationalisation. All copy is English-only, matching the existing site.
- Dark/light mode toggle. The site is dark-only by design (`color-scheme: dark` in `globals.css`).
