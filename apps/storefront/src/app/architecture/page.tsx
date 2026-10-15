import { SubHero } from "@/components/site/SubHero";
import { ArchitectureFlow } from "@/components/site/ArchitectureFlow";
import { FullArchDiagram } from "@/components/site/FullArchDiagram";
import { PipelineFlow } from "@/components/site/PipelineFlow";

export const metadata = {
  title: "Architecture · CloudOps",
  description:
    "The same diagram you would actually whiteboard. Flows, the full picture, and the CI/CD pipelines.",
};

export default function ArchitecturePage() {
  return (
    <main>
      <SubHero
        eyebrow="architecture"
        title="The same diagram you'd"
        italic="actually whiteboard."
        sub="Five flows, one full picture, and the pipelines that ship it. Hover any node for tech, cost, and ownership."
      />
      <ArchitectureFlow />
      <FullArchDiagram />
      <PipelineFlow />
    </main>
  );
}
