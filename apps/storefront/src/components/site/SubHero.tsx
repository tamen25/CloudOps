interface SubHeroProps {
  eyebrow: string;
  title: string;
  italic: string;
  sub?: string;
}

export function SubHero({ eyebrow, title, italic, sub }: SubHeroProps) {
  return (
    <section className="relative isolate overflow-hidden border-b border-border-muted/60 pb-14 pt-36">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-[480px] w-[480px] rounded-full bg-brand-500/20 blur-3xl"
        style={{ opacity: 0.2 }}
      />
      <div className="relative mx-auto max-w-6xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-fg-subtle">
          {eyebrow}
        </p>
        <h1 className="mt-4 max-w-4xl text-balance text-5xl font-medium leading-[1.04] tracking-tight text-fg-base sm:text-6xl lg:text-7xl">
          {title} <span className="display-italic text-fg-base">{italic}</span>
        </h1>
        {sub ? (
          <p className="mt-6 max-w-2xl text-balance text-base text-fg-muted sm:text-lg">
            {sub}
          </p>
        ) : null}
      </div>
    </section>
  );
}
