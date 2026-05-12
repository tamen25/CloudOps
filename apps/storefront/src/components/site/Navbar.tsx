import Link from "next/link";
import { ShoppingBag, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-muted/60 bg-bg-base/80 backdrop-blur supports-[backdrop-filter]:bg-bg-base/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-500/15 text-brand-500">
            <Boxes className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span>CloudOps Shop</span>
          <StatusPill variant="live" className="ml-1 hidden sm:inline-flex">live</StatusPill>
        </Link>

        <nav className="hidden gap-6 text-sm text-fg-muted md:flex">
          <Link href="/products" className="transition-colors hover:text-fg-base">
            Products
          </Link>
          <Link href="/orders" className="transition-colors hover:text-fg-base">
            Orders
          </Link>
          <Link href="/design" className="transition-colors hover:text-fg-base">
            Design
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/cart">
              <ShoppingBag className="h-4 w-4" />
              Cart
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
