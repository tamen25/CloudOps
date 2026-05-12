// ws-connect Lambda. Verifies the JWT (Cognito) supplied as the
// Sec-WebSocket-Protocol header or ?token= query param, writes the
// connection record to Dynamo with a 24h TTL, returns 200 to allow
// the upgrade.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const TABLE = process.env.CONNECTIONS_TABLE_NAME;
const ISSUER = process.env.COGNITO_ISSUER_URL;
const AUDIENCE = process.env.COGNITO_CLIENT_ID;
const JWKS_URL = process.env.COGNITO_JWKS_URL;

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const jwks = JWKS_URL ? createRemoteJWKSet(new URL(JWKS_URL)) : null;

function extractToken(event) {
  const proto = event.headers?.["sec-websocket-protocol"] || event.headers?.["Sec-WebSocket-Protocol"];
  if (proto && typeof proto === "string") {
    const parts = proto.split(",").map((p) => p.trim());
    if (parts.length === 2) return parts[1];
    if (parts.length === 1) return parts[0];
  }
  return event.queryStringParameters?.token || null;
}

export const handler = async (event) => {
  if (!TABLE || !ISSUER || !AUDIENCE || !jwks) {
    return { statusCode: 503, body: "ws_not_configured" };
  }
  const token = extractToken(event);
  if (!token) return { statusCode: 401, body: "missing_token" };

  let claims;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: AUDIENCE });
    claims = payload;
  } catch {
    return { statusCode: 401, body: "invalid_token" };
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
