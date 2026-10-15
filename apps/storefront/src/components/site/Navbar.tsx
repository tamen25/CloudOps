"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { designPreviewEnabled } from "@/lib/flags";

interface NavItem {
  href: string;
  label: string;
}

const console_: NavItem[] = [
  { href: "/console", label: "Map" },
  { href: "/services", label: "Services" },
  { href: "/traces", label: "Traces" },
  { href: "/load", label: "Load" },
];

// /design is an internal preview gated by NEXT_PUBLIC_DESIGN_PREVIEW (it
// notFound()s otherwise) — only surface the link when the flag is set (#149).
const platform: NavItem[] = [
  { href: "/platform", label: "Platform" },
  { href: "/architecture", label: "Architecture" },
  { href: "/diagrams", label: "Diagrams" },
  { href: "/pipeline", label: "Pipeline" },
  ...(designPreviewEnabled ? [{ href: "/design", label: "Design" }] : []),
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`transition-colors ${
        active ? "text-fg-base" : "text-fg-muted hover:text-fg-base"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-40 border-b border-border-muted/60 bg-bg-base/70 backdrop-blur-xl supports-[backdrop-filter]:bg-bg-base/55">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-500/15 text-brand-500">
            <Boxes className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span>CloudOps</span>
          <StatusPill variant="live" className="ml-1 hidden sm:inline-flex">live</StatusPill>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Main">
          <ul className="flex gap-6">
            {console_.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} />
              </li>
            ))}
          </ul>
          <span
            aria-hidden
            className="mx-1 hidden h-4 w-px bg-border-muted lg:inline-block"
          />
          <ul className="hidden gap-6 lg:flex">
            {platform.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/console">
              <Activity className="h-4 w-4" />
              Console
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
