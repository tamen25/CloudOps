// storefront/app.jsx — root composition

function App() {
  return (
    <>
      <Hero />
      <TechStack />
      <Bento />
      <MetricsRow />
      <Architecture />
      <Pipeline />
      <SecurityPanel />
      <CTABand />
      <Footer />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
