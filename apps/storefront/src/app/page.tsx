import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";

const designPreviewEnabled = process.env.NEXT_PUBLIC_DESIGN_PREVIEW === "1";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16">
      <StatusPill variant="live">platform online</StatusPill>
      <h1 className="text-4xl font-semibold tracking-tight">
        CloudOps Shop
      </h1>
      <p className="max-w-prose text-fg-muted">
        Storefront skeleton. Pages, auth, search, cart, checkout, and live
        order tracking land in subsequent stories. The design system is the
        foundation for every page.
      </p>
      {designPreviewEnabled ? (
        <Button asChild>
          <Link href="/design">View design system</Link>
        </Button>
      ) : null}
    </main>
  );
}
