import { NextResponse, type NextRequest } from "next/server";
import {
  addToCart,
  cartCount,
  ensureCartKey,
  getCart,
  resolveCartKey,
} from "@/lib/cart";
import { getProduct } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QTY = 99;

export async function GET(req: NextRequest) {
  const key = await resolveCartKey();
  if (req.nextUrl.searchParams.get("count") === "1") {
    return NextResponse.json({ count: key ? await cartCount(key) : 0 });
  }
  return NextResponse.json({ items: key ? await getCart(key) : [] });
}

/**
 * Closes the 2026-05-15 security review price-tampering finding. The
 * client only supplies `productId` and `qty`; `sku`, `name`, and
 * `price_cents` are resolved server-side against the order-api products
 * catalog and written authoritatively to DynamoDB. Order-api `/order`
 * additionally re-prices at checkout time as defense-in-depth.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    productId?: number;
    qty?: number;
  } | null;
  if (
    !body ||
    !Number.isInteger(body.productId) ||
    (body.productId as number) < 1 ||
    !Number.isInteger(body.qty) ||
    (body.qty as number) < 1 ||
    (body.qty as number) > MAX_QTY
  ) {
    return NextResponse.json({ error: "invalid_item" }, { status: 400 });
  }
  let product;
  try {
    product = await getProduct(body.productId as number);
  } catch {
    return NextResponse.json({ error: "catalog_unavailable" }, { status: 503 });
  }
  if (!product) {
    return NextResponse.json({ error: "product_not_found" }, { status: 404 });
  }
  const key = await ensureCartKey();
  await addToCart(key, {
    sku: product.sku,
    qty: body.qty as number,
    name: product.name,
    price_cents: product.price_cents,
  });
  return NextResponse.json({ success: true });
}
