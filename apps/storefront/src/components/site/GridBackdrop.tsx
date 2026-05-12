/**
 * Decorative full-bleed backdrop for the home hero. Stacks a faint dot grid,
 * a radial brand glow, and a soft horizon line. Purely visual — no business
 * logic, no client JS.
 */
export function GridBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-60" />
      <div className="absolute inset-0 hero-glow" />
      <div className="absolute inset-x-0 top-1/3 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
    </div>
  );
}
