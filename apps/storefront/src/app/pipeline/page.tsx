import { SubHero } from "@/components/site/SubHero";
import { Pipeline } from "@/components/site/Pipeline";
import { SecurityPanel } from "@/components/site/SecurityPanel";

export const metadata = {
  title: "Pipeline · CloudOps",
  description:
    "Approval gates. Digest-pinned. Zero-downtime. GitHub Actions → cosign → trivy → manual approval → kubectl rollout.",
};

export default function PipelinePage() {
  return (
    <main>
      <SubHero
        eyebrow="pipeline & defense"
        title="Approval gates."
        italic="Digest-pinned. Zero-downtime."
        sub="GitHub Actions → cosign → trivy → manual approval → kubectl rollout. Then verify, or roll back."
      />
      <Pipeline />
      <SecurityPanel />
    </main>
  );
}
