import { notFound } from "next/navigation";
import Link from "next/link";
import { getProduct } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { AddToCartButton } from "@/components/AddToCartButton";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isInteger(id) || id < 1) notFound();

  const product = await getProduct(id);
  if (!product) notFound();

  const outOfStock = product.qty <= 0;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/products">← Back to catalog</Link>
      </Button>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex h-64 items-center justify-center rounded-md bg-bg-elev text-fg-subtle">
            <span className="font-mono text-sm">{product.sku}</span>
          </div>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">{product.name}</CardTitle>
            {outOfStock ? (
              <StatusPill variant="danger">out of stock</StatusPill>
            ) : (
              <StatusPill variant="success">in stock</StatusPill>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 text-sm text-fg-muted">
            {product.description
              ? product.description.split(/\n+/).map((line, idx) => <p key={idx}>{line}</p>)
              : <p>No description.</p>}
          </div>
          <div className="flex items-end justify-between border-t border-border-muted pt-4">
            <span className="font-mono text-3xl">
              {moneyFormatter.format(product.price_cents / 100)}
            </span>
            <AddToCartButton productId={product.id} disabled={outOfStock} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-xs text-fg-muted">
            <div>
              <dt className="font-semibold uppercase tracking-wide">SKU</dt>
              <dd className="font-mono text-fg-base">{product.sku}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide">Available</dt>
              <dd className="font-mono text-fg-base">{product.qty}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </main>
  );
}
