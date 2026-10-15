import { SubHero } from "@/components/site/SubHero";
import { DiagramGallery } from "@/components/site/DiagramGallery";

export const metadata = {
  title: "Diagrams · CloudOps",
  description:
    "Generated AWS architecture diagrams — the full picture, every data flow, each concern, and the CI/CD pipelines.",
};

export default function DiagramsPage() {
  return (
    <main>
      <SubHero
        eyebrow="diagrams"
        title="Architecture, drawn from"
        italic="the real topology."
        sub="Generated with official AWS + Grafana icons from the verified service map. Click any diagram to enlarge."
      />
      <DiagramGallery />
    </main>
  );
}
