import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuthorizeUrl,
  generatePkce,
  generateState,
  isAdmin,
  resolveTenant,
  sessionCookieName,
  stateCookieName,
} from "../src/lib/auth";

test("resolveTenant prefers custom:tenant_id over tenant_id", () => {
  const claims = {
    sub: "u",
    "custom:tenant_id": "acme",
    tenant_id: "legacy",
  } as never;
  assert.equal(resolveTenant(claims), "acme");
});

test("resolveTenant falls back to tenant_id when custom is absent", () => {
  const claims = { sub: "u", tenant_id: "globex" } as never;
  assert.equal(resolveTenant(claims), "globex");
});

test("resolveTenant returns null on missing claims", () => {
  assert.equal(resolveTenant(null), null);
  assert.equal(resolveTenant({ sub: "u" } as never), null);
});

test("isAdmin true when admin in cognito:groups", () => {
  assert.equal(
    isAdmin({ sub: "u", "cognito:groups": ["admin", "ops"] } as never),
    true
  );
});

test("isAdmin false when group missing or claims null", () => {
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin({ sub: "u" } as never), false);
  assert.equal(isAdmin({ sub: "u", "cognito:groups": ["viewer"] } as never), false);
});

test("buildAuthorizeUrl emits the canonical Cognito query string", () => {
  const url = buildAuthorizeUrl({
    hostedUi: "https://auth.example.com/",
    clientId: "client123",
    redirectUri: "https://example.com/auth/callback",
    state: "STATE1",
    codeChallenge: "CHAL1",
  });
  assert.ok(url.startsWith("https://auth.example.com/oauth2/authorize?"));
  const params = new URL(url).searchParams;
  assert.equal(params.get("response_type"), "code");
  assert.equal(params.get("client_id"), "client123");
  assert.equal(params.get("redirect_uri"), "https://example.com/auth/callback");
  assert.equal(params.get("state"), "STATE1");
  assert.equal(params.get("code_challenge"), "CHAL1");
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(params.get("scope"), "openid email");
});

test("buildAuthorizeUrl honours custom scopes", () => {
  const url = buildAuthorizeUrl({
    hostedUi: "https://auth.example.com",
    clientId: "c",
    redirectUri: "https://x/cb",
    state: "s",
    codeChallenge: "c",
    scopes: ["openid", "profile"],
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get("scope"), "openid profile");
});

test("generatePkce returns a verifier + S256 challenge of correct shape", async () => {
  const { verifier, challenge } = await generatePkce();
  // base64url, no padding; 32-byte entropy → 43 chars.
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(verifier, challenge);
});

test("generatePkce returns distinct values on each call", async () => {
  const a = await generatePkce();
  const b = await generatePkce();
  assert.notEqual(a.verifier, b.verifier);
});

test("generateState returns a 16-byte base64url token", () => {
  const s = generateState();
  assert.match(s, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(s, generateState());
});

test("cookie name constants are stable", () => {
  assert.equal(sessionCookieName, "cloudops_session");
  assert.equal(stateCookieName, "cloudops_oauth_state");
});

test("verifySession returns null when env vars are unset", async () => {
  delete process.env.OIDC_JWKS_URL;
  delete process.env.OIDC_ISSUER;
  delete process.env.OIDC_AUDIENCE;
  const { verifySession } = await import("../src/lib/auth");
  assert.equal(await verifySession("any.token.value"), null);
});
