// storefront/app-cinematic.jsx — page router for multi-page site.
// Each HTML file sets <body data-page="..."> and we render the right composition.

function HomePage() {
  return (
    <>
      <Hero />
      <CTABand />
      <Footer />
    </>
  );
}

function PlatformPage() {
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
      <Footer />
    </>
  );
}

function ArchitecturePage() {
  return (
    <>
      <SubHero
        eyebrow="architecture"
        title="The same diagram you'd"
        italic="actually whiteboard."
        sub="Four flows + one full picture. Hover any node for tech, cost, and ownership."
      />
      <Architecture />
      <ArchitectureFull />
      <Footer />
    </>
  );
}

function PipelinePage() {
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
      <CTABand />
      <Footer />
    </>
  );
}

// Compact hero used on non-home pages
function SubHero({ eyebrow, title, italic, sub }) {
  return (
    <section style={{ paddingTop: 140, paddingBottom: 56, position: 'relative', overflow: 'hidden' }}>
      <div className="hero-orb" style={{ top: -80, right: -120, width: 360, height: 360, opacity: 0.2 }} aria-hidden="true" />
      <div className="container reveal">
        <div className="eyebrow" style={{ marginBottom: 18 }}>
          <span className="e-tag">{eyebrow}</span>
        </div>
        <h1 className="display display-grad" style={{
          margin: 0, fontSize: 'clamp(48px, 7vw, 92px)', lineHeight: 1.0, maxWidth: 1000,
        }}>
          {title}{' '}
          <span className="display-italic">{italic}</span>
        </h1>
        {sub && (
          <p style={{
            marginTop: 22, fontSize: 'clamp(16px, 1.6vw, 19px)',
            color: 'var(--fg-muted)', maxWidth: 640, lineHeight: 1.55,
          }}>
            {sub}
          </p>
        )}
      </div>
    </section>
  );
}

const PAGES = {
  home: HomePage,
  platform: PlatformPage,
  architecture: ArchitecturePage,
  pipeline: PipelinePage,
};

function App() {
  const page = (document.body.dataset.page || 'home').toLowerCase();
  const Page = PAGES[page] || HomePage;
  return <Page />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
