import { SubHero } from "@/components/site/SubHero";
import { Journey } from "@/components/site/Journey";
import { Bento } from "@/components/site/Bento";

export const metadata = {
  title: "Platform · CloudOps",
  description:
    "The platform primitives that make a multi-tenant SaaS on EKS feel boring in the best way.",
};

export default function PlatformPage() {
  return (
    <main>
      <SubHero
        eyebrow="the platform journey"
        title="From browser to bedrock,"
        italic="in five panels."
        sub="The five primitives that make a multi-tenant SaaS on EKS feel boring in the best way."
      />
      <Journey />
      <Bento />
    </main>
  );
}
