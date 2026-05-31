import { SubHero } from "@/components/site/SubHero";
import { ArchitectureFlow } from "@/components/site/ArchitectureFlow";
import { FullArchDiagram } from "@/components/site/FullArchDiagram";

export const metadata = {
  title: "Architecture · CloudOps",
  description:
    "The same diagram you would actually whiteboard. Four flows plus one full picture.",
};

export default function ArchitecturePage() {
  return (
    <main>
      <SubHero
        eyebrow="architecture"
        title="The same diagram you'd"
        italic="actually whiteboard."
        sub="Four flows plus one full picture. Hover any node for tech, cost, and ownership."
      />
      <ArchitectureFlow />
      <FullArchDiagram />
    </main>
  );
}
