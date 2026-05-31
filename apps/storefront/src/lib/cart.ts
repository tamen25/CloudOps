/**
 * Cart Dynamo helpers (closes backlog #84). Server-side only.
 * Keys: pk = "TENANT#<tenant>#USER#<sub>" or "GUEST#<guestId>"
 *       sk = "ITEM#<sku>"
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { cookies } from "next/headers";
import { sessionCookieName, verifySession, resolveTenant } from "@/lib/auth";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const TABLE = process.env.CART_TABLE_NAME ?? "";
const TTL_SECONDS = 7 * 24 * 60 * 60;
const GUEST_COOKIE = "cloudops_guest_id";

let client: DynamoDBDocumentClient | null = null;

function getClient(): DynamoDBDocumentClient | null {
  if (!TABLE) return null;
  if (client) return client;
  const raw = new DynamoDBClient({ region: REGION });
  client = DynamoDBDocumentClient.from(raw);
  return client;
}

export interface CartItem {
  sku: string;
  qty: number;
  name: string;
  price_cents: number;
  added_at: string;
}

export interface CartKey {
  pk: string;
  tenant: string | null;
  isGuest: boolean;
}

/**
 * Read-only cart-key resolution. Safe to call from Server Components.
 * Returns `null` when the visitor has no session and no guest cookie yet —
 * callers should treat that as an empty cart. Cookie mutation lives in
 * `ensureCartKey()` (Route Handler / Server Action only).
 */
export async function resolveCartKey(): Promise<CartKey | null> {
  const jar = await cookies();
  const session = jar.get(sessionCookieName)?.value;
  if (session) {
    const claims = await verifySession(session);
    const tenant = resolveTenant(claims);
    if (claims?.sub && tenant) {
      return {
        pk: `TENANT#${tenant}#USER#${claims.sub}`,
        tenant,
        isGuest: false,
      };
    }
  }
  const guestId = jar.get(GUEST_COOKIE)?.value;
  if (guestId) {
    return { pk: `GUEST#${guestId}`, tenant: null, isGuest: true };
  }
  return null;
}

/**
 * Write-capable cart-key resolution. Mints + sets the guest cookie when
 * neither a session nor an existing guest cookie is found. MUST be called
 * from a Route Handler or Server Action — Next App Router rejects cookie
 * mutation from RSC pages.
 *
 * Writes a sentinel row with `attribute_not_exists(pk)` to detect UUID
 * collisions; retries with a fresh UUID on conflict. Probability is
 * negligible (UUID v4 = 2^122) but the guard prevents two guests
 * silently sharing a cart if it ever occurs.
 */
const MAX_GUEST_ID_ATTEMPTS = 5;

export async function ensureCartKey(): Promise<CartKey> {
  const existing = await resolveCartKey();
  if (existing) return existing;
  const jar = await cookies();
  const docClient = getClient();
  let guestId = crypto.randomUUID();
  if (docClient) {
    for (let attempt = 0; attempt < MAX_GUEST_ID_ATTEMPTS; attempt++) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE,
            Item: {
              pk: `GUEST#${guestId}`,
              sk: "GUEST#META",
              created_at: new Date().toISOString(),
              expires_at: Math.floor(Date.now() / 1000) + TTL_SECONDS,
            },
            ConditionExpression: "attribute_not_exists(pk)",
          })
        );
        break;
      } catch (err) {
        if (!(err instanceof ConditionalCheckFailedException)) throw err;
        if (attempt === MAX_GUEST_ID_ATTEMPTS - 1) {
          throw new Error("guest_id_collision_exhausted");
        }
        guestId = crypto.randomUUID();
      }
    }
  }
  jar.set(GUEST_COOKIE, guestId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    // Match the row TTL so the browser identifier does not outlive the
    // guest-cart data it points at.
    maxAge: TTL_SECONDS,
  });
  return { pk: `GUEST#${guestId}`, tenant: null, isGuest: true };
}

export async function getCart(key: CartKey): Promise<CartItem[]> {
  const docClient = getClient();
  if (!docClient) return [];
  const res = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": key.pk, ":prefix": "ITEM#" },
    })
  );
  return ((res.Items ?? []) as Array<Record<string, unknown>>).map((row) => ({
    sku: String(row.sku ?? ""),
    qty: Number(row.qty ?? 0),
    name: String(row.name ?? ""),
    price_cents: Number(row.price_cents ?? 0),
    added_at: String(row.added_at ?? ""),
  }));
}

export interface AddToCartInput {
  sku: string;
  qty: number;
  name: string;
  price_cents: number;
}

export async function addToCart(key: CartKey, item: AddToCartInput): Promise<void> {
  const docClient = getClient();
  if (!docClient) throw new Error("cart_not_configured");
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: key.pk, sk: `ITEM#${item.sku}` },
      UpdateExpression:
        "ADD qty :one SET #n = :name, price_cents = :price, sku = :sku, added_at = if_not_exists(added_at, :now), expires_at = :exp",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: {
        ":one": item.qty,
        ":name": item.name,
        ":price": item.price_cents,
        ":sku": item.sku,
        ":now": new Date().toISOString(),
        ":exp": expires,
      },
    })
  );
}

export async function updateQty(
  key: CartKey,
  sku: string,
  qty: number
): Promise<void> {
  const docClient = getClient();
  if (!docClient) throw new Error("cart_not_configured");
  if (qty <= 0) {
    await removeItem(key, sku);
    return;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: key.pk, sk: `ITEM#${sku}` },
      UpdateExpression: "SET qty = :q",
      ExpressionAttributeValues: { ":q": qty },
      ConditionExpression: "attribute_exists(sk)",
    })
  );
}

export async function removeItem(key: CartKey, sku: string): Promise<void> {
  const docClient = getClient();
  if (!docClient) throw new Error("cart_not_configured");
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk: key.pk, sk: `ITEM#${sku}` },
    })
  );
}

export async function clearCart(key: CartKey): Promise<number> {
  const docClient = getClient();
  if (!docClient) return 0;
  const res = await docClient.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": key.pk },
      ProjectionExpression: "pk, sk",
    }),
  );
  const rows = (res.Items ?? []) as Array<{ pk?: string; sk?: string }>;
  for (const row of rows) {
    if (!row.pk || !row.sk) continue;
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { pk: row.pk, sk: row.sk },
      }),
    );
  }
  return rows.length;
}

export async function cartCount(key: CartKey): Promise<number> {
  const items = await getCart(key);
  return items.reduce((sum, it) => sum + it.qty, 0);
}

/**
 * Race-free checkout lock (closes backlog #128). Writes a META row with a
 * `locked_at` attribute, refusing if one already exists within the TTL.
 * Caller MUST call `releaseCheckoutLock` in a finally block. A stale lock
 * (older than `staleAfterMs`) is treated as releasable so a crashed
 * checkout does not strand the cart forever.
 */
export async function acquireCheckoutLock(
  key: CartKey,
  staleAfterMs = 60_000,
): Promise<boolean> {
  const docClient = getClient();
  if (!docClient) return true;
  const now = Date.now();
  const stale = now - staleAfterMs;
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: key.pk, sk: "CHECKOUT#LOCK" },
        UpdateExpression: "SET locked_at = :now, expires_at = :exp",
        ConditionExpression:
          "attribute_not_exists(locked_at) OR locked_at < :stale",
        ExpressionAttributeValues: {
          ":now": now,
          ":stale": stale,
          ":exp": Math.floor(now / 1000) + 300,
        },
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
}

export async function releaseCheckoutLock(key: CartKey): Promise<void> {
  const docClient = getClient();
  if (!docClient) return;
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk: key.pk, sk: "CHECKOUT#LOCK" },
    }),
  );
}

export const GUEST_COOKIE_NAME = GUEST_COOKIE;
//Acknowledge GetCommand usage so future expansion (merge guest → user) is one import away.
void GetCommand;
