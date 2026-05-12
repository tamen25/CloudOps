/**
 * Full-page aurora backdrop. Six coloured orbs drift across a fixed,
 * pointer-events-none layer behind every page. The orbs blend additively
 * (mix-blend-mode: screen) so overlap brightens instead of muddies; a
 * noise overlay kills gradient banding on wide screens.
 *
 * Honours prefers-reduced-motion (animations disable via globals.css).
 * Decorative only — never used for text, focus, or interactive surfaces.
 */
export function AuroraBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base wash — anchors the colour temperature so cards still read AA. */}
      <div className="absolute inset-0 bg-bg-base" />

      {/* Six orbs at fixed positions; each carries one drift animation. */}
      <div
        className="aurora-orb animate-drift-a"
        style={{
          top: "-12%",
          left: "-8%",
          width: "44rem",
          height: "44rem",
          background:
            "radial-gradient(circle at 30% 30%, var(--aurora-teal), transparent 60%)",
        }}
      />
      <div
        className="aurora-orb animate-drift-b"
        style={{
          top: "4%",
          right: "-10%",
          width: "38rem",
          height: "38rem",
          background:
            "radial-gradient(circle at 50% 40%, var(--aurora-violet), transparent 60%)",
        }}
      />
      <div
        className="aurora-orb animate-drift-c"
        style={{
          top: "32%",
          left: "30%",
          width: "32rem",
          height: "32rem",
          background:
            "radial-gradient(circle at 50% 50%, var(--aurora-cyan), transparent 60%)",
          opacity: 0.45,
        }}
      />
      <div
        className="aurora-orb animate-drift-a"
        style={{
          bottom: "-10%",
          right: "10%",
          width: "36rem",
          height: "36rem",
          background:
            "radial-gradient(circle at 50% 50%, var(--aurora-indigo), transparent 60%)",
          opacity: 0.4,
          animationDelay: "-8s",
        }}
      />
      <div
        className="aurora-orb animate-drift-b"
        style={{
          bottom: "5%",
          left: "-6%",
          width: "30rem",
          height: "30rem",
          background:
            "radial-gradient(circle at 50% 50%, var(--aurora-rose), transparent 60%)",
          opacity: 0.32,
          animationDelay: "-12s",
        }}
      />
      <div
        className="aurora-orb animate-drift-c"
        style={{
          top: "55%",
          right: "32%",
          width: "26rem",
          height: "26rem",
          background:
            "radial-gradient(circle at 50% 50%, var(--aurora-amber), transparent 60%)",
          opacity: 0.22,
          animationDelay: "-4s",
        }}
      />

      {/* Hairline grid sits above the orbs but below content. */}
      <div className="absolute inset-0 line-grid opacity-50" />

      {/* Noise breaks up banding without hurting AA on text above. */}
      <div className="absolute inset-0 aurora-noise opacity-40" />

      {/* Vignette so edges fade — keeps the action centred. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, transparent 0%, rgba(28, 33, 40, 0.65) 100%)",
        }}
      />
    </div>
  );
}
