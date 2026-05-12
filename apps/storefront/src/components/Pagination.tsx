import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Pagination({
  offset,
  limit,
  count,
  search,
}: {
  offset: number;
  limit: number;
  count: number;
  search?: URLSearchParams;
}) {
  const buildHref = (nextOffset: number) => {
    const params = new URLSearchParams(search ?? "");
    params.set("limit", String(limit));
    params.set("offset", String(nextOffset));
    return `/products?${params.toString()}`;
  };

  const hasMore = count >= limit;
  if (offset === 0 && !hasMore) return null;

  return (
    <div className="flex items-center justify-between border-t border-border-muted pt-4">
      <span className="text-sm text-fg-muted">
        Showing {offset + 1}–{offset + count}
      </span>
      <div className="flex gap-2">
        {offset > 0 ? (
          <Button variant="secondary" size="sm" asChild>
            <Link href={buildHref(Math.max(offset - limit, 0))}>← Previous</Link>
          </Button>
        ) : null}
        {hasMore ? (
          <Button variant="secondary" size="sm" asChild>
            <Link href={buildHref(offset + limit)}>Next →</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
