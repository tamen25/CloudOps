"use client";

import { Button } from "@/components/ui/button";

export default function ProductDetailError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Could not load product</h1>
      <Button onClick={() => reset()}>Retry</Button>
    </main>
  );
}
