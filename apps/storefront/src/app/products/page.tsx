import { Suspense } from "react";
import { listProducts, searchProducts, type Product } from "@/lib/api";
import { ProductGrid } from "@/components/ProductGrid";
import { SearchBar } from "@/components/SearchBar";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  limit?: string;
  offset?: string;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const limit = clamp(parseInt(params.limit ?? "20", 10) || 20, 1, 100);
  const offset = Math.max(parseInt(params.offset ?? "0", 10) || 0, 0);

  let products: Product[] = [];
  let error: string | null = null;
  try {
    if (q) {
      const search = await searchProducts(q, { limit });
      products = search.results;
    } else {
      const list = await listProducts({ limit, offset });
      products = list.products;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "unknown error";
  }

  const search = new URLSearchParams();
  if (q) search.set("q", q);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
          <p className="text-sm text-fg-muted">
            {q ? `Results for "${q}"` : "All active products"}
          </p>
        </div>
        <Suspense fallback={null}>
          <SearchBar />
        </Suspense>
      </header>

      {error ? (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          Failed to load products: {error}
        </div>
      ) : (
        <>
          <ProductGrid products={products} />
          {!q ? (
            <Pagination
              offset={offset}
              limit={limit}
              count={products.length}
              search={search}
            />
          ) : null}
        </>
      )}
    </main>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
