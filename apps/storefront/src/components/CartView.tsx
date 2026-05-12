"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface ClientCartItem {
  sku: string;
  qty: number;
  name: string;
  price_cents: number;
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function CartView({ initial }: { initial: ClientCartItem[] }) {
  const [items, setItems] = useState<ClientCartItem[]>(initial);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const subtotal = items.reduce(
    (sum, it) => sum + it.price_cents * it.qty,
    0
  );

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-fg-muted">
          Cart is empty.{" "}
          <a href="/products" className="text-brand-500 underline-offset-4 hover:underline">
            Browse products
          </a>
          .
        </CardContent>
      </Card>
    );
  }

  async function changeQty(sku: string, next: number) {
    const previous = items;
    if (next <= 0) {
      setItems((prev) => prev.filter((it) => it.sku !== sku));
      const res = await fetch(`/api/cart/${encodeURIComponent(sku)}`, {
        method: "DELETE",
      });
      if (!res.ok) setItems(previous);
      startTransition(() => router.refresh());
      return;
    }
    setItems((prev) =>
      prev.map((it) => (it.sku === sku ? { ...it, qty: next } : it))
    );
    const res = await fetch(`/api/cart/${encodeURIComponent(sku)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qty: next }),
    });
    if (!res.ok) setItems(previous);
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your cart ({items.length} items)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.sku} className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-medium">{item.name}</div>
              <div className="font-mono text-xs text-fg-muted">{item.sku}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => changeQty(item.sku, item.qty - 1)}
                >
                  −
                </Button>
                <span className="w-8 text-center font-mono">{item.qty}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => changeQty(item.sku, item.qty + 1)}
                >
                  +
                </Button>
              </div>
              <span className="w-24 text-right font-mono">
                {moneyFormatter.format((item.price_cents * item.qty) / 100)}
              </span>
            </div>
          </div>
        ))}
        <Separator />
        <div className="flex justify-between font-medium">
          <span>Subtotal</span>
          <span className="font-mono">
            {moneyFormatter.format(subtotal / 100)}
          </span>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button asChild>
          <a href="/checkout">Proceed to checkout</a>
        </Button>
      </CardFooter>
    </Card>
  );
}
