/**
 * Typed HTTP clients for the storefront. RSC + Server Actions call into
 * these; nothing here runs on the client (no `"use client"` imports).
 */
import { cookies } from "next/headers";
import { sessionCookieName } from "@/lib/auth";

const API_BASE_URL = process.env.API_BASE_URL ?? "";
const SEARCH_BASE_URL = process.env.SEARCH_BASE_URL ?? "";

interface Product {
  id: number;
  sku: string;
  name: string;
  description?: string | null;
  price_cents: number;
  qty: number;
  image_key?: string | null;
  created_at?: string;
}

interface Order {
  order_id: string;
  total: number;
  status?: "received" | "confirmed" | "packed" | "shipped" | "cancelled";
  created_at?: string;
  items?: Array<{ sku: string; quantity: number }>;
}

async function authHeader(): Promise<HeadersInit> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  if (!token) return {};
  return { authorization: `Bearer ${token}` };
}

export async function listProducts(opts: { limit?: number; offset?: number } = {}): Promise<{
  products: Product[];
  limit: number;
  offset: number;
}> {
  if (!API_BASE_URL) throw new Error("API_BASE_URL missing");
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 20));
  params.set("offset", String(opts.offset ?? 0));
  const res = await fetch(`${API_BASE_URL}/products?${params}`, {
    headers: await authHeader(),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`listProducts ${res.status}`);
  const body = (await res.json()) as { products: Product[]; limit: number; offset: number };
  return body;
}

export async function getProduct(id: number): Promise<Product | null> {
  if (!API_BASE_URL) throw new Error("API_BASE_URL missing");
  const res = await fetch(`${API_BASE_URL}/products/${id}`, {
    headers: await authHeader(),
    next: { revalidate: 0 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getProduct ${res.status}`);
  const body = (await res.json()) as { product: Product };
  return body.product;
}

export async function searchProducts(
  q: string,
  opts: { limit?: number } = {}
): Promise<{ results: Product[]; cache: "HIT" | "MISS" | null }> {
  if (!SEARCH_BASE_URL) throw new Error("SEARCH_BASE_URL missing");
  const params = new URLSearchParams({ q, limit: String(opts.limit ?? 20) });
  const res = await fetch(`${SEARCH_BASE_URL}/search?${params}`, {
    headers: await authHeader(),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`searchProducts ${res.status}`);
  const cache = res.headers.get("x-cache");
  const body = (await res.json()) as { results: Product[] };
  return {
    results: body.results ?? [],
    cache: cache === "HIT" || cache === "MISS" ? cache : null,
  };
}

export async function listOrders(): Promise<{ orders: Order[]; count: number }> {
  if (!API_BASE_URL) throw new Error("API_BASE_URL missing");
  const res = await fetch(`${API_BASE_URL}/orders`, {
    headers: await authHeader(),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`listOrders ${res.status}`);
  return (await res.json()) as { orders: Order[]; count: number };
}

export async function getOrder(orderId: string): Promise<Order | null> {
  if (!API_BASE_URL) throw new Error("API_BASE_URL missing");
  const res = await fetch(`${API_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    headers: await authHeader(),
    next: { revalidate: 0 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getOrder ${res.status}`);
  const body = (await res.json()) as { order: Order };
  return body.order;
}

export type { Product, Order };
