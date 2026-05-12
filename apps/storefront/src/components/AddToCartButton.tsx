"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Wired in #84. Posts to /api/cart which forwards to Dynamo via IRSA.
 * Optimistic affordance: button shows "Added ✓" on success.
 */
export function AddToCartButton({
  productId,
  sku,
  name,
  priceCents,
  disabled = false,
}: {
  productId: number;
  sku: string;
  name: string;
  priceCents: number;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "adding" | "added" | "error">("idle");
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function add() {
    setState("adding");
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku, qty: 1, name, price_cents: priceCents }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setState("added");
      startTransition(() => router.refresh());
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
    void productId;
  }

  const label =
    state === "adding"
      ? "Adding…"
      : state === "added"
        ? "Added ✓"
        : state === "error"
          ? "Try again"
          : "Add to cart";

  return (
    <Button
      type="button"
      disabled={disabled || state === "adding"}
      onClick={add}
      variant={state === "error" ? "danger" : "primary"}
    >
      {label}
    </Button>
  );
}
