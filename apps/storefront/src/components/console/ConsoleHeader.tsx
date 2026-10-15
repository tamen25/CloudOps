import Link from "next/link";

const tabs = [
  { href: "/console", label: "Map" },
  { href: "/services", label: "Services" },
  { href: "/traces", label: "Traces" },
  { href: "/load", label: "Load" },
];

// Section header shared across the console pages. `active` highlights the tab.
export function ConsoleHeader({ active, title, subtitle }: { active: string; title: string; subtitle: string }) {
  return (
    <header className="mb-8 border-b border-border-muted/60 pb-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand-500">operator console</p>
      <h1 className="mt-2 display-italic text-fg-base" style={{ fontSize: "clamp(36px, 6vw, 64px)" }}>
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">{subtitle}</p>
      <nav className="mt-5 flex gap-1 font-mono text-xs" aria-label="Console sections">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active === t.href ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 transition-colors ${
              active === t.href
                ? "border-brand-500/40 bg-brand-500/10 text-brand-400"
                : "border-border-muted/60 text-fg-muted hover:border-border-muted hover:text-fg-base"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
