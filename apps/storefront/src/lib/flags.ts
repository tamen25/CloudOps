/**
 * Public, build-time feature flags. These read `NEXT_PUBLIC_*` env vars, so
 * they are inlined at build time and safe to evaluate in both Server and
 * Client Components.
 */

/**
 * The internal design-system preview at `/design` calls `notFound()` unless
 * this flag is `"1"` (see `app/design/page.tsx`). Chrome (Navbar/Footer/Hero/
 * CallToAction/FeatureGrid) must gate its "Design" links on the same flag so a
 * normal build never surfaces a link that 404s (closes #149).
 */
export const designPreviewEnabled =
  process.env.NEXT_PUBLIC_DESIGN_PREVIEW === "1";
