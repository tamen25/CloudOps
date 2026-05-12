import { GridBackdrop } from "@/components/site/GridBackdrop";
import { Hero } from "@/components/site/Hero";
import { TechStack } from "@/components/site/TechStack";
import { FeatureGrid } from "@/components/site/FeatureGrid";
import { ArchPanel } from "@/components/site/ArchPanel";
import { CallToAction } from "@/components/site/CallToAction";

export default function Home() {
  return (
    <main>
      <div className="relative">
        <GridBackdrop />
        <Hero />
      </div>
      <TechStack />
      <FeatureGrid />
      <ArchPanel />
      <CallToAction />
    </main>
  );
}
