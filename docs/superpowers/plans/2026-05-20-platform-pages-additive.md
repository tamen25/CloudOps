# Platform Pages — Additive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new platform-showcase routes (`/platform`, `/architecture`, `/pipeline`) and one new top hero band on the home page to the CloudOps Shop storefront, layered on top of the existing storefront design without altering commerce routes or backend.

**Architecture:** Next.js 15 App Router additions. Reuse the existing CloudOps Dim design tokens (`apps/storefront/src/styles/tokens.css`) and shadcn-style UI primitives (`apps/storefront/src/components/ui/*`). New section components live under `apps/storefront/src/components/site/`. RSC by default; `"use client"` only at interactive leaves (orbit SVG, log stream, parallax hook, sticky-rail Journey, animated pipeline timeline, animated full architecture SVG, scroll progress, count-ups). One new Google Font (Instrument Serif italic) added via `next/font/google`. All animations are pure CSS keyframes + `IntersectionObserver` hooks — no `framer-motion`, no other heavy deps.

**Tech Stack:** Next.js 15, React 19 (RSC + Client), Tailwind v4 `@theme` tokens, lucide-react, `next/font/google` (Inter + JetBrains Mono + Instrument Serif), node:test (already wired) for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-20-platform-pages-additive-design.md`

**Source design (for reference, NOT copied verbatim):**
- HTML/CSS reference: `apps/storefront/design/cloudops-frontend/project/CloudOps Platform v2.html`
- JSX prototypes: `apps/storefront/design/cloudops-frontend/project/storefront/*.jsx`
- Chat transcripts (user intent): `apps/storefront/design/cloudops-frontend/chats/*.md`

**Implementation toolchain (REQUIRED at each phase):**
- `frontend-design` skill — invoked when generating new section components. Pass the relevant spec section as input.
- 21st.dev — when frontend-design needs visual precedent for a non-obvious pattern (bento grid, SLO gauge, scroll-driven timeline), open 21st.dev in the browser and match aesthetic / structural pattern. Do not copy code; port to project tokens.
- `code-simplifier:code-simplifier` skill — invoked **after** every batch of new components is written, before that phase's commit. Reviews recently modified files only.

---

## File structure

### New files

```
apps/storefront/src/
├── app/
│   ├── platform/
│   │   └── page.tsx                    # /platform route — SubHero + Journey + Bento
│   ├── architecture/
│   │   └── page.tsx                    # /architecture route — SubHero + FlowRows + FullArchDiagram
│   └── pipeline/
│       └── page.tsx                    # /pipeline route — SubHero + Pipeline + SecurityPanel
│
├── components/
│   └── site/
│       ├── PlatformHero.tsx            # RSC wrapper — home top band
│       ├── ClusterOrbit.tsx            # "use client" — SVG orbit + parallax
│       ├── HeroLogStream.tsx           # "use client" — 3-column CSS-scroll watermark
│       ├── ScrollProgress.tsx          # "use client" — 2px top bar
│       │
│       ├── SubHero.tsx                 # RSC — shared compact hero
│       │
│       ├── Journey.tsx                 # "use client" — 5-panel + sticky rail
│       │
│       ├── Bento.tsx                   # RSC — 12-col grid
│       ├── BentoTile.tsx               # RSC — single tile shape
│       ├── CodeBlock.tsx               # RSC — token-coloured static code
│       ├── CognitoDiagram.tsx          # "use client" — animated JWT path SVG
│       ├── SearchDiagram.tsx           # RSC — static SVG
│       ├── RealtimeDiagram.tsx         # "use client" — animated WS fanout SVG
│       ├── SagaDiagram.tsx             # RSC — static SF state pills
│       │
│       ├── FlowRowsArchPanel.tsx       # (modified existing ArchPanel.tsx in place)
│       ├── FullArchDiagram.tsx         # "use client" — 24-service SVG
│       │
│       ├── Pipeline.tsx                # "use client" — 11-node animated timeline
│       ├── SecurityPanel.tsx           # RSC wrapper
│       ├── SloGauge.tsx                # RSC — static SVG donut
│       ├── Sparkline.tsx               # RSC — deterministic-seed mini chart
│       │
│       └── nav/
│           └── ActiveLink.tsx          # "use client" — usePathname wrapper for aria-current
│
└── lib/
    ├── use-mouse-parallax.ts           # client hook
    ├── use-in-view.ts                  # client hook
    ├── use-count-up.ts                 # client hook
    └── seeded-random.ts                # pure function — deterministic RNG for sparklines
```

### Modified files

```
apps/storefront/src/
├── app/
│   ├── layout.tsx                      # add Instrument Serif font + mount <ScrollProgress />
│   └── page.tsx                        # prepend <PlatformHero /> above existing <Hero />
├── components/site/
│   ├── Navbar.tsx                      # sectioned nav (commerce | platform) + brand rename + ActiveLink
│   ├── Footer.tsx                      # repoint Platform-column links to new routes (data only)
│   └── ArchPanel.tsx                   # add sticky sub-nav + animated row packets + hover-dim
└── styles/
    └── globals.css                     # add .display-italic, .font-display, .line-grid, .surface-glow, @keyframes packet-flow, @keyframes pulse-line-draw, extend prefers-reduced-motion block
```

### Tests

```
apps/storefront/test/
├── lib/
│   ├── seeded-random.test.ts           # determinism check (new)
│   └── use-count-up.test.ts            # count-up correctness (new)
├── nav/
│   └── active-link.test.tsx            # aria-current logic (new)
└── routes/
    ├── platform-page.test.tsx          # /platform renders SubHero + Journey + Bento (new)
    ├── architecture-page.test.tsx      # /architecture renders sections (new)
    └── pipeline-page.test.tsx          # /pipeline renders sections (new)
```

Existing test files (`security-headers.test.ts`, `redirect-safety.test.ts`, all others) are untouched.

---

## Phase ordering

1. **Phase 1** — Globals: font, CSS utilities, hooks, ScrollProgress, Navbar restructure, Footer link repoint
2. **Phase 2** — Home top band: PlatformHero + ClusterOrbit + HeroLogStream
3. **Phase 3** — `/platform`: SubHero + Journey + Bento
4. **Phase 4** — `/architecture`: ArchPanel polish + FullArchDiagram
5. **Phase 5** — `/pipeline`: Pipeline + SecurityPanel
6. **Phase 6** — Final verification: lint + build + tsc + tests + manual route walk

Each phase ends with: `frontend-design` review of changed components → `code-simplifier` cleanup pass on `git diff --name-only` files → single phase commit.

---

# Phase 1 — Globals (font · CSS · hooks · ScrollProgress · Navbar · Footer)

## Task 1: Add Instrument Serif font to layout

**Files:**
- Modify: `apps/storefront/src/app/layout.tsx`

- [ ] **Step 1: Read the file once for current state**

Read `apps/storefront/src/app/layout.tsx`. Verify it imports `Inter` and `JetBrains_Mono` from `next/font/google` and applies their variables on `<html>`.

- [ ] **Step 2: Add Instrument Serif import + variable**

Insert this after the existing `JetBrains_Mono` import:

```ts
import { Instrument_Serif } from "next/font/google";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});
```

Then update the `<html>` className from:
```tsx
<html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
```
to:
```tsx
<html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}>
```

- [ ] **Step 3: Verify nothing else broke**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS (no new errors).

- [ ] **Step 4: Commit**

```bash
rtk git add apps/storefront/src/app/layout.tsx
rtk git commit -m "feat(storefront): add Instrument Serif italic for platform pages"
```

## Task 2: Add display + utility CSS to globals

**Files:**
- Modify: `apps/storefront/src/styles/globals.css`

- [ ] **Step 1: Read current file**

Read `apps/storefront/src/styles/globals.css` to confirm the existing structure (`@theme`-less — it imports tokens.css, then `@layer base`, `@layer utilities`, then standalone keyframes/utilities, then a single `@media (prefers-reduced-motion: reduce)` block).

- [ ] **Step 2: Insert font-display + display-italic utilities**

After the existing `@layer utilities { .font-mono { ... } }` block, replace the entire block with:

```css
@layer utilities {
  .font-mono {
    font-family: var(--font-mono);
  }

  .font-display {
    font-family: var(--font-instrument-serif), Georgia, serif;
  }

  .display-italic {
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-style: italic;
    font-weight: 400;
    line-height: 1;
    letter-spacing: -0.012em;
  }

  .line-grid {
    background-image:
      linear-gradient(rgba(48, 54, 61, 0.3) 1px, transparent 1px),
      linear-gradient(90deg, rgba(48, 54, 61, 0.3) 1px, transparent 1px);
    background-size: 32px 32px;
    background-position: -1px -1px;
  }

  .surface-glow {
    box-shadow:
      0 30px 80px -20px rgba(0, 0, 0, 0.6),
      0 12px 30px -8px rgba(0, 0, 0, 0.4);
  }
}
```

- [ ] **Step 3: Append packet-flow + pulse-line-draw keyframes**

After the existing `.brand-glow:hover { … }` block (around line 117–121), append:

```css
@keyframes packet-flow {
  0%   { offset-distance: 0%; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}

@keyframes pulse-line-draw {
  from { stroke-dashoffset: var(--draw-len, 1200); }
  to   { stroke-dashoffset: 0; }
}

.animate-packet-flow {
  animation: packet-flow 4s linear infinite;
}
```

- [ ] **Step 4: Extend the reduced-motion block**

Find the existing block:
```css
@media (prefers-reduced-motion: reduce) {
  .animate-pulse-dot,
  .animate-float-slow {
    animation: none !important;
  }
}
```

Replace it with:
```css
@media (prefers-reduced-motion: reduce) {
  .animate-pulse-dot,
  .animate-float-slow,
  .animate-packet-flow {
    animation: none !important;
  }
}
```

- [ ] **Step 5: Verify globals.css still parses**

Run: `cd apps/storefront && npm run build 2>&1 | head -40`

Expected: build progresses past CSS without error. (Build itself may fail later for an unrelated reason — only fail this step if there's a CSS syntax error.)

- [ ] **Step 6: Commit**

```bash
rtk git add apps/storefront/src/styles/globals.css
rtk git commit -m "feat(storefront): add display + utility classes for platform pages"
```

## Task 3: Write seeded-random helper

**Files:**
- Create: `apps/storefront/src/lib/seeded-random.ts`
- Test: `apps/storefront/test/lib/seeded-random.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/test/lib/seeded-random.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { seededRandom, seededSequence } from "../../src/lib/seeded-random.ts";

test("seededRandom is deterministic for the same seed", () => {
  const rng1 = seededRandom(42);
  const rng2 = seededRandom(42);
  for (let i = 0; i < 10; i++) {
    assert.equal(rng1(), rng2());
  }
});

test("seededRandom returns values in [0, 1)", () => {
  const rng = seededRandom(123);
  for (let i = 0; i < 100; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test("seededSequence returns a deterministic array of the requested length", () => {
  const a = seededSequence(7, 12);
  const b = seededSequence(7, 12);
  assert.equal(a.length, 12);
  assert.deepEqual(a, b);
});

test("seededSequence differs across seeds", () => {
  const a = seededSequence(1, 10);
  const b = seededSequence(2, 10);
  assert.notDeepEqual(a, b);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd apps/storefront && npx tsx --test test/lib/seeded-random.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `apps/storefront/src/lib/seeded-random.ts`:

```ts
/**
 * Mulberry32 PRNG — deterministic 32-bit RNG. Same seed → same sequence.
 * Used for sparkline values so SSR + hydration produce identical DOM.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededSequence(seed: number, length: number): number[] {
  const rng = seededRandom(seed);
  return Array.from({ length }, () => rng());
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/storefront && npx tsx --test test/lib/seeded-random.test.ts`

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/storefront/src/lib/seeded-random.ts apps/storefront/test/lib/seeded-random.test.ts
rtk git commit -m "feat(storefront): add deterministic seeded RNG for sparklines"
```

## Task 4: Write useInView hook

**Files:**
- Create: `apps/storefront/src/lib/use-in-view.ts`

- [ ] **Step 1: Implement the hook**

Create `apps/storefront/src/lib/use-in-view.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";

interface Options {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

/**
 * Returns [ref, inView]. When the element enters the viewport, inView flips
 * to true. With `once: true` (default), it stays true once set so animations
 * don't replay on scroll-back.
 */
export function useInView<T extends Element = HTMLDivElement>(
  options: Options = {},
): [React.RefObject<T | null>, boolean] {
  const { threshold = 0.2, rootMargin = "0px", once = true } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, inView];
}
```

- [ ] **Step 2: Verify the file type-checks**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/storefront/src/lib/use-in-view.ts
rtk git commit -m "feat(storefront): add useInView hook for scroll-triggered effects"
```

## Task 5: Write useCountUp hook

**Files:**
- Create: `apps/storefront/src/lib/use-count-up.ts`
- Test: `apps/storefront/test/lib/use-count-up.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/test/lib/use-count-up.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import React from "react";
import { formatCountUp } from "../../src/lib/use-count-up.ts";

test("formatCountUp formats integers with no decimals", () => {
  assert.equal(formatCountUp(100, 0), "100");
});

test("formatCountUp formats floats with the requested precision", () => {
  assert.equal(formatCountUp(99.04, 1), "99.0");
  assert.equal(formatCountUp(0.197, 2), "0.20");
});

test("formatCountUp handles zero", () => {
  assert.equal(formatCountUp(0, 0), "0");
  assert.equal(formatCountUp(0, 2), "0.00");
});

void React;
void renderToString;
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd apps/storefront && npx tsx --test test/lib/use-count-up.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `apps/storefront/src/lib/use-count-up.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

export function formatCountUp(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

interface Options {
  duration?: number;
  decimals?: number;
  start: boolean;
}

/**
 * Animates a number from 0 to `target` over `duration` ms.
 * Returns the current formatted string. Respects prefers-reduced-motion.
 */
export function useCountUp(target: number, options: Options): string {
  const { duration = 1400, decimals = 0, start } = options;
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) {
      setValue(0);
      return;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target);
      return;
    }
    const startTs = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);

  return formatCountUp(value, decimals);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/storefront && npx tsx --test test/lib/use-count-up.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/storefront/src/lib/use-count-up.ts apps/storefront/test/lib/use-count-up.test.ts
rtk git commit -m "feat(storefront): add useCountUp hook for metrics animation"
```

## Task 6: Write useMouseParallax hook

**Files:**
- Create: `apps/storefront/src/lib/use-mouse-parallax.ts`

- [ ] **Step 1: Implement the hook**

Create `apps/storefront/src/lib/use-mouse-parallax.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/**
 * Returns {x, y} offsets in the range [-amplitude, +amplitude] derived from
 * the mouse position relative to the viewport center. No-op under
 * prefers-reduced-motion or on touch-only devices.
 */
export function useMouseParallax(amplitude = 6): { x: number; y: number } {
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = (e.clientY / window.innerHeight) * 2 - 1;
        setOffset({ x: nx * amplitude, y: ny * amplitude });
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [amplitude]);

  return offset;
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/storefront/src/lib/use-mouse-parallax.ts
rtk git commit -m "feat(storefront): add useMouseParallax hook for hero orbit"
```

## Task 7: Write ScrollProgress client component

**Files:**
- Create: `apps/storefront/src/components/site/ScrollProgress.tsx`

- [ ] **Step 1: Implement the component**

Create `apps/storefront/src/components/site/ScrollProgress.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

export function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const total = h.scrollHeight - h.clientHeight;
      setPct(total > 0 ? (h.scrollTop / total) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]"
    >
      <div
        className="h-full bg-gradient-to-r from-transparent via-brand-400 to-brand-500 shadow-[0_0_14px_rgba(45,212,191,0.55)]"
        style={{ width: `${pct}%`, transition: "width 80ms linear" }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Mount it in root layout**

Modify `apps/storefront/src/app/layout.tsx`. Insert the import after the existing `Footer` import:

```ts
import { ScrollProgress } from "@/components/site/ScrollProgress";
```

Then change the body to render `<ScrollProgress />` before `<Navbar />`:

```tsx
<body className="flex min-h-screen flex-col bg-bg-base">
  <ScrollProgress />
  <Navbar />
  <div className="flex-1">{children}</div>
  <Footer />
  <Toaster />
</body>
```

- [ ] **Step 3: Verify build still type-checks**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/storefront/src/components/site/ScrollProgress.tsx apps/storefront/src/app/layout.tsx
rtk git commit -m "feat(storefront): add scroll progress bar to root layout"
```

## Task 8: Write ActiveLink helper

**Files:**
- Create: `apps/storefront/src/components/site/nav/ActiveLink.tsx`
- Test: `apps/storefront/test/nav/active-link.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/test/nav/active-link.test.tsx`:

```tsx
import { test } from "node:test";
import assert from "node:assert/strict";
import { isActivePath } from "../../src/components/site/nav/ActiveLink.tsx";

test("isActivePath: exact root matches only the root", () => {
  assert.equal(isActivePath("/", "/"), true);
  assert.equal(isActivePath("/", "/products"), false);
});

test("isActivePath: non-root matches its prefix", () => {
  assert.equal(isActivePath("/platform", "/platform"), true);
  assert.equal(isActivePath("/platform", "/platform/x"), true);
  assert.equal(isActivePath("/platform", "/architecture"), false);
});

test("isActivePath: products does not match the root /", () => {
  assert.equal(isActivePath("/products", "/"), false);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd apps/storefront && npx tsx --test test/nav/active-link.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `apps/storefront/src/components/site/nav/ActiveLink.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface ActiveLinkProps extends Omit<ComponentProps<typeof Link>, "children"> {
  children: ReactNode;
  activeClassName?: string;
  inactiveClassName?: string;
}

export function ActiveLink({
  href,
  children,
  className = "",
  activeClassName = "text-fg-base",
  inactiveClassName = "text-fg-muted hover:text-fg-base",
  ...rest
}: ActiveLinkProps) {
  const pathname = usePathname();
  const active = isActivePath(String(href), pathname ?? "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? activeClassName : inactiveClassName} transition-colors`}
      {...rest}
    >
      {children}
    </Link>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/storefront && npx tsx --test test/nav/active-link.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/storefront/src/components/site/nav/ActiveLink.tsx apps/storefront/test/nav/active-link.test.tsx
rtk git commit -m "feat(storefront): add ActiveLink for nav aria-current"
```

## Task 9: Restructure Navbar into commerce|platform clusters

**Files:**
- Modify: `apps/storefront/src/components/site/Navbar.tsx`

- [ ] **Step 1: Read the current Navbar to confirm structure**

Read `apps/storefront/src/components/site/Navbar.tsx`.

- [ ] **Step 2: Replace the file body**

Replace the entire file with:

```tsx
import Link from "next/link";
import { ShoppingBag, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { ActiveLink } from "@/components/site/nav/ActiveLink";

const COMMERCE_LINKS = [
  { href: "/products", label: "Products" },
  { href: "/orders", label: "Orders" },
  { href: "/design", label: "Design" },
];

const PLATFORM_LINKS = [
  { href: "/platform", label: "Platform" },
  { href: "/architecture", label: "Architecture" },
  { href: "/pipeline", label: "Pipeline" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-muted/60 bg-bg-base/70 backdrop-blur-xl supports-[backdrop-filter]:bg-bg-base/55">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-500/15 text-brand-500">
            <Boxes className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span>CloudOps</span>
          <StatusPill variant="live" className="ml-1 hidden sm:inline-flex">
            live
          </StatusPill>
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-5 text-sm md:flex"
        >
          {COMMERCE_LINKS.map((l) => (
            <ActiveLink key={l.href} href={l.href} className="text-sm">
              {l.label}
            </ActiveLink>
          ))}
          <span
            aria-hidden="true"
            className="mx-1 inline-block h-4 w-px bg-border-muted"
          />
          {PLATFORM_LINKS.map((l) => (
            <ActiveLink key={l.href} href={l.href} className="text-sm">
              {l.label}
            </ActiveLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            <Link href="/cart">
              <ShoppingBag className="h-4 w-4" />
              Cart
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verify type-check + existing tests pass**

Run: `cd apps/storefront && npx tsc --noEmit && npm test`

Expected: PASS — no new errors, all existing tests green.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/storefront/src/components/site/Navbar.tsx
rtk git commit -m "feat(storefront): section navbar into commerce | platform clusters"
```

## Task 10: Repoint Footer Platform-column links

**Files:**
- Modify: `apps/storefront/src/components/site/Footer.tsx`

- [ ] **Step 1: Read current Footer**

Read `apps/storefront/src/components/site/Footer.tsx`. Find the "Platform" column (or the column listing Overview / Architecture / Pipeline / Security). Note whether links exist as `<a>` or `<Link>` and the current `href`s.

- [ ] **Step 2: Update the platform-column hrefs**

Change the four affected links to:
- `Overview` → `href="/platform"`
- `Architecture` → `href="/architecture"`
- `Pipeline` → `href="/pipeline"`
- `Security` → `href="/pipeline#security"`

If the existing labels differ slightly (e.g. "Pipeline & Security" instead of two rows), pick the closest match and leave the column structure unchanged. If links are bare `<a>`, leave them as `<a>` — do not introduce `next/link` unless the column already uses it.

- [ ] **Step 3: Verify type-check + tests**

Run: `cd apps/storefront && npx tsc --noEmit && npm test`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/storefront/src/components/site/Footer.tsx
rtk git commit -m "feat(storefront): repoint footer platform links to new routes"
```

## Task 11: Phase 1 review + simplify pass

- [ ] **Step 1: Invoke frontend-design on Phase 1 outputs**

Invoke `frontend-design:frontend-design` skill with the following prompt:
> Review these new files for the CloudOps Shop storefront — they must visually fit the existing CloudOps Dim system (`apps/storefront/src/styles/tokens.css`). Look for: token usage (no hardcoded hex outside legacy ArchPanel category colours), Tailwind v4 conventions, accessibility on the new Navbar separator. Files: `apps/storefront/src/app/layout.tsx`, `apps/storefront/src/styles/globals.css`, `apps/storefront/src/components/site/ScrollProgress.tsx`, `apps/storefront/src/components/site/nav/ActiveLink.tsx`, `apps/storefront/src/components/site/Navbar.tsx`, `apps/storefront/src/lib/{seeded-random,use-in-view,use-count-up,use-mouse-parallax}.ts`. Do not invent new visual elements — flag issues only. Under 300 words.

Apply any reasonable feedback.

- [ ] **Step 2: Invoke code-simplifier on Phase 1 diff**

Invoke `code-simplifier:code-simplifier` skill with the following prompt:
> Review files changed in commits since `HEAD~10` for clarity, consistency, maintainability. Files of interest: anything under `apps/storefront/src/lib/`, `apps/storefront/src/components/site/{ScrollProgress,Navbar,Footer}.tsx`, `apps/storefront/src/components/site/nav/ActiveLink.tsx`, `apps/storefront/src/app/layout.tsx`, `apps/storefront/src/styles/globals.css`. Preserve all functionality. Apply only obvious-win simplifications. Do not refactor the design tokens or existing pre-Phase-1 code.

- [ ] **Step 3: Final Phase 1 verification**

Run: `cd apps/storefront && npm run lint && npx tsc --noEmit && npm test`

Expected: All pass.

- [ ] **Step 4: Phase commit (if simplifier made changes)**

```bash
rtk git status
# If files changed:
rtk git add -u && rtk git commit -m "refactor(storefront): code-simplifier cleanup pass on phase 1"
```

---

# Phase 2 — Home top band (PlatformHero + ClusterOrbit + HeroLogStream)

## Task 12: ClusterOrbit SVG client component

**Files:**
- Create: `apps/storefront/src/components/site/ClusterOrbit.tsx`

- [ ] **Step 1: Implement ClusterOrbit**

Create `apps/storefront/src/components/site/ClusterOrbit.tsx`. Port the design's orbit logic from `apps/storefront/design/cloudops-frontend/project/storefront/hero-cinematic.jsx` (lines ~4–79), adapted to TypeScript + React 19. The component must:

- Use `useMouseParallax(6)` for the wrapper transform
- Show 8 pods named `["order","front","ws","search","otel","audit","image","sched"]`
- Use an SVG `viewBox="-320 -180 640 360"` with the same orbital ellipses
- Cycle the active pod every 900ms via `setInterval`
- Set `aria-hidden="true"` and `pointer-events: none`
- Use only theme variables (`var(--brand-400)`, `var(--brand-500)`, `var(--border-default)`, `var(--bg-base)`) — no hex codes
- Be wrapped in a single root `<div>` positioned `absolute inset-0`

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useMouseParallax } from "@/lib/use-mouse-parallax";

const POD_NAMES = ["order", "front", "ws", "search", "otel", "audit", "image", "sched"] as const;

export function ClusterOrbit() {
  const offset = useMouseParallax(6);
  const [activePod, setActivePod] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActivePod((p) => (p + 1) % POD_NAMES.length);
    }, 900);
    return () => clearInterval(id);
  }, []);

  const pods = useMemo(() => {
    const r = 220;
    return POD_NAMES.map((label, i) => {
      const ang = (i / POD_NAMES.length) * Math.PI * 2 - Math.PI / 2;
      return { label, x: Math.cos(ang) * r, y: Math.sin(ang) * r * 0.5, i };
    });
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.62]"
      style={{
        transform: `translate3d(${offset.x * 0.4}px, ${offset.y * 0.4}px, 0)`,
      }}
    >
      <svg
        viewBox="-320 -180 640 360"
        className="h-auto w-[110%] max-w-[1400px]"
      >
        <defs>
          <radialGradient id="cluster-pod" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.9} />
            <stop offset="60%" stopColor="var(--brand-500)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="cluster-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--brand-400)" stopOpacity={1} />
            <stop offset="60%" stopColor="var(--brand-500)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--bg-base)" stopOpacity={0} />
          </radialGradient>
          <filter id="cluster-blur">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <ellipse cx="0" cy="0" rx="300" ry="150" fill="none" stroke="rgba(94,234,212,0.12)" strokeDasharray="2 4" />
        <ellipse cx="0" cy="0" rx="220" ry="110" fill="none" stroke="rgba(94,234,212,0.16)" strokeDasharray="2 4" />
        <ellipse cx="0" cy="0" rx="130" ry="65"  fill="none" stroke="rgba(94,234,212,0.20)" strokeDasharray="2 4" />

        {pods.map((p) => (
          <line
            key={`spoke-${p.i}`}
            x1={p.x}
            y1={p.y}
            x2={0}
            y2={0}
            stroke={p.i === activePod ? "var(--brand-400)" : "rgba(94,234,212,0.20)"}
            strokeWidth={p.i === activePod ? 1.5 : 0.6}
            opacity={p.i === activePod ? 0.9 : 0.5}
          />
        ))}

        <circle cx="0" cy="0" r="38" fill="url(#cluster-core)" filter="url(#cluster-blur)" />
        <circle cx="0" cy="0" r="20" fill="var(--brand-400)" opacity={0.95}>
          <animate attributeName="r" values="18;22;18" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <text x="0" y="4" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="var(--bg-base)" fontWeight={700}>
          EKS
        </text>

        {pods.map((p) => (
          <g key={`pod-${p.i}`}>
            <circle cx={p.x} cy={p.y} r="22" fill="url(#cluster-pod)" filter="url(#cluster-blur)" opacity={p.i === activePod ? 1 : 0.55} />
            <rect
              x={p.x - 16}
              y={p.y - 11}
              width="32"
              height="22"
              rx="5"
              fill={p.i === activePod ? "rgba(94,234,212,0.9)" : "rgba(13,17,23,0.85)"}
              stroke={p.i === activePod ? "var(--brand-400)" : "rgba(94,234,212,0.35)"}
              strokeWidth={1}
            />
            <text
              x={p.x}
              y={p.y + 3}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="6.5"
              fill={p.i === activePod ? "var(--bg-base)" : "rgba(94,234,212,0.95)"}
              fontWeight={600}
            >
              {p.label}
            </text>
          </g>
        ))}

        {pods.map((p) => (
          <circle
            key={`packet-${p.i}`}
            r="2.2"
            fill="var(--brand-400)"
          >
            <animate attributeName="cx" values={`${p.x};0;${p.x}`} dur={`${2.4 + p.i * 0.2}s`} repeatCount="indefinite" />
            <animate attributeName="cy" values={`${p.y};0;${p.y}`} dur={`${2.4 + p.i * 0.2}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.95;0" dur={`${2.4 + p.i * 0.2}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/storefront/src/components/site/ClusterOrbit.tsx
rtk git commit -m "feat(storefront): add ClusterOrbit hero background SVG"
```

## Task 13: HeroLogStream client component

**Files:**
- Create: `apps/storefront/src/components/site/HeroLogStream.tsx`

- [ ] **Step 1: Implement HeroLogStream**

Create `apps/storefront/src/components/site/HeroLogStream.tsx`. Pure CSS-driven 3-column scrolling watermark; no JS state needed beyond the static log lines array.

```tsx
"use client";

const LINES = [
  "$ kubectl logs -l app=order-api --tail=4 --since=14s",
  '14:22:01.482Z  INFO  tenant=acme  order_created       order_id="549302"  dur_ms=47',
  '14:22:01.489Z  INFO  tenant=acme  audit.write         actor="usr_8a3f"  action="CREATE_ORDER"',
  '14:22:01.512Z  INFO  tenant=acme  kinesis.put         stream="orders"   bytes=412',
  '14:22:01.518Z  INFO  tenant=acme  ws.broadcast        route="order.updated"  conns=23',
  '14:22:01.601Z  INFO  tenant=acme  saga.transition     from="reserve" to="charge"  exec=7f3a8e91',
  '14:22:01.847Z  INFO  tenant=acme  stripe.charge       amount_cents=18900  status="succeeded"',
  '14:22:02.011Z  INFO  tenant=acme  saga.complete       exec=7f3a8e91  dur_ms=410',
  "$ aws stepfunctions list-executions --status-filter RUNNING",
  "7f3a8e91-4d2b-4c11-9f8a-3d7e1b0a2c5d  RUNNING  CheckoutSaga    started=14:22:01.601Z",
  "b2c4d6e8-1f3a-4b5c-9d8e-2f7a1b0c4d6e  RUNNING  RefundSaga      started=14:21:58.220Z",
  "$ kubectl get pods -n prod -l tier=api",
  "NAME                         READY   STATUS    RESTARTS   AGE",
  "order-api-7d9c6b4f8-xk2pq    1/1     Running   0          4d2h",
  "order-api-7d9c6b4f8-9wm4r    1/1     Running   0          4d2h",
  "order-api-7d9c6b4f8-c3v8t    1/1     Running   0          4d2h",
  "order-api-7d9c6b4f8-h7k1n    1/1     Running   0          4d2h",
  '14:22:03.114Z  INFO  ingress  conn_accept     remote="52.91.4.18"  tls="1.3"',
  '14:22:03.220Z  INFO  envoy    upstream_healthy clusters=12  endpoints=47',
  '14:22:03.318Z  INFO  redis    cache.hit       key="catalog:sku:8821"  ttl=298',
  '14:22:03.402Z  WARN  rds      slow_query      ms=812  rows=14',
  '14:22:03.598Z  INFO  s3       put_object      bucket="acme-invoices"  bytes=14820',
  "// p50 18ms · p95 47ms · p99 112ms · err 0.02%",
] as const;

export function HeroLogStream() {
  const block = [...LINES, ...LINES, ...LINES];
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] flex select-none gap-[4vw] px-[3vw]"
        style={{
          opacity: 0.06,
          maskImage:
            "linear-gradient(180deg, transparent 0%, black 14%, black 86%, transparent 100%), radial-gradient(ellipse 38% 32% at 50% 50%, transparent 30%, black 90%)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, black 14%, black 86%, transparent 100%), radial-gradient(ellipse 38% 32% at 50% 50%, transparent 30%, black 90%)",
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in",
        }}
      >
        {(["a", "b", "c"] as const).map((col, idx) => (
          <div
            key={col}
            className="min-w-0 flex-1 overflow-hidden whitespace-pre font-mono text-[10.5px] leading-[1.9] text-fg-base"
            style={{ marginTop: idx === 1 ? "-9vh" : 0 }}
          >
            <div className={`hero-log-col hero-log-col-${col}`}>
              {block.map((l, i) => (
                <div key={`${col}-${i}`}>{l}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes hero-log-a { from { transform: translateY(0); }            to { transform: translateY(-33.333%); } }
        @keyframes hero-log-b { from { transform: translateY(-33.333%); }     to { transform: translateY(-66.666%); } }
        @keyframes hero-log-c { from { transform: translateY(-16.666%); }     to { transform: translateY(-50%); } }
        .hero-log-col-a { animation: hero-log-a 38s linear infinite; will-change: transform; }
        .hero-log-col-b { animation: hero-log-b 46s linear infinite; will-change: transform; }
        .hero-log-col-c { animation: hero-log-c 32s linear infinite; will-change: transform; }
        @media (prefers-reduced-motion: reduce) {
          .hero-log-col-a, .hero-log-col-b, .hero-log-col-c { animation: none !important; }
        }
      `}</style>
    </>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/storefront/src/components/site/HeroLogStream.tsx
rtk git commit -m "feat(storefront): add HeroLogStream watermark for platform hero"
```

## Task 14: PlatformHero wrapper

**Files:**
- Create: `apps/storefront/src/components/site/PlatformHero.tsx`

- [ ] **Step 1: Implement PlatformHero**

Create `apps/storefront/src/components/site/PlatformHero.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { ClusterOrbit } from "./ClusterOrbit";
import { HeroLogStream } from "./HeroLogStream";

export function PlatformHero() {
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 py-20">
      <ClusterOrbit />
      <HeroLogStream />

      <div className="relative z-[2] mx-auto w-full max-w-7xl text-center">
        <div className="inline-flex">
          <StatusPill variant="live">
            v1.4.0 · production · 30-day uptime 99.94%
          </StatusPill>
        </div>

        <h1
          className="display-italic mx-auto mt-7 max-w-5xl text-fg-base"
          style={{ fontSize: "clamp(64px, 11vw, 148px)", letterSpacing: "-0.025em", lineHeight: 0.98 }}
        >
          CloudOps Platform
        </h1>

        <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-fg-muted md:text-xl">
          Multi-tenant SaaS on Kubernetes. Built for scale, designed for
          interviews — every layer instrumented, every line open source.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="brand-glow">
            <Link href="/platform">
              Explore the platform
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/architecture">
              View architecture
              <ArrowDown className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/storefront/src/components/site/PlatformHero.tsx
rtk git commit -m "feat(storefront): add PlatformHero wrapper for home top band"
```

## Task 15: Mount PlatformHero on home page

**Files:**
- Modify: `apps/storefront/src/app/page.tsx`

- [ ] **Step 1: Read current home page**

Read `apps/storefront/src/app/page.tsx`. Confirm it currently renders `<Hero /> → <TechStack /> → <FeatureGrid /> → <ArchPanel /> → <CallToAction />`.

- [ ] **Step 2: Prepend PlatformHero**

Replace the file contents with:

```tsx
import { PlatformHero } from "@/components/site/PlatformHero";
import { Hero } from "@/components/site/Hero";
import { TechStack } from "@/components/site/TechStack";
import { FeatureGrid } from "@/components/site/FeatureGrid";
import { ArchPanel } from "@/components/site/ArchPanel";
import { CallToAction } from "@/components/site/CallToAction";

export default function Home() {
  return (
    <main>
      <PlatformHero />
      <Hero />
      <TechStack />
      <FeatureGrid />
      <ArchPanel />
      <CallToAction />
    </main>
  );
}
```

- [ ] **Step 3: Verify build + tests**

Run: `cd apps/storefront && npm run build && npm test`

Expected: PASS. (If build fails on something unrelated to the new band, fix that minimally — usually it's a missing prop or a Tailwind class typo.)

- [ ] **Step 4: Commit**

```bash
rtk git add apps/storefront/src/app/page.tsx
rtk git commit -m "feat(storefront): prepend PlatformHero band above existing home Hero"
```

## Task 16: Phase 2 review + simplify pass

- [ ] **Step 1: Invoke frontend-design**

Invoke `frontend-design:frontend-design` skill with the following prompt:
> Review `apps/storefront/src/components/site/PlatformHero.tsx`, `ClusterOrbit.tsx`, `HeroLogStream.tsx`, and `apps/storefront/src/app/page.tsx`. Verify they fit the CloudOps Dim system (tokens.css), use Instrument Serif italic correctly (`display-italic` utility from globals.css), keep the existing `<Hero />` below untouched, and have no token-bypassing hex codes. Reference 21st.dev only if a pattern is non-obvious. Output under 250 words.

- [ ] **Step 2: Invoke code-simplifier**

Invoke `code-simplifier:code-simplifier` skill with the following prompt:
> Review files added/changed in the last 5 commits under `apps/storefront/src/components/site/` (Platform-prefixed + ClusterOrbit + HeroLogStream) and `apps/storefront/src/app/page.tsx`. Apply only obvious-win simplifications. Preserve the SVG content + animations verbatim.

- [ ] **Step 3: Final Phase 2 verification — manual page-load**

Run: `cd apps/storefront && npm run dev` (background).

Open `http://localhost:3000` in a browser. Confirm visually:
- New giant italic "CloudOps Platform" wordmark dominates the viewport above the existing commerce hero
- Cluster orbit SVG is visible behind the headline
- Faint log lines scroll in 3 columns at very low opacity
- Scrolling reveals the existing commerce Hero unchanged below

Kill the dev server.

- [ ] **Step 4: Phase commit**

```bash
rtk git status
# If simplifier made changes:
rtk git add -u && rtk git commit -m "refactor(storefront): code-simplifier cleanup pass on phase 2"
```

---

# Phase 3 — `/platform` page (SubHero + Journey + Bento)

## Task 17: SubHero shared component

**Files:**
- Create: `apps/storefront/src/components/site/SubHero.tsx`

- [ ] **Step 1: Implement SubHero**

Create `apps/storefront/src/components/site/SubHero.tsx`:

```tsx
interface SubHeroProps {
  eyebrow: string;
  title: string;
  italic: string;
  sub?: string;
}

export function SubHero({ eyebrow, title, italic, sub }: SubHeroProps) {
  return (
    <section className="relative overflow-hidden pb-14 pt-[140px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-120px] top-[-80px] h-[360px] w-[360px] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(45,212,191,0.22), rgba(45,212,191,0) 70%)" }}
      />

      <div className="mx-auto max-w-7xl px-6">
        <div
          className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle"
        >
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-fg-subtle" />
          <span className="text-fg-muted">{eyebrow}</span>
        </div>

        <h1
          className="m-0 max-w-[1000px] text-fg-base"
          style={{ fontSize: "clamp(48px, 7vw, 92px)", lineHeight: 1 }}
        >
          {title}{" "}
          <span className="display-italic">{italic}</span>
        </h1>

        {sub ? (
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-fg-muted md:text-xl">
            {sub}
          </p>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/storefront/src/components/site/SubHero.tsx
rtk git commit -m "feat(storefront): add shared SubHero for platform pages"
```

## Task 18: Journey — 5-panel with sticky rail

**Files:**
- Create: `apps/storefront/src/components/site/Journey.tsx`

- [ ] **Step 1: Implement Journey**

Create `apps/storefront/src/components/site/Journey.tsx`. Sticky left rail (220px) + vertical panel stack. Each panel has heading + sub-headline + paragraph + an inline visual on the right. Active step tracked via IntersectionObserver.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface Step {
  id: string;
  label: string;
  heading: string;
  italic: string;
  paragraph: string;
}

const STEPS: Step[] = [
  {
    id: "isolation",
    label: "isolation",
    heading: "Row-Level Security",
    italic: "Every query. Every tenant. Zero trust.",
    paragraph:
      "Postgres RLS with FORCE. Tenant context bound at JWT verify — even the table owner can't bypass the boundary.",
  },
  {
    id: "workflows",
    label: "workflows",
    heading: "Sagas & Streams",
    italic: "Durable. Idempotent. Replayable.",
    paragraph:
      "Step Functions Standard SM for checkout. Kinesis for order events. Compensation on every failure path.",
  },
  {
    id: "visibility",
    label: "visibility",
    heading: "Full-stack telemetry",
    italic: "Three signals, one collector.",
    paragraph:
      "OpenTelemetry SDK across the storefront + order-api. Tail-sampled traces, RED metrics, structured pino logs — all shipped through the OTel Collector.",
  },
  {
    id: "defense",
    label: "defense",
    heading: "Zero-trust stack",
    italic: "Defense at every layer.",
    paragraph:
      "Cognito at the edge. CSP + HSTS + COOP at the transport. RLS at the data. Cosign + Trivy + Gatekeeper at the supply chain.",
  },
  {
    id: "shipping",
    label: "shipping",
    heading: "Production ready",
    italic: "Eleven gates between push and prod.",
    paragraph:
      "PR → lint → test → build → sign → scan → plan → approve → deploy → verify → auto-rollback. Manual approval gate on the OIDC environment.",
  },
];

export function Journey() {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = refs.current.findIndex((r) => r === entry.target);
            if (idx >= 0) setActive(idx);
          }
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0.01 },
    );
    refs.current.forEach((r) => r && observer.observe(r));
    return () => observer.disconnect();
  }, []);

  const onRailClick = (idx: number) => {
    const el = refs.current[idx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <section className="mx-auto max-w-7xl px-6 pb-24">
      <div className="grid gap-14 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-3">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onRailClick(i)}
                className={`group block w-full text-left transition-colors ${
                  i === active ? "text-fg-base" : "text-fg-subtle"
                }`}
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
                  {String(i + 1).padStart(2, "0")} · {s.label}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-20">
          {STEPS.map((s, i) => (
            <article
              key={s.id}
              id={`journey-${s.id}`}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="grid items-start gap-10 md:grid-cols-2"
            >
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-400">
                  {String(i + 1).padStart(2, "0")} · {s.label}
                </div>
                <h2
                  className="mt-4 text-fg-base"
                  style={{ fontSize: "clamp(28px, 3.4vw, 40px)", lineHeight: 1.05 }}
                >
                  {s.heading}
                </h2>
                <p className="display-italic mt-3 text-2xl text-brand-400">
                  {s.italic}
                </p>
                <p className="mt-5 max-w-prose text-base leading-relaxed text-fg-muted">
                  {s.paragraph}
                </p>
              </div>
              <JourneyVisual stepId={s.id} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function JourneyVisual({ stepId }: { stepId: string }) {
  // One placeholder visual per step. Each is a small static glass surface so
  // the Journey reads as paired text + visual. Detailed visuals (the full
  // RLS code block, the OTel diagram, etc.) live in the Bento and elsewhere.
  return (
    <div className="rounded-xl border border-border-default/80 bg-bg-raised/60 p-6 backdrop-blur">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fg-subtle">
        step · {stepId}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-12 rounded-md border border-border-muted ${
              i % 3 === 0 ? "bg-brand-500/10" : "bg-bg-elev/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/storefront/src/components/site/Journey.tsx
rtk git commit -m "feat(storefront): add Journey 5-panel with sticky rail"
```

## Task 19: CodeBlock + Bento mini diagrams

**Files:**
- Create: `apps/storefront/src/components/site/CodeBlock.tsx`
- Create: `apps/storefront/src/components/site/CognitoDiagram.tsx`
- Create: `apps/storefront/src/components/site/SearchDiagram.tsx`
- Create: `apps/storefront/src/components/site/RealtimeDiagram.tsx`
- Create: `apps/storefront/src/components/site/SagaDiagram.tsx`

- [ ] **Step 1: Implement CodeBlock**

Create `apps/storefront/src/components/site/CodeBlock.tsx`:

```tsx
type Token = ["kw" | "ident" | "str" | "fn" | "com" | "num", string];
export type CodeLine = Token[];

const colors: Record<Token[0], string> = {
  kw:    "text-[#ff7b72]",
  ident: "text-fg-base",
  str:   "text-brand-400",
  fn:    "text-[#d2a8ff]",
  com:   "text-fg-subtle italic",
  num:   "text-[#f0883e]",
};

export function CodeBlock({ lines }: { lines: CodeLine[] }) {
  return (
    <pre className="m-0 flex-1 overflow-auto whitespace-pre rounded-lg border border-border-default bg-bg-base/65 p-4 font-mono text-xs leading-7">
      {lines.map((tokens, i) => (
        <div key={i}>
          {tokens.map(([kind, text], j) => (
            <span key={j} className={colors[kind]}>{text}</span>
          ))}
        </div>
      ))}
    </pre>
  );
}
```

- [ ] **Step 2: Implement CognitoDiagram**

Create `apps/storefront/src/components/site/CognitoDiagram.tsx`:

```tsx
"use client";

const NODES = [
  { x: 30,  label: "browser" },
  { x: 160, label: "middleware" },
  { x: 290, label: "Express" },
  { x: 415, label: "Lambda" },
  { x: 540, label: "WS" },
] as const;

export function CognitoDiagram() {
  return (
    <svg viewBox="0 0 600 130" className="h-auto w-full flex-1">
      <defs>
        <linearGradient id="cg-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.5} />
          <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0.1} />
        </linearGradient>
      </defs>

      {NODES.slice(0, -1).map((n, i) => {
        const next = NODES[i + 1];
        return (
          <line
            key={i}
            x1={n.x + 50}
            y1={60}
            x2={next.x}
            y2={60}
            stroke="url(#cg-edge)"
            strokeWidth={1.5}
            strokeDasharray="3 4"
          />
        );
      })}

      <circle r="5" fill="var(--brand-400)" style={{ filter: "drop-shadow(0 0 6px var(--brand-400))" }}>
        <animate attributeName="cx" values="30;560" dur="4s" repeatCount="indefinite" />
        <animate attributeName="cy" values="60;60" dur="4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;1;0" dur="4s" repeatCount="indefinite" />
      </circle>

      {NODES.map((n) => (
        <g key={n.label}>
          <rect x={n.x} y={42} width={100} height={36} rx={6} fill="rgba(22,27,34,0.9)" stroke="var(--border-default)" strokeWidth={1} />
          <text x={n.x + 50} y={65} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11" fill="var(--fg-base)">{n.label}</text>
        </g>
      ))}

      {[
        { x: 80,  text: "Bearer JWT" },
        { x: 210, text: "JWKS verify" },
        { x: 340, text: "tenant_id" },
        { x: 465, text: "claims pass" },
      ].map((l) => (
        <text key={l.x} x={l.x} y={118} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-subtle)">
          {l.text}
        </text>
      ))}
    </svg>
  );
}
```

- [ ] **Step 3: Implement SearchDiagram**

Create `apps/storefront/src/components/site/SearchDiagram.tsx`:

```tsx
const NODES = [
  { x: 20,  label: "API GW", highlight: false },
  { x: 160, label: "Lambda + LRU", highlight: true },
  { x: 320, label: "Express", highlight: false },
  { x: 460, label: "PG · tsvector", highlight: false },
] as const;

export function SearchDiagram() {
  return (
    <svg viewBox="0 0 600 130" className="h-auto w-full flex-1">
      {NODES.map((n, i) => (
        <g key={n.label}>
          <rect
            x={n.x}
            y={42}
            width={120}
            height={36}
            rx={6}
            fill={n.highlight ? "rgba(45,212,191,0.08)" : "rgba(22,27,34,0.9)"}
            stroke={n.highlight ? "rgba(94,234,212,0.5)" : "var(--border-default)"}
            strokeWidth={1}
          />
          <text
            x={n.x + 60}
            y={65}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="11"
            fill={n.highlight ? "var(--brand-400)" : "var(--fg-base)"}
          >
            {n.label}
          </text>
          {i < NODES.length - 1 ? (
            <line
              x1={n.x + 120}
              y1={60}
              x2={NODES[i + 1].x}
              y2={60}
              stroke="var(--border-default)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          ) : null}
        </g>
      ))}
      <text x={180} y={100} fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--brand-400)">
        cache hit · warm &lt; 100ms
      </text>
      <text x={180} y={115} fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-subtle)">
        cache miss · ~280ms cold start
      </text>
    </svg>
  );
}
```

- [ ] **Step 4: Implement RealtimeDiagram**

Create `apps/storefront/src/components/site/RealtimeDiagram.tsx`:

```tsx
"use client";

const NODES = [
  { x: 12,  w: 102, label: "Express",     highlight: false },
  { x: 132, w: 102, label: "Kinesis",     highlight: false },
  { x: 252, w: 102, label: "ws-fanout λ", highlight: true  },
  { x: 387, w: 110, label: "API GW WS",   highlight: false },
  { x: 510, w: 80,  label: "Browser",     highlight: false },
] as const;

export function RealtimeDiagram() {
  return (
    <svg viewBox="0 0 600 130" className="h-auto w-full flex-1">
      {NODES.map((n) => (
        <g key={n.label}>
          <rect
            x={n.x}
            y={42}
            width={n.w}
            height={36}
            rx={6}
            fill={n.highlight ? "rgba(45,212,191,0.08)" : "rgba(22,27,34,0.9)"}
            stroke={n.highlight ? "rgba(94,234,212,0.5)" : "var(--border-default)"}
            strokeWidth={1}
          />
          <text
            x={n.x + n.w / 2}
            y={65}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="10.5"
            fill={n.highlight ? "var(--brand-400)" : "var(--fg-base)"}
          >
            {n.label}
          </text>
        </g>
      ))}
      {NODES.slice(0, -1).map((n, i) => (
        <line
          key={i}
          x1={n.x + n.w}
          y1={60}
          x2={NODES[i + 1].x}
          y2={60}
          stroke="var(--border-default)"
          strokeDasharray="2 3"
        />
      ))}
      <circle r="4" fill="var(--brand-400)" style={{ filter: "drop-shadow(0 0 5px var(--brand-400))" }}>
        <animate attributeName="cx" values="12;590" dur="3.4s" repeatCount="indefinite" />
        <animate attributeName="cy" values="60;60" dur="3.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;1;0" dur="3.4s" repeatCount="indefinite" />
      </circle>
      <text x={300} y={115} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-subtle)">
        reconnect ≤ 30s · full-jitter backoff
      </text>
    </svg>
  );
}
```

- [ ] **Step 5: Implement SagaDiagram**

Create `apps/storefront/src/components/site/SagaDiagram.tsx`:

```tsx
const STAGES = ["Idempotency", "CreateOrder", "EnqueueEmail", "DeliverEmail", "Done"] as const;

export function SagaDiagram() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {STAGES.map((s, i) => {
          const last = i === STAGES.length - 1;
          return (
            <span key={s} className="flex items-center gap-2">
              <span
                className={`whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10.5px] ${
                  last
                    ? "border-success/35 bg-success/10 text-success"
                    : "border-border-default bg-bg-raised/80 text-fg-base"
                }`}
              >
                {s}
              </span>
              {!last ? (
                <span className="font-mono text-xs text-fg-subtle">→</span>
              ) : null}
            </span>
          );
        })}
      </div>
      <div className="font-mono text-[11px] text-fg-subtle">
        Step Functions <span className="text-brand-400">Standard</span> · retries · compensate on failure
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/storefront/src/components/site/CodeBlock.tsx apps/storefront/src/components/site/CognitoDiagram.tsx apps/storefront/src/components/site/SearchDiagram.tsx apps/storefront/src/components/site/RealtimeDiagram.tsx apps/storefront/src/components/site/SagaDiagram.tsx
rtk git commit -m "feat(storefront): add CodeBlock + 4 bento mini diagrams"
```

## Task 20: BentoTile + Bento grid

**Files:**
- Create: `apps/storefront/src/components/site/BentoTile.tsx`
- Create: `apps/storefront/src/components/site/Bento.tsx`

- [ ] **Step 1: Implement BentoTile**

Create `apps/storefront/src/components/site/BentoTile.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

interface BentoTileProps {
  href: string;
  adr: string;
  tag: string;
  heading: string;
  caption: string;
  span: number;
  rowSpan?: number;
  children: ReactNode;
}

export function BentoTile({ href, adr, tag, heading, caption, span, rowSpan, children }: BentoTileProps) {
  return (
    <Link
      href={href}
      className="bento-tile group flex min-h-[220px] flex-col gap-4 rounded-xl border border-border-default/80 bg-bg-raised/55 p-6 backdrop-blur-md transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.5),0_0_28px_-8px_rgba(45,212,191,0.25)]"
      style={{ gridColumn: `span ${span}`, gridRow: rowSpan ? `span ${rowSpan}` : undefined }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg-subtle">{tag}</span>
          <h3 className="m-0 text-2xl text-fg-base">{heading}</h3>
        </div>
        <span className="shrink-0 font-mono text-[10.5px] text-fg-subtle">{adr}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <p className="m-0 text-[13.5px] leading-snug text-fg-muted">{caption}</p>
    </Link>
  );
}
```

- [ ] **Step 2: Implement Bento grid**

Create `apps/storefront/src/components/site/Bento.tsx`:

```tsx
import { BentoTile } from "./BentoTile";
import { CodeBlock, type CodeLine } from "./CodeBlock";
import { CognitoDiagram } from "./CognitoDiagram";
import { SearchDiagram } from "./SearchDiagram";
import { RealtimeDiagram } from "./RealtimeDiagram";
import { SagaDiagram } from "./SagaDiagram";

const RLS_LINES: CodeLine[] = [
  [["kw", "ALTER TABLE"], ["ident", " orders "], ["kw", "ENABLE ROW LEVEL SECURITY"], ["ident", ";"]],
  [["kw", "ALTER TABLE"], ["ident", " orders "], ["kw", "FORCE ROW LEVEL SECURITY"], ["ident", ";"]],
  [["ident", ""]],
  [["kw", "CREATE POLICY"], ["ident", " tenant_isolation "], ["kw", "ON"], ["ident", " orders"]],
  [["ident", "  "], ["kw", "USING"], ["ident", " (tenant_id = "], ["fn", "current_setting"], ["ident", "("], ["str", "'app.tenant'"], ["ident", ")::uuid);"]],
  [["ident", ""]],
  [["com", "-- TS helper: withTenant(req, async (db) => …)"]],
  [["com", "-- Sets app.tenant per-connection. Pool-safe."]],
];

export function Bento() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-24">
      <div className="mb-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          S03 · how it works
        </div>
        <h2 className="mt-3 max-w-3xl text-fg-base" style={{ fontSize: "clamp(40px, 5vw, 60px)", lineHeight: 1.05 }}>
          Five primitives, all the way down.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-fg-muted">
          Click any tile to jump to the running surface. ADRs are linked top-right.
        </p>
      </div>

      <div className="bento-grid grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
        <BentoTile
          href="/products"
          adr="ADR-014"
          tag="TILE 01 · multi-tenancy"
          heading="A forgotten WHERE can't leak."
          caption="Force-RLS on every customer table — even the table owner can't bypass the boundary. JWT-bound tenant context set per request."
          span={8}
          rowSpan={2}
        >
          <CodeBlock lines={RLS_LINES} />
        </BentoTile>

        <BentoTile
          href="/login"
          adr="ADR-016"
          tag="TILE 02 · auth"
          heading="JWT, end-to-end."
          caption="Cognito PKCE. Browser → middleware → Express → Lambda. Verified once, passed everywhere."
          span={4}
          rowSpan={2}
        >
          <CognitoDiagram />
        </BentoTile>

        <BentoTile
          href="/products"
          adr="ADR-017"
          tag="TILE 03 · search"
          heading="Warm < 100 ms."
          caption="Hybrid: API Gateway → Lambda (LRU 60s) → Express → Postgres tsvector. No Elastic required."
          span={4}
        >
          <SearchDiagram />
        </BentoTile>

        <BentoTile
          href="/orders"
          adr="ADR-018"
          tag="TILE 04 · realtime"
          heading="Push, not poll."
          caption="Express writes to Kinesis; ws-fanout Lambda broadcasts to API GW WS. Reconnect ≤ 30 s, full jitter."
          span={4}
        >
          <RealtimeDiagram />
        </BentoTile>

        <BentoTile
          href="/checkout"
          adr="ADR-019"
          tag="TILE 05 · saga"
          heading="Checkout, durable."
          caption="Step Functions Standard SM. Idempotent, retries with backoff, compensates on failure."
          span={4}
        >
          <SagaDiagram />
        </BentoTile>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/storefront/src/components/site/BentoTile.tsx apps/storefront/src/components/site/Bento.tsx
rtk git commit -m "feat(storefront): add Bento grid (5 tiles) for /platform"
```

## Task 21: /platform route + page test

**Files:**
- Create: `apps/storefront/src/app/platform/page.tsx`
- Create: `apps/storefront/test/routes/platform-page.test.tsx`

- [ ] **Step 1: Write the failing route test**

Create `apps/storefront/test/routes/platform-page.test.tsx`:

```tsx
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import PlatformPage from "../../src/app/platform/page.tsx";

test("/platform renders SubHero + Journey + Bento markers", () => {
  const html = renderToString(<PlatformPage />);
  assert.ok(html.includes("the platform journey"), "missing SubHero eyebrow");
  assert.ok(html.includes("From browser to bedrock,"), "missing SubHero title");
  assert.ok(html.includes("in five panels."), "missing SubHero italic suffix");
  assert.ok(html.includes("Row-Level Security"), "missing Journey step 01");
  assert.ok(html.includes("Five primitives, all the way down."), "missing Bento heading");
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd apps/storefront && npx tsx --test test/routes/platform-page.test.tsx`

Expected: FAIL — `src/app/platform/page.tsx` does not exist.

- [ ] **Step 3: Implement the page**

Create `apps/storefront/src/app/platform/page.tsx`:

```tsx
import { SubHero } from "@/components/site/SubHero";
import { Journey } from "@/components/site/Journey";
import { Bento } from "@/components/site/Bento";

export const metadata = {
  title: "Platform · CloudOps",
  description:
    "The five primitives that make a multi-tenant SaaS on EKS feel boring in the best way.",
};

export default function PlatformPage() {
  return (
    <main>
      <SubHero
        eyebrow="the platform journey"
        title="From browser to bedrock,"
        italic="in five panels."
        sub="The five primitives that make a multi-tenant SaaS on EKS feel boring in the best way."
      />
      <Journey />
      <Bento />
    </main>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/storefront && npx tsx --test test/routes/platform-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Verify build + full test suite**

Run: `cd apps/storefront && npm test && npm run build`

Expected: PASS — `/platform` shows in the build output as a new route.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/storefront/src/app/platform/page.tsx apps/storefront/test/routes/platform-page.test.tsx
rtk git commit -m "feat(storefront): add /platform route"
```

## Task 22: Phase 3 review + simplify pass

- [ ] **Step 1: Invoke frontend-design**

Invoke `frontend-design:frontend-design` skill:
> Review `apps/storefront/src/components/site/{SubHero,Journey,Bento,BentoTile,CodeBlock,CognitoDiagram,SearchDiagram,RealtimeDiagram,SagaDiagram}.tsx` and `apps/storefront/src/app/platform/page.tsx`. Verify CloudOps Dim token usage (no stray hex codes), check the bento grid breakpoint behaviour matches the spec (col-span-12 → col-span-6 at md, single column at sm), check the Journey sticky-rail behaviour (lg+ only — mobile shows panels with no rail). Reference 21st.dev only if a bento or sticky-rail pattern is non-obvious. Under 300 words.

- [ ] **Step 2: Invoke code-simplifier**

Invoke `code-simplifier:code-simplifier` skill:
> Review files added in the last ~8 commits under `apps/storefront/src/components/site/` (SubHero, Journey, Bento*, *Diagram, CodeBlock) and `apps/storefront/src/app/platform/page.tsx`. Apply only obvious-win simplifications. Preserve SVG geometry verbatim.

- [ ] **Step 3: Phase 3 verification**

Run: `cd apps/storefront && npm run lint && npx tsc --noEmit && npm test`

Manual page-load check: start dev server, visit `http://localhost:3000/platform`. Confirm:
- Sub-hero displays the eyebrow + 2-line title with italic suffix
- Journey shows the sticky rail on the left at desktop width, lights up the active step on scroll
- Bento grid shows the 5 tiles with the big multi-tenancy SQL tile spanning 8 columns, 2 rows

Kill the dev server.

- [ ] **Step 4: Phase commit**

```bash
rtk git status
# If simplifier made changes:
rtk git add -u && rtk git commit -m "refactor(storefront): code-simplifier cleanup pass on phase 3"
```

---

# Phase 4 — `/architecture` page (FlowRows polish + FullArchDiagram)

## Task 23: Polish existing ArchPanel — sticky sub-nav + animated packets + hover dim

**Files:**
- Modify: `apps/storefront/src/components/site/ArchPanel.tsx`

- [ ] **Step 1: Add sticky sub-nav above the CardContent**

In `apps/storefront/src/components/site/ArchPanel.tsx`, after the `<CardHeader>` block (around the part that closes `</CardHeader>`) and before `<CardContent>`, insert:

```tsx
<div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 border-b border-border-muted/60 bg-bg-raised/85 px-6 py-2 backdrop-blur">
  {flows.map((f) => (
    <a
      key={f.label}
      href={`#flow-${f.label.toLowerCase().replace(/\s+/g, "-")}`}
      className="rounded-full border border-border-muted/60 bg-bg-raised/60 px-3 py-1 font-mono text-[10.5px] uppercase tracking-wider text-fg-muted transition-colors hover:border-brand-500/40 hover:text-fg-base"
    >
      <span aria-hidden="true" className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${accentBar[f.accent]}`} />
      {f.label}
    </a>
  ))}
</div>
```

- [ ] **Step 2: Tag each flow row with `id` + apply hover-dim styling**

Find the existing `{flows.map((flow) => (` block. Change the outer `<div className="space-y-3">` to:

```tsx
<div
  key={flow.label}
  id={`flow-${flow.label.toLowerCase().replace(/\s+/g, "-")}`}
  className="arch-flow-row group relative space-y-3 transition-opacity"
>
```

Append this `<style>` block at the bottom of the `ArchPanel` JSX (just before the closing `</section>`):

```tsx
<style>{`
  .arch-flow-row { opacity: 1; }
  .arch-flow-row:has(~ .arch-flow-row:hover),
  .arch-flow-row:hover ~ .arch-flow-row { opacity: 0.6; }
  .arch-flow-row:hover { opacity: 1; }

  .arch-packet {
    position: absolute;
    top: calc(50% - 3px);
    left: 0;
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: var(--brand-400);
    box-shadow: 0 0 6px var(--brand-400);
    animation: arch-packet-flow 4s linear infinite;
    pointer-events: none;
  }
  @keyframes arch-packet-flow {
    0%   { left: 0%;   opacity: 0; }
    10%  {            opacity: 1; }
    90%  {            opacity: 1; }
    100% { left: 100%; opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .arch-packet { animation: none !important; opacity: 0 !important; }
  }
`}</style>
```

- [ ] **Step 3: Insert one `arch-packet` per row inside the `<div className="flex items-start gap-2">` row**

Change the inner row's wrapping `<div>` to make it `relative`, and append the packet element as the last child:

```tsx
<div className="relative flex items-start gap-2">
  {flow.nodes.map((node, idx) => (
    /* existing ServiceTile + ChevronRight code unchanged */
  ))}
  <span aria-hidden="true" className="arch-packet" />
</div>
```

- [ ] **Step 4: Verify build + tests**

Run: `cd apps/storefront && npm run build && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/storefront/src/components/site/ArchPanel.tsx
rtk git commit -m "feat(storefront): polish ArchPanel — sticky sub-nav, animated packets, hover dim"
```

## Task 24: FullArchDiagram client component

**Files:**
- Create: `apps/storefront/src/components/site/FullArchDiagram.tsx`

This component is large (~400 LOC). It contains a static node layout (the 24 services across 7 layers) and edges between them, with SVG `<animateMotion>` packets traveling along each edge. It uses `useInView` so the stagger animation runs once per page-load.

- [ ] **Step 1: Implement FullArchDiagram**

Create `apps/storefront/src/components/site/FullArchDiagram.tsx`. Use this structure verbatim:

```tsx
"use client";

import { useInView } from "@/lib/use-in-view";

type Layer =
  | "client"
  | "ingress"
  | "compute"
  | "data"
  | "messaging"
  | "identity"
  | "observability";

type Category =
  | "compute"
  | "database"
  | "storage"
  | "networking"
  | "security"
  | "integration"
  | "analytics"
  | "ml"
  | "frontend"
  | "client";

interface Node {
  id: string;
  name: string;
  detail?: string;
  layer: Layer;
  category: Category;
  x: number; // SVG x, 0-1200
  y: number; // SVG y, 0-720
}

const CATEGORY_COLOR: Record<Category, string> = {
  compute:     "#ED7100",
  database:    "#3B48CC",
  storage:     "#7AA116",
  networking:  "#8C4FFF",
  security:    "#DD344C",
  integration: "#E7157B",
  analytics:   "#5A4FCF",
  ml:          "#01A88D",
  frontend:    "#2dd4bf",
  client:      "#687480",
};

// 24 nodes across 7 horizontal lanes. Y per lane.
const LANE_Y: Record<Layer, number> = {
  client:        60,
  ingress:      150,
  compute:      270,
  data:         400,
  messaging:    490,
  identity:     580,
  observability:660,
};

const NODES: Node[] = [
  { id: "browser",    name: "Browser",         layer: "client",        category: "client",      x:  80, y: LANE_Y.client },
  { id: "cf",         name: "CloudFront",      layer: "client",        category: "networking",  x: 320, y: LANE_Y.client },
  { id: "alb",        name: "ALB",             layer: "ingress",       category: "networking",  x: 160, y: LANE_Y.ingress },
  { id: "waf",        name: "WAF",             layer: "ingress",       category: "security",    x: 360, y: LANE_Y.ingress },
  { id: "apigw-http", name: "API GW HTTP",     layer: "ingress",       category: "networking",  x: 600, y: LANE_Y.ingress },
  { id: "apigw-ws",   name: "API GW WS",       layer: "ingress",       category: "networking",  x: 840, y: LANE_Y.ingress },
  { id: "next",       name: "Next.js · EKS",   layer: "compute",       category: "frontend",    x: 160, y: LANE_Y.compute },
  { id: "express",    name: "Express · EKS",   layer: "compute",       category: "compute",     x: 380, y: LANE_Y.compute },
  { id: "search-l",   name: "search-gateway λ",layer: "compute",       category: "compute",     x: 600, y: LANE_Y.compute },
  { id: "ws-l",       name: "ws-fanout λ",     layer: "compute",       category: "compute",     x: 820, y: LANE_Y.compute },
  { id: "image-l",    name: "image-resize λ",  layer: "compute",       category: "compute",     x:1020, y: LANE_Y.compute },
  { id: "email-l",    name: "order-email λ",   layer: "compute",       category: "compute",     x:1180, y: LANE_Y.compute },
  { id: "pg",         name: "RDS Postgres",    layer: "data",          category: "database",    x: 380, y: LANE_Y.data },
  { id: "ddb",        name: "DynamoDB",        layer: "data",          category: "database",    x: 600, y: LANE_Y.data },
  { id: "s3",         name: "S3",              layer: "data",          category: "storage",     x: 820, y: LANE_Y.data },
  { id: "kinesis",    name: "Kinesis",         layer: "messaging",     category: "analytics",   x: 600, y: LANE_Y.messaging },
  { id: "sfn",        name: "Step Functions",  layer: "messaging",     category: "integration", x: 820, y: LANE_Y.messaging },
  { id: "sqs",        name: "SQS",             layer: "messaging",     category: "integration", x:1020, y: LANE_Y.messaging },
  { id: "ses",        name: "SES",             layer: "messaging",     category: "integration", x:1180, y: LANE_Y.messaging },
  { id: "cognito",    name: "Cognito",         layer: "identity",      category: "security",    x: 380, y: LANE_Y.identity },
  { id: "iam",        name: "IAM · IRSA",      layer: "identity",      category: "security",    x: 600, y: LANE_Y.identity },
  { id: "sm",         name: "Secrets Mgr",     layer: "identity",      category: "security",    x: 820, y: LANE_Y.identity },
  { id: "kms",        name: "KMS",             layer: "identity",      category: "security",    x:1020, y: LANE_Y.identity },
  { id: "otel",       name: "OTel Collector",  layer: "observability", category: "analytics",   x: 600, y: LANE_Y.observability },
];

interface Edge {
  from: string;
  to: string;
}

const EDGES: Edge[] = [
  { from: "browser", to: "cf" },
  { from: "cf", to: "alb" },
  { from: "alb", to: "waf" },
  { from: "waf", to: "apigw-http" },
  { from: "apigw-http", to: "search-l" },
  { from: "apigw-ws", to: "ws-l" },
  { from: "alb", to: "next" },
  { from: "next", to: "express" },
  { from: "express", to: "pg" },
  { from: "express", to: "ddb" },
  { from: "express", to: "kinesis" },
  { from: "search-l", to: "express" },
  { from: "ws-l", to: "ddb" },
  { from: "kinesis", to: "ws-l" },
  { from: "express", to: "sfn" },
  { from: "sfn", to: "sqs" },
  { from: "sqs", to: "email-l" },
  { from: "email-l", to: "ses" },
  { from: "next", to: "cognito" },
  { from: "express", to: "cognito" },
  { from: "express", to: "iam" },
  { from: "iam", to: "sm" },
  { from: "sm", to: "kms" },
  { from: "image-l", to: "s3" },
  { from: "express", to: "s3" },
  { from: "express", to: "otel" },
  { from: "next", to: "otel" },
  { from: "search-l", to: "otel" },
  { from: "ws-l", to: "otel" },
];

const NODE_W = 130;
const NODE_H = 44;

function nodeById(id: string): Node {
  const n = NODES.find((x) => x.id === id);
  if (!n) throw new Error(`unknown node ${id}`);
  return n;
}

function edgePath(e: Edge): string {
  const a = nodeById(e.from);
  const b = nodeById(e.to);
  const ax = a.x + NODE_W / 2;
  const ay = a.y + NODE_H / 2;
  const bx = b.x + NODE_W / 2;
  const by = b.y + NODE_H / 2;
  const cx = (ax + bx) / 2;
  return `M ${ax} ${ay} C ${cx} ${ay}, ${cx} ${by}, ${bx} ${by}`;
}

export function FullArchDiagram() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.15 });

  return (
    <section className="mx-auto max-w-7xl px-6 pb-24">
      <div className="mb-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          full architecture
        </div>
        <h2 className="mt-3 max-w-3xl text-fg-base" style={{ fontSize: "clamp(28px, 3.4vw, 40px)", lineHeight: 1.05 }}>
          One diagram. Every layer.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-fg-muted">
          Twenty-four services across seven layers. Hover any node to dim
          unrelated edges.
        </p>
      </div>

      <div
        ref={ref}
        className={`full-arch ${inView ? "is-in" : ""} overflow-auto rounded-xl border border-border-default/80 bg-bg-raised/45 p-4 backdrop-blur`}
      >
        <svg viewBox="0 0 1280 720" className="h-auto min-w-[1100px] w-full">
          <defs>
            <marker id="arch-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--border-default)" />
            </marker>
          </defs>

          {EDGES.map((e, i) => (
            <g key={`edge-${i}`} className="arch-edge">
              <path id={`edge-path-${i}`} d={edgePath(e)} fill="none" stroke="var(--border-default)" strokeWidth={1} strokeDasharray="3 4" markerEnd="url(#arch-arrow)" />
              <circle r="3" fill="var(--brand-400)" style={{ filter: "drop-shadow(0 0 4px var(--brand-400))" }}>
                <animateMotion dur={`${3 + (i % 4)}s`} repeatCount="indefinite" begin={`${(i % 6) * 0.4}s`}>
                  <mpath href={`#edge-path-${i}`} />
                </animateMotion>
              </circle>
            </g>
          ))}

          {NODES.map((n, i) => (
            <g key={n.id} className="arch-node" style={{ animationDelay: `${i * 50}ms` }}>
              <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={6} fill="rgba(22,27,34,0.95)" stroke="var(--border-default)" strokeWidth={1} />
              <rect x={n.x} y={n.y} width={NODE_W} height={4} rx={2} fill={CATEGORY_COLOR[n.category]} />
              <text x={n.x + NODE_W / 2} y={n.y + 26} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10.5" fill="var(--fg-base)">
                {n.name}
              </text>
              {n.detail ? (
                <text x={n.x + NODE_W / 2} y={n.y + 38} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-subtle)">
                  {n.detail}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>

      <style>{`
        .full-arch .arch-node    { opacity: 0; transform: translateY(6px); }
        .full-arch .arch-edge    { opacity: 0; }
        .full-arch.is-in .arch-node { animation: arch-node-fade 0.6s ease both; }
        .full-arch.is-in .arch-edge { animation: arch-edge-fade 1.2s ease both; }
        @keyframes arch-node-fade { to { opacity: 1; transform: translateY(0); } }
        @keyframes arch-edge-fade { to { opacity: 1; } }

        .arch-node:hover rect:first-child { stroke: var(--brand-400); }

        @media (prefers-reduced-motion: reduce) {
          .full-arch .arch-node, .full-arch .arch-edge { opacity: 1 !important; transform: none !important; animation: none !important; }
        }
      `}</style>
    </section>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/storefront/src/components/site/FullArchDiagram.tsx
rtk git commit -m "feat(storefront): add FullArchDiagram — 24-service animated SVG"
```

## Task 25: /architecture route + page test

**Files:**
- Create: `apps/storefront/src/app/architecture/page.tsx`
- Create: `apps/storefront/test/routes/architecture-page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/test/routes/architecture-page.test.tsx`:

```tsx
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import ArchitecturePage from "../../src/app/architecture/page.tsx";

test("/architecture renders SubHero + flow rows + full diagram", () => {
  const html = renderToString(<ArchitecturePage />);
  assert.ok(html.includes("architecture"), "missing SubHero eyebrow");
  assert.ok(html.includes("actually whiteboard."), "missing SubHero italic suffix");
  assert.ok(html.includes("One request, four surfaces"), "missing ArchPanel header");
  assert.ok(html.includes("One diagram. Every layer."), "missing FullArchDiagram heading");
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd apps/storefront && npx tsx --test test/routes/architecture-page.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the page**

Create `apps/storefront/src/app/architecture/page.tsx`:

```tsx
import { SubHero } from "@/components/site/SubHero";
import { ArchPanel } from "@/components/site/ArchPanel";
import { FullArchDiagram } from "@/components/site/FullArchDiagram";

export const metadata = {
  title: "Architecture · CloudOps",
  description:
    "Four flows plus one full picture. Hover any node for tech, cost, and ownership.",
};

export default function ArchitecturePage() {
  return (
    <main>
      <SubHero
        eyebrow="architecture"
        title="The same diagram you'd"
        italic="actually whiteboard."
        sub="Four flows plus one full picture. Hover any node for tech, cost, and ownership."
      />
      <ArchPanel />
      <FullArchDiagram />
    </main>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/storefront && npx tsx --test test/routes/architecture-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Build + full test suite**

Run: `cd apps/storefront && npm run build && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/storefront/src/app/architecture/page.tsx apps/storefront/test/routes/architecture-page.test.tsx
rtk git commit -m "feat(storefront): add /architecture route"
```

## Task 26: Phase 4 review + simplify pass

- [ ] **Step 1: Invoke frontend-design**

Invoke `frontend-design:frontend-design` skill:
> Review the polished `apps/storefront/src/components/site/ArchPanel.tsx` and the new `FullArchDiagram.tsx` + `apps/storefront/src/app/architecture/page.tsx`. Verify the sticky sub-nav doesn't fight the global Navbar's `top-0 z-40` (use `top-16 z-10` — already specified). Check edge paths in FullArchDiagram render sensibly. Reference 21st.dev only for architecture-diagram patterns if needed. Under 300 words.

- [ ] **Step 2: Invoke code-simplifier**

Invoke `code-simplifier:code-simplifier` skill:
> Review files changed in the last 4 commits under `apps/storefront/src/components/site/{ArchPanel,FullArchDiagram}.tsx` and `apps/storefront/src/app/architecture/page.tsx`. Apply only obvious-win simplifications. Preserve all node IDs, edge tuples, and SVG geometry verbatim.

- [ ] **Step 3: Phase 4 verification**

Run: `cd apps/storefront && npm run lint && npx tsc --noEmit && npm test`

Manual: dev server → visit `http://localhost:3000/architecture`. Confirm:
- 4-chip sticky sub-nav above the flow rows
- Animated teal packets traveling left-to-right along each flow row
- Hovering one flow row dims the others
- Full diagram below shows 24 nodes laid out across 7 lanes with edges + packets

- [ ] **Step 4: Phase commit**

```bash
rtk git status
# If simplifier made changes:
rtk git add -u && rtk git commit -m "refactor(storefront): code-simplifier cleanup pass on phase 4"
```

---

# Phase 5 — `/pipeline` page (Pipeline + SecurityPanel)

## Task 27: Pipeline 11-node timeline

**Files:**
- Create: `apps/storefront/src/components/site/Pipeline.tsx`

- [ ] **Step 1: Implement Pipeline**

Create `apps/storefront/src/components/site/Pipeline.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useInView } from "@/lib/use-in-view";

interface Stage {
  name: string;
  tool: string;
  path: string;
}

const STAGES: Stage[] = [
  { name: "PR",       tool: "GitHub",      path: ".github/PULL_REQUEST_TEMPLATE.md" },
  { name: "Lint",     tool: "eslint",      path: ".github/workflows/app.yml:18" },
  { name: "Test",     tool: "vitest",      path: ".github/workflows/app.yml:34" },
  { name: "Build",    tool: "next + tsc",  path: ".github/workflows/app.yml:62" },
  { name: "Sign",     tool: "cosign",      path: ".github/workflows/app.yml:88" },
  { name: "Scan",     tool: "trivy",       path: ".github/workflows/app.yml:104" },
  { name: "Plan",     tool: "terraform",   path: ".github/workflows/infra.yml:42" },
  { name: "Approve",  tool: "OIDC env",    path: ".github/workflows/app.yml:138" },
  { name: "Deploy",   tool: "kubectl",     path: ".github/workflows/app.yml:155" },
  { name: "Verify",   tool: "/ready",      path: ".github/workflows/app.yml:172" },
  { name: "Rollback", tool: "auto",        path: ".github/workflows/app.yml:188" },
];

const DRAW_LEN = 1200;

export function Pipeline() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25 });
  const [lit, setLit] = useState(-1);
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    if (!inView) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setLit(STAGES.length - 1);
      return;
    }
    let i = -1;
    const id = setInterval(() => {
      i += 1;
      setLit(i);
      if (i >= STAGES.length - 1) clearInterval(id);
    }, 220);
    return () => clearInterval(id);
  }, [inView]);

  return (
    <section ref={ref} className="mx-auto max-w-7xl px-6 pb-24">
      <div className="mb-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          S06 · ship safely
        </div>
        <h2 className="mt-3 max-w-3xl text-fg-base" style={{ fontSize: "clamp(36px, 4.6vw, 56px)", lineHeight: 1.05 }}>
          Eleven gates between <span className="display-italic text-brand-400">git push</span> and prod.
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-fg-muted">
          Manual approval on the OIDC environment. Cosign-signed images,
          Trivy-scanned, digest-pinned. If <code className="font-mono">/ready</code> fails, the rollback
          step runs the same kubectl invocation in reverse.
        </p>
      </div>

      <div className="relative rounded-xl border border-border-default/80 bg-bg-raised/55 px-6 py-12 backdrop-blur">
        <svg
          viewBox="0 0 1200 4"
          preserveAspectRatio="none"
          className="pointer-events-none absolute left-6 right-6 top-12 h-[2px] w-[calc(100%-3rem)]"
        >
          <line x1={0} y1={2} x2={1200} y2={2} stroke="var(--border-default)" strokeWidth={1.5} strokeDasharray="3 3" />
          <line
            x1={0}
            y1={2}
            x2={1200}
            y2={2}
            stroke="var(--brand-500)"
            strokeWidth={1.5}
            strokeDasharray={DRAW_LEN}
            strokeDashoffset={inView ? 0 : DRAW_LEN}
            style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(.25,.85,.45,1)", filter: "drop-shadow(0 0 4px var(--brand-500))" }}
          />
        </svg>

        <div className="relative flex items-start gap-0 overflow-x-auto md:overflow-visible">
          {STAGES.map((s, i) => {
            const isLit = i <= lit;
            const isHover = hover === i;
            return (
              <div
                key={s.name}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(-1)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(-1)}
                tabIndex={0}
                className="relative flex min-w-[96px] flex-1 cursor-help flex-col items-center gap-2 outline-none"
              >
                <div
                  className="z-[2] h-3.5 w-3.5 rounded-full border-[1.5px] transition-all"
                  style={{
                    background: isLit ? "var(--brand-400)" : "rgba(22,27,34,0.9)",
                    borderColor: isLit ? "var(--brand-500)" : "var(--border-default)",
                    boxShadow: isLit ? `0 0 ${isHover ? 16 : 8}px var(--brand-400)` : "none",
                  }}
                />
                <div className={`whitespace-nowrap font-mono text-[11px] font-semibold ${isLit ? "text-fg-base" : "text-fg-subtle"}`}>
                  {s.name}
                </div>
                <div className="whitespace-nowrap font-mono text-[10px] text-fg-subtle">
                  {s.tool}
                </div>
                {isHover ? (
                  <div className="absolute top-[calc(100%+12px)] left-1/2 z-10 min-w-[220px] -translate-x-1/2 rounded-lg border border-brand-500/60 bg-bg-base/95 px-3 py-2 shadow-lg">
                    <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-brand-400">{s.name}</div>
                    <div className="mt-1 font-mono text-[11px] text-fg-muted">{s.path}</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-5 font-mono text-xs text-fg-subtle">
        ↳ Hover any stage for the workflow line number.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/storefront/src/components/site/Pipeline.tsx
rtk git commit -m "feat(storefront): add Pipeline 11-node CI/CD timeline"
```

## Task 28: Sparkline + SloGauge

**Files:**
- Create: `apps/storefront/src/components/site/Sparkline.tsx`
- Create: `apps/storefront/src/components/site/SloGauge.tsx`

- [ ] **Step 1: Implement Sparkline**

Create `apps/storefront/src/components/site/Sparkline.tsx`:

```tsx
import { seededSequence } from "@/lib/seeded-random";

interface SparklineProps {
  seed: number;
  label: string;
  trend?: "flat" | "rising" | "spike";
  width?: number;
  height?: number;
}

function pointsFor(values: number[], width: number, height: number): string {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({ seed, label, trend = "flat", width = 120, height = 32 }: SparklineProps) {
  const raw = seededSequence(seed, 16);
  const values = raw.map((v, i) => {
    if (trend === "rising") return v * 0.5 + i / 16;
    if (trend === "spike") return i === 12 ? v + 1 : v * 0.4;
    return v * 0.5 + 0.5;
  });
  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full">
        <polyline
          fill="none"
          stroke="var(--brand-400)"
          strokeWidth={1.5}
          points={pointsFor(values, width, height)}
        />
      </svg>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">{label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Implement SloGauge**

Create `apps/storefront/src/components/site/SloGauge.tsx`:

```tsx
interface SloGaugeProps {
  value: number;       // 0-100
  caption: string;
  size?: number;
}

export function SloGauge({ value, caption, size = 240 }: SloGaugeProps) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--brand-500)"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: "drop-shadow(0 0 12px rgba(45,212,191,0.45))" }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="display-italic text-[64px] text-fg-base">{value.toFixed(1)}%</span>
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-fg-subtle">{caption}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/storefront/src/components/site/Sparkline.tsx apps/storefront/src/components/site/SloGauge.tsx
rtk git commit -m "feat(storefront): add Sparkline + SloGauge for SecurityPanel"
```

## Task 29: SecurityPanel

**Files:**
- Create: `apps/storefront/src/components/site/SecurityPanel.tsx`

- [ ] **Step 1: Implement SecurityPanel**

Create `apps/storefront/src/components/site/SecurityPanel.tsx`:

```tsx
import { SloGauge } from "./SloGauge";
import { Sparkline } from "./Sparkline";

interface Row {
  layer: string;
  control: string;
  source: string;
}

const ROWS: Row[] = [
  { layer: "Identity",     control: "Cognito + JWKS verify",         source: "docs/adr/016-cognito-pkce.md" },
  { layer: "Tenancy",      control: "Postgres RLS · FORCE",          source: "apps/order-api/migrations/003_rls.sql" },
  { layer: "Transport",    control: "HSTS · CSP · COOP/CORP",        source: "apps/storefront/next.config.ts" },
  { layer: "Secrets",      control: "Secrets Mgr + IRSA",            source: "apps/order-api/k8s/deployment.yaml" },
  { layer: "Supply chain", control: "Cosign + Trivy + Gatekeeper",   source: "docs/adr/020-supply-chain.md" },
  { layer: "Observability",control: "OTel · 3 signals · SLO",        source: "modules/observability/" },
];

export function SecurityPanel() {
  return (
    <section id="security" className="mx-auto max-w-7xl px-6 pb-32">
      <div className="mb-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          S07 · security & SLO
        </div>
        <h2 className="mt-3 max-w-3xl text-fg-base" style={{ fontSize: "clamp(28px, 3.4vw, 40px)", lineHeight: 1.05 }}>
          Six layers. One SLO.
        </h2>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border-default/80 bg-bg-raised/55 backdrop-blur">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-default text-left font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-subtle">
                <th className="px-4 py-3">Layer</th>
                <th className="px-4 py-3">Control</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.layer} className="border-b border-border-muted last:border-b-0">
                  <td className="px-4 py-3 font-mono text-[12px] text-fg-base">{r.layer}</td>
                  <td className="px-4 py-3 text-sm text-fg-base">{r.control}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-fg-muted">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col items-center gap-8">
          <SloGauge value={99.0} caption="checkout availability" />
          <div className="grid w-full grid-cols-2 gap-4">
            <Sparkline seed={11} label="jwt_verify_ok"          trend="rising" />
            <Sparkline seed={22} label="order p99"              trend="spike"  />
            <Sparkline seed={33} label="WS connect success"     trend="flat"   />
            <Sparkline seed={44} label="rollback events"        trend="flat"   />
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/storefront/src/components/site/SecurityPanel.tsx
rtk git commit -m "feat(storefront): add SecurityPanel — compliance table + SLO gauge + sparklines"
```

## Task 30: /pipeline route + page test

**Files:**
- Create: `apps/storefront/src/app/pipeline/page.tsx`
- Create: `apps/storefront/test/routes/pipeline-page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/test/routes/pipeline-page.test.tsx`:

```tsx
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import PipelinePage from "../../src/app/pipeline/page.tsx";

test("/pipeline renders SubHero + Pipeline + SecurityPanel", () => {
  const html = renderToString(<PipelinePage />);
  assert.ok(html.includes("pipeline & defense"), "missing SubHero eyebrow");
  assert.ok(html.includes("Digest-pinned. Zero-downtime."), "missing SubHero italic");
  assert.ok(html.includes("Eleven gates"), "missing Pipeline heading");
  assert.ok(html.includes("Six layers. One SLO."), "missing SecurityPanel heading");
  assert.ok(html.includes("checkout availability"), "missing SLO gauge caption");
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd apps/storefront && npx tsx --test test/routes/pipeline-page.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement the page**

Create `apps/storefront/src/app/pipeline/page.tsx`:

```tsx
import { SubHero } from "@/components/site/SubHero";
import { Pipeline } from "@/components/site/Pipeline";
import { SecurityPanel } from "@/components/site/SecurityPanel";

export const metadata = {
  title: "Pipeline · CloudOps",
  description:
    "GitHub Actions → cosign → trivy → manual approval → kubectl rollout. Then verify, or roll back.",
};

export default function PipelinePage() {
  return (
    <main>
      <SubHero
        eyebrow="pipeline & defense"
        title="Approval gates."
        italic="Digest-pinned. Zero-downtime."
        sub="GitHub Actions → cosign → trivy → manual approval → kubectl rollout. Then verify, or roll back."
      />
      <Pipeline />
      <SecurityPanel />
    </main>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd apps/storefront && npx tsx --test test/routes/pipeline-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Build + full suite**

Run: `cd apps/storefront && npm run build && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/storefront/src/app/pipeline/page.tsx apps/storefront/test/routes/pipeline-page.test.tsx
rtk git commit -m "feat(storefront): add /pipeline route"
```

## Task 31: Phase 5 review + simplify pass

- [ ] **Step 1: Invoke frontend-design**

Invoke `frontend-design:frontend-design` skill:
> Review `apps/storefront/src/components/site/{Pipeline,SloGauge,Sparkline,SecurityPanel}.tsx` and `apps/storefront/src/app/pipeline/page.tsx`. Confirm the Pipeline timeline degrades sensibly on mobile (overflow-x-auto, min-width per node), the SLO gauge centers its text, and the sparklines render deterministic. Reference 21st.dev for timeline + gauge patterns only if a refactor is warranted. Under 300 words.

- [ ] **Step 2: Invoke code-simplifier**

Invoke `code-simplifier:code-simplifier` skill:
> Review files changed in the last 5 commits under `apps/storefront/src/components/site/{Pipeline,SloGauge,Sparkline,SecurityPanel}.tsx` and `apps/storefront/src/app/pipeline/page.tsx`. Apply only obvious-win simplifications. Do not change the STAGES, ROWS, or seed values — those are part of the spec.

- [ ] **Step 3: Phase 5 verification**

Run: `cd apps/storefront && npm run lint && npx tsc --noEmit && npm test`

Manual: dev server → visit `http://localhost:3000/pipeline`. Confirm:
- 11 dots on a hairline timeline; on scroll-into-view, the line draws and dots light up in sequence
- Hovering a dot shows a tooltip with the workflow file path
- SecurityPanel renders the compliance table (6 rows) on the left and the SLO gauge + 4 sparklines on the right
- The four sparklines render the same on refresh (deterministic)

- [ ] **Step 4: Phase commit**

```bash
rtk git status
# If simplifier made changes:
rtk git add -u && rtk git commit -m "refactor(storefront): code-simplifier cleanup pass on phase 5"
```

---

# Phase 6 — Final verification

## Task 32: Full project verification

- [ ] **Step 1: Lint everything**

Run: `cd apps/storefront && npm run lint`

Expected: PASS — no new violations.

- [ ] **Step 2: Type-check**

Run: `cd apps/storefront && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Test suite**

Run: `cd apps/storefront && npm test`

Expected: PASS — all existing tests plus the 6 new ones (seeded-random, use-count-up, active-link, 3 route tests).

- [ ] **Step 4: Build**

Run: `cd apps/storefront && npm run build`

Expected: PASS — build output should list `/`, `/platform`, `/architecture`, `/pipeline` alongside existing routes.

- [ ] **Step 5: Contract check**

Run: `cd apps/storefront && npm run contract-check`

Expected: PASS — no new `process.env` reads added.

- [ ] **Step 6: Manual route walk**

Start dev server: `cd apps/storefront && npm run dev`.

Visit each route and confirm visually:

- `/` — new italic-serif "CloudOps Platform" hero above the existing commerce hero. Existing hero unchanged. Scroll progress bar at top of viewport.
- `/products`, `/cart`, `/checkout`, `/orders`, `/admin`, `/login`, `/design`, `/privacy`, `/cookies` — render byte-identical (or near-identical, allowing for the new navbar) to before.
- `/platform` — sub-hero + Journey sticky-rail + Bento.
- `/architecture` — sub-hero + ArchPanel with sub-nav and packets + FullArchDiagram.
- `/pipeline` — sub-hero + 11-node timeline + SecurityPanel (table + gauge + sparklines).
- Navbar: brand reads "CloudOps", sectioned into commerce | platform with a hairline separator, active route gets `aria-current="page"`.

Toggle `prefers-reduced-motion: reduce` in DevTools — confirm animations stop (cluster orbit pulse, log stream scroll, pipeline line-draw + dot-sequence, full-arch packets).

Kill dev server.

- [ ] **Step 7: Final commit (if anything was tweaked during manual walk)**

```bash
rtk git status
# If any nits were fixed:
rtk git add -u && rtk git commit -m "feat(storefront): final manual-walk fixes"
```

- [ ] **Step 8: Update CLAUDE.md**

Modify `CLAUDE.md` to:
- Update the "Current State" section to note the new `/platform`, `/architecture`, `/pipeline` routes.
- Add a "Resolved" backlog row for this work or mark the design-bundle implementation as done.

```bash
# Edit CLAUDE.md per project convention.
rtk git add CLAUDE.md
rtk git commit -m "docs(claude-md): record platform pages additive landing"
```

---

# Self-review (executed inline, before handing the plan over)

**1. Spec coverage check.** Each spec section maps to one or more tasks:

| Spec §  | Spec topic                                       | Implementing task(s) |
|---------|--------------------------------------------------|----------------------|
| §1      | What does/doesn't change                         | All — every task lists files explicitly |
| §2.1    | Home `<PlatformHero />` (orbit + log stream)     | Tasks 12, 13, 14, 15 |
| §2.2    | `/platform` (SubHero + Journey + Bento)          | Tasks 17, 18, 19, 20, 21 |
| §2.3    | `/architecture` (FlowRows polish + FullArch)     | Tasks 23, 24, 25 |
| §2.4    | `/pipeline` (Pipeline + SecurityPanel)           | Tasks 27, 28, 29, 30 |
| §2.5    | Navbar sectioned                                 | Tasks 8, 9 |
| §2.6    | Footer link repoint                              | Task 10 |
| §3      | Shared components list                           | Distributed across all phases |
| §4      | Global utilities (font, CSS, ScrollProgress)     | Tasks 1, 2, 7 |
| §5      | Things NOT built                                 | (no tasks needed — exclusions) |
| §6      | Acceptance criteria                              | Task 32 |
| §6a     | Tooling: frontend-design + 21st.dev + simplifier | Tasks 11, 16, 22, 26, 31 |

No gaps.

**2. Placeholder scan.** Every step shows the actual code or command. No "TBD", no "implement appropriate error handling", no "similar to Task N".

**3. Type consistency.**
- `useInView<T>` returns `[ref, inView]` — used consistently in Tasks 4, 24, 27 with `<HTMLDivElement>` generic.
- `useCountUp(target, { duration, decimals, start })` — defined in Task 5, planned to be used inside any count-up site (the spec mentions count-ups for metrics but the only metrics-row-style component built here is the SLO gauge, which is static). Plan covers it but doesn't currently consume it in Phase 4–5 — that's fine, it's available for future use.
- `seededRandom` / `seededSequence` — defined Task 3, consumed in Sparkline (Task 28).
- `ActiveLink` — defined Task 8, consumed in Navbar (Task 9).
- `CodeLine` type from `CodeBlock` — defined Task 19 step 1, consumed in Bento (Task 20 step 2).
- `Node`, `Edge`, `Category` in `FullArchDiagram` — defined and consumed only in Task 24.
- All paths are absolute Windows-style at the top-level repo and POSIX-relative for the project.

**4. Toolchain sequencing.** Phases 1, 2, 3, 4, 5 each end with: frontend-design → code-simplifier → verify → phase commit. Matches the user's explicit toolchain requirement (§6a + memory `feedback_implementation_tooling`).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-20-platform-pages-additive.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task (or per phase batch), review between tasks, fast iteration. Best for a 32-step plan; each task lands cleanly without polluting the main context.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review at each phase boundary.

**Which approach?**
