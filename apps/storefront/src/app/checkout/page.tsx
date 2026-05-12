import { redirect } from "next/navigation";
import { getCart, resolveCartKey } from "@/lib/cart";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckoutButton } from "@/components/CheckoutButton";

export const dynamic = "force-dynamic";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default async function CheckoutPage() {
  const key = await resolveCartKey();
  const items = await getCart(key);
  if (items.length === 0) {
    redirect("/cart");
  }
  const total = items.reduce((sum, it) => sum + it.price_cents * it.qty, 0);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <Card>
        <CardHeader>
          <CardTitle>Review your order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item) => (
            <div key={item.sku} className="flex justify-between">
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="font-mono text-xs text-fg-muted">
                  {item.sku} × {item.qty}
                </div>
              </div>
              <span className="font-mono">
                {moneyFormatter.format((item.price_cents * item.qty) / 100)}
              </span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span className="font-mono">{moneyFormatter.format(total / 100)}</span>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <CheckoutButton />
        </CardFooter>
      </Card>
    </main>
  );
}
