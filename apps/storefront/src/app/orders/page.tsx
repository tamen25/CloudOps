import Link from "next/link";
import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sessionCookieName } from "@/lib/auth";

const API_BASE_URL = process.env.API_BASE_URL ?? "";

interface Order {
  order_id: string;
  total: number;
  status?: string;
  created_at?: string;
}

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  if (!API_BASE_URL) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
        <h1 className="text-2xl font-semibold">Your orders</h1>
        <p className="text-fg-muted text-sm">API_BASE_URL not configured.</p>
      </main>
    );
  }
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  const res = await fetch(`${API_BASE_URL}/orders`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
        <h1 className="text-2xl font-semibold">Your orders</h1>
        <p className="text-fg-muted text-sm">Failed to load orders ({res.status}).</p>
      </main>
    );
  }
  const body = (await res.json()) as { orders?: Order[] };
  const orders = body.orders ?? [];

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your orders</h1>
      {orders.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-fg-muted">
            No orders yet.{" "}
            <Link href="/products" className="text-brand-500">Browse products</Link>.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => (
            <li key={order.order_id}>
              <Link href={`/orders/${order.order_id}`}>
                <Card className="transition-colors hover:bg-bg-elev">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="font-mono text-sm">{order.order_id}</CardTitle>
                    <span className="font-mono">{`$${(order.total ?? 0).toFixed(2)}`}</span>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
