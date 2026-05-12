import { getCart, resolveCartKey } from "@/lib/cart";
import { CartView } from "@/components/CartView";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const key = await resolveCartKey();
  const items = await getCart(key);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Cart</h1>
      </header>
      <CartView initial={items} />
    </main>
  );
}
