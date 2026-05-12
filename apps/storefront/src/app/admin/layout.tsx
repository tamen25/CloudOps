import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { StatusPill } from "@/components/ui/status-pill";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border-muted bg-bg-raised px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-semibold">
              CloudOps Admin
            </Link>
            <StatusPill variant="warning">admin</StatusPill>
          </div>
          <nav className="flex gap-4 text-sm text-fg-muted">
            <Link href="/admin/upload">Upload</Link>
            <Link href="/">Storefront →</Link>
          </nav>
        </div>
      </header>
      <Separator />
      {children}
    </div>
  );
}
