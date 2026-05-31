/**
 * Storefront auth helpers — JWT cookie verify, login URL builder, PKCE.
 * Mirrors order-api/src/auth-jwt.ts: `jose` createRemoteJWKSet + jwtVerify.
 */
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";

const COOKIE_NAME = "cloudops_session";
const STATE_COOKIE_NAME = "cloudops_oauth_state";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  const url = process.env.OIDC_JWKS_URL;
  if (!url) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
  }
  return jwks;
}

export interface SessionClaims extends JWTPayload {
  sub: string;
  email?: string;
  "cognito:groups"?: string[];
  "custom:tenant_id"?: string;
  tenant_id?: string;
}

export async function verifySession(
  token: string
): Promise<SessionClaims | null> {
  const issuer = process.env.OIDC_ISSUER;
  const audience = process.env.OIDC_AUDIENCE;
  const jwksProvider = getJwks();
  if (!issuer || !audience || !jwksProvider) return null;

  try {
    const { payload } = await jwtVerify(token, jwksProvider, {
      issuer,
      audience,
    });
    return payload as SessionClaims;
  } catch {
    return null;
  }
}

export function resolveTenant(claims: SessionClaims | null): string | null {
  if (!claims) return null;
  return (claims["custom:tenant_id"] ?? claims.tenant_id ?? null) as
    | string
    | null;
}

export function isAdmin(claims: SessionClaims | null): boolean {
  if (!claims) return false;
  const groups = claims["cognito:groups"] ?? [];
  return Array.isArray(groups) && groups.includes("admin");
}

export const sessionCookieName = COOKIE_NAME;
export const stateCookieName = STATE_COOKIE_NAME;

/**
 * Build a Cognito Hosted UI authorize URL with PKCE challenge.
 * Caller must persist `codeVerifier` (HttpOnly cookie) for the callback.
 */
export function buildAuthorizeUrl(opts: {
  hostedUi: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    scope: (opts.scopes ?? ["openid", "email"]).join(" "),
  });
  const base = opts.hostedUi.replace(/\/$/, "");
  return `${base}/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange the authorization code for tokens at the Cognito token endpoint.
 * Returns the raw token response so the caller can store id_token in the
 * session cookie + handle refresh later.
 */
export async function exchangeCode(opts: {
  hostedUi: string;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<{
  id_token: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    code: opts.code,
    code_verifier: opts.codeVerifier,
  });
  const base = opts.hostedUi.replace(/\/$/, "");
  const res = await fetch(`${base}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as {
    id_token: string;
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

/**
 * PKCE — generate a 32-byte verifier and its SHA-256 challenge (base64url).
 * Runs in Edge / Node — uses Web Crypto.
 */
export async function generatePkce(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64UrlEncode(random);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  const challenge = base64UrlEncode(new Uint8Array(digest));
  return { verifier, challenge };
}

export function generateState(): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return base64UrlEncode(random);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
