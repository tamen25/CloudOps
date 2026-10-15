import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, verifySession } from "@/lib/auth";
import {
  maybeRateLimitAuthenticatedUser,
  maybeRateLimitApiRequest,
  maybeRateLimitAuthRequest,
} from "@/lib/rate-limit";

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
  "/__nextjs_",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

/**
 * `/api/cart` is intentionally NOT protected. Guests need to add items to
 * a cart before logging in. The route handler resolves `productId` →
 * server-side `sku`/`name`/`price_cents` from the order-api catalog
 * (closes 2026-05-15 price-tampering finding), so client-supplied price
 * is no longer trusted. Order-api `/order` re-prices at checkout time as
 * defense-in-depth. `/checkout` itself stays in PROTECTED_PREFIXES — only
 * authenticated users can convert a cart into an order.
 */
const PROTECTED_PREFIXES = [
  "/cart",
  "/checkout",
  "/orders",
  "/admin",
  // Operator console — page routes redirect unauthenticated users to login.
  // The /api/observe + /api/load BFF routes additionally enforce the session
  // (and admin for mutations) server-side, so this is UX, not the security
  // boundary.
  "/console",
  "/services",
  "/traces",
  "/load",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    const limited = maybeRateLimitApiRequest(req);
    if (limited) return limited;

    const session = req.cookies.get(sessionCookieName)?.value;
    if (session) {
      const claims = await verifySession(session);
      if (claims?.sub) {
        const userLimited = maybeRateLimitAuthenticatedUser(claims.sub);
        if (userLimited) return userLimited;
      }
    }
  }

  if (pathname === "/login/start" || pathname === "/auth/callback") {
    const limited = maybeRateLimitAuthRequest(req);
    if (limited) return limited;
  }

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
