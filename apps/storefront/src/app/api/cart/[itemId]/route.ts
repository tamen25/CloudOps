import { NextResponse, type NextRequest } from "next/server";
import { removeItem, resolveCartKey, updateQty } from "@/lib/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const body = (await req.json().catch(() => null)) as { qty?: number } | null;
  if (!body || !Number.isInteger(body.qty) || (body.qty as number) < 0) {
    return NextResponse.json({ error: "invalid_qty" }, { status: 400 });
  }
  const key = await resolveCartKey();
  if (!key) return NextResponse.json({ error: "cart_missing" }, { status: 404 });
  await updateQty(key, itemId, body.qty as number);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const key = await resolveCartKey();
  if (!key) return NextResponse.json({ error: "cart_missing" }, { status: 404 });
  await removeItem(key, itemId);
  return NextResponse.json({ success: true });
}
