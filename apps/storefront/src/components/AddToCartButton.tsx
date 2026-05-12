"use client";

import { Button } from "@/components/ui/button";

/**
 * Disabled until the Dynamo cart lands in #84. Render an explanatory
 * tooltip-ish span when the parent passes `disabled` so the demo
 * walkthrough shows what's next.
 */
export function AddToCartButton({
  productId,
  disabled = true,
}: {
  productId: number;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={() => {
        void productId;
      }}
    >
      {disabled ? "Add to cart (coming in #84)" : "Add to cart"}
    </Button>
  );
}
