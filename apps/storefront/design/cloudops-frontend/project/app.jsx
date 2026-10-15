// app.jsx — root component, ties everything together

function App() {
  // Build section rail dots
  React.useEffect(() => {
    if (window.__buildRail) {
      window.__buildRail([
        ['hero', 'Top'],
        ['journey', 'Journey'],
        ['architecture', 'Architecture'],
        ['features', 'Features'],
        ['playground', 'API'],
        ['benchmarks', 'Benchmarks'],
        ['security', 'Security'],
        ['pipeline', 'Pipeline'],
        ['oss', 'Open Source'],
      ]);
    }
    // Re-attach reveal observer once content is on the page
    setTimeout(() => window._attachReveal && window._attachReveal(), 80);
  }, []);
  return (
    <>
      <Hero />
      <Journey />
      <Architecture />
      <Features />
      <Playground />
      <Benchmarks />
      <Security />
      <Pipeline />
      <OpenSource />
      <Footer />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
