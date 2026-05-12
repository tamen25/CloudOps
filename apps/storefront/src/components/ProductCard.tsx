import Link from "next/link";
import type { Product } from "@/lib/api";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function ProductCard({ product }: { product: Product }) {
  const outOfStock = product.qty <= 0;
  const lowStock = !outOfStock && product.qty < 10;
  return (
    <Link href={`/products/${product.id}`} className="group block">
      <Card className="h-full transition-colors group-hover:bg-bg-elev">
        <CardHeader className="space-y-2">
          <div className="flex h-32 items-center justify-center rounded-md bg-bg-elev text-fg-subtle">
            <span className="font-mono text-xs">{product.sku}</span>
          </div>
          <CardTitle className="text-base">{product.name}</CardTitle>
          {product.description ? (
            <p className="line-clamp-2 text-sm text-fg-muted">
              {product.description}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {outOfStock ? (
            <StatusPill variant="danger">out of stock</StatusPill>
          ) : lowStock ? (
            <StatusPill variant="warning">low stock</StatusPill>
          ) : (
            <StatusPill variant="success">in stock</StatusPill>
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <span className="font-mono text-lg">
            {moneyFormatter.format(product.price_cents / 100)}
          </span>
          <span className="text-xs text-fg-muted">view →</span>
        </CardFooter>
      </Card>
    </Link>
  );
}
