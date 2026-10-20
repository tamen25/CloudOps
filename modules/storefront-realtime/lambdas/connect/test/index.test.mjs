// ws-connect admits a WebSocket only with a valid storefront ticket and
// records the connection under the ticket's tenant and subject. Secrets
// Manager and DynamoDB are fakes; tickets are signed here with the same
// library the storefront uses.
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
// Bare specifiers resolve from this Lambda's node_modules, to the same
// modules index.mjs imports, so patching a client here patches its client.
import { SignJWT } from "jose";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const DIR = path.resolve(import.meta.dirname, "..");
const SECRET = "test-ws-secret";

let n = 0;
async function load() {
  const calls = [];
  Object.assign(process.env, {
    AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "AKIATESTTESTTESTTEST", AWS_SECRET_ACCESS_KEY: "test",
    CONNECTIONS_TABLE_NAME: "conns", WS_TOKEN_SECRET_ARN: "arn:aws:secretsmanager:us-east-1:1:secret:ws",
  });
  SecretsManagerClient.prototype.send = async () => ({ SecretString: JSON.stringify({ "ws-token-secret": SECRET }) });
  DynamoDBDocumentClient.prototype.send = async (command) => { calls.push(command.input); return {}; };
  const { handler } = await import(`${pathToFileURL(path.join(DIR, "index.mjs"))}?v=${n++}`);
  return { handler, calls };
}

const ticket = (claims = {}, { exp = "5m", secret = SECRET } = {}) => {
  let jwt = new SignJWT({ token_use: "ws", "custom:tenant_id": "t1", ...claims })
    .setProtectedHeader({ alg: "HS256" }).setIssuer("cloudops-storefront").setAudience("cloudops-ws").setIssuedAt();
  if (claims.sub !== null) jwt = jwt.setSubject(claims.sub ?? "user-1");
  if (exp) jwt = jwt.setExpirationTime(exp);
  return jwt.sign(new TextEncoder().encode(secret));
};
const connect = (token) => ({ headers: { "Sec-WebSocket-Protocol": `cloudops, ${token}` }, requestContext: { connectionId: "c-1" } });

test("a valid ticket connects and is recorded under its tenant and subject", async () => {
  const { handler, calls } = await load();
  const res = await handler(connect(await ticket()));
  assert.equal(res.statusCode, 200);
  assert.deepEqual({ ...calls[0].Item, expires_at: undefined }, { connId: "c-1", tenantId: "t1", sub: "user-1", expires_at: undefined });
});

test("a ticket that is forged, expired or for another use is refused", async () => {
  for (const [why, token] of [
    ["wrong secret", await ticket({}, { secret: "other" })],
    ["expired", await ticket({}, { exp: Math.floor(Date.now() / 1000) - 60 })],
    ["not a ws ticket", await ticket({ token_use: "id" })],
  ]) {
    const { handler, calls } = await load();
    const res = await handler(connect(token));
    assert.equal(res.statusCode, 401, why);
    assert.deepEqual(calls, [], `${why} was recorded`);
  }
});

// jose checks exp only if it is there: a ticket without one never expired.
test("a ticket without an expiry is refused", async () => {
  const { handler, calls } = await load();
  const res = await handler(connect(await ticket({}, { exp: null })));
  assert.equal(res.statusCode, 401);
  assert.deepEqual(calls, []);
});

test("no token is a 401 before anything is read", async () => {
  const { handler, calls } = await load();
  assert.equal((await handler({ headers: {}, requestContext: { connectionId: "c-1" } })).statusCode, 401);
  assert.deepEqual(calls, []);
});
