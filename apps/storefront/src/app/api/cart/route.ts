import { NextResponse, type NextRequest } from "next/server";
import {
  addToCart,
  cartCount,
  getCart,
  resolveCartKey,
} from "@/lib/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = await resolveCartKey();
  if (req.nextUrl.searchParams.get("count") === "1") {
    return NextResponse.json({ count: await cartCount(key) });
  }
  return NextResponse.json({ items: await getCart(key) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    sku?: string;
    qty?: number;
    name?: string;
    price_cents?: number;
  } | null;
  if (
    !body ||
    typeof body.sku !== "string" ||
    body.sku.length === 0 ||
    !Number.isInteger(body.qty) ||
    (body.qty as number) < 1 ||
    typeof body.name !== "string" ||
    !Number.isInteger(body.price_cents) ||
    (body.price_cents as number) < 0
  ) {
    return NextResponse.json({ error: "invalid_item" }, { status: 400 });
  }
  const key = await resolveCartKey();
  await addToCart(key, {
    sku: body.sku,
    qty: body.qty as number,
    name: body.name,
    price_cents: body.price_cents as number,
  });
  return NextResponse.json({ success: true });
}
