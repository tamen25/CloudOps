// ws-connect Lambda. Verifies the short-lived storefront-minted WS ticket
// supplied as the Sec-WebSocket-Protocol header or ?token= query param,
// writes the connection record to Dynamo with a 24h TTL, and returns 200 to
// allow the upgrade. A Cognito JWT fallback remains for older clients during
// rollout.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { createRemoteJWKSet, jwtVerify } from "jose";

const TABLE = process.env.CONNECTIONS_TABLE_NAME;
const ISSUER = process.env.COGNITO_ISSUER_URL;
const AUDIENCE = process.env.COGNITO_CLIENT_ID;
const JWKS_URL = process.env.COGNITO_JWKS_URL;
const WS_TOKEN_SECRET_ARN = process.env.WS_TOKEN_SECRET_ARN;
const WS_TICKET_ISSUER = "cloudops-storefront";
const WS_TICKET_AUDIENCE = "cloudops-ws";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const jwks = JWKS_URL ? createRemoteJWKSet(new URL(JWKS_URL)) : null;
const secrets = WS_TOKEN_SECRET_ARN ? new SecretsManagerClient({}) : null;
let cachedWsSecret = null;

function extractToken(event) {
  const proto = event.headers?.["sec-websocket-protocol"] || event.headers?.["Sec-WebSocket-Protocol"];
  if (proto && typeof proto === "string") {
    const parts = proto.split(",").map((p) => p.trim());
    if (parts.length === 2) return parts[1];
    if (parts.length === 1) return parts[0];
  }
  return event.queryStringParameters?.token || null;
}

async function getWsTokenSecret() {
  if (cachedWsSecret) return cachedWsSecret;
  if (!WS_TOKEN_SECRET_ARN || !secrets) return null;
  const res = await secrets.send(
    new GetSecretValueCommand({ SecretId: WS_TOKEN_SECRET_ARN })
  );
  const raw = res.SecretString ?? "";
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    cachedWsSecret =
      parsed["ws-token-secret"] ??
      parsed.ws_token_secret ??
      parsed.wsTokenSecret ??
      parsed.value ??
      null;
  } catch {
    cachedWsSecret = raw;
  }
  return cachedWsSecret;
}

async function verifyWsTicket(token) {
  const secret = await getWsTokenSecret();
  if (!secret) return null;
  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(secret),
    {
      issuer: WS_TICKET_ISSUER,
      audience: WS_TICKET_AUDIENCE,
      algorithms: ["HS256"],
    }
  );
  return payload;
}

async function verifyCognitoToken(token) {
  if (!ISSUER || !AUDIENCE || !jwks) return null;
  const { payload } = await jwtVerify(token, jwks, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return payload;
}

export const handler = async (event) => {
  if (!TABLE) {
    return { statusCode: 503, body: "ws_not_configured" };
  }
  const token = extractToken(event);
  if (!token) return { statusCode: 401, body: "missing_token" };

  let claims;
  try {
    claims = await verifyWsTicket(token);
  } catch {
    claims = null;
  }
  if (!claims) {
    try {
      claims = await verifyCognitoToken(token);
    } catch {
      claims = null;
    }
  }
  if (!claims) {
    if (!WS_TOKEN_SECRET_ARN && (!ISSUER || !AUDIENCE || !jwks)) {
      return { statusCode: 503, body: "ws_not_configured" };
    }
    return { statusCode: 401, body: "invalid_token" };
  }

  if (claims.iss === WS_TICKET_ISSUER && claims.aud === WS_TICKET_AUDIENCE) {
    if (claims.token_use !== "ws") {
      return { statusCode: 401, body: "invalid_token_use" };
    }
  }

  const tenantId = claims["custom:tenant_id"] || claims.tenant_id;
  const sub = claims.sub;
  if (!tenantId || !sub) {
    return { statusCode: 401, body: "missing_tenant_or_sub" };
  }

  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        connId: event.requestContext.connectionId,
        tenantId: String(tenantId),
        sub: String(sub),
        expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      },
    })
  );

  return {
    statusCode: 200,
    body: "connected",
    headers: { "Sec-WebSocket-Protocol": "cloudops" },
  };
};
