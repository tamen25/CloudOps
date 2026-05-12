"use client";

import { Button } from "@/components/ui/button";

export default function ProductsError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Could not load catalog</h1>
      <p className="text-sm text-fg-muted">
        Hit a hiccup talking to the order-api. Try again, or check the storefront
        readiness probe in EKS.
      </p>
      <Button onClick={() => reset()}>Retry</Button>
    </main>
  );
}
