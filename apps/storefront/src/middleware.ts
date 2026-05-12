import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, verifySession } from "@/lib/auth";

/**
 * Cookie-based auth gate. Public routes pass through; protected routes
 * redirect to /login?next=<path> when the session cookie is missing or
 * the JWT is invalid. Admin routes additionally require the `admin`
 * Cognito group (wired in #88).
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/auth/callback",
  "/products",
  "/api/health",
  "/api/ready",
  "/_next",
  "/favicon.ico",
];

const PROTECTED_PREFIXES = ["/cart", "/checkout", "/orders", "/admin"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(sessionCookieName)?.value;
  if (!cookie) {
    return redirectToLogin(req);
  }

  const claims = await verifySession(cookie);
  if (!claims) {
    return redirectToLogin(req);
  }

  if (pathname.startsWith("/admin")) {
    const groups = (claims["cognito:groups"] ?? []) as string[];
    if (!groups.includes("admin")) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("forbidden", "1");
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  const next = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
