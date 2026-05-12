import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderStatusPill } from "@/components/OrderStatusPill";
import { sessionCookieName } from "@/lib/auth";

const API_BASE_URL = process.env.API_BASE_URL ?? "";

export const dynamic = "force-dynamic";

interface Order {
  order_id: string;
  total: number;
  status?: "received" | "confirmed" | "packed" | "shipped" | "cancelled";
  created_at?: string;
  items?: Array<{ sku: string; quantity: number }>;
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!API_BASE_URL) notFound();
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  const res = await fetch(`${API_BASE_URL}/orders`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    next: { revalidate: 0 },
  });
  if (!res.ok) notFound();
  const body = (await res.json()) as { orders?: Order[] };
  const order = (body.orders ?? []).find((o) => o.order_id === id);
  if (!order) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <Button asChild variant="ghost" size="sm">
        <Link href="/orders">← Orders</Link>
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-mono">{order.order_id}</CardTitle>
          <OrderStatusPill orderId={order.order_id} initialStatus={order.status ?? "received"} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <span className="text-fg-muted">Total</span>
            <span className="font-mono">${(order.total ?? 0).toFixed(2)}</span>
          </div>
          {order.items?.length ? (
            <ul className="space-y-1 border-t border-border-muted pt-3 text-sm">
              {order.items.map((item) => (
                <li key={item.sku} className="flex justify-between">
                  <span className="font-mono">{item.sku}</span>
                  <span className="font-mono">×{item.quantity}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
