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
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
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

export async function resolveCartKey(): Promise<CartKey> {
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
  let guestId = jar.get(GUEST_COOKIE)?.value;
  if (!guestId) {
    guestId = crypto.randomUUID();
    jar.set(GUEST_COOKIE, guestId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  }
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

export async function cartCount(key: CartKey): Promise<number> {
  const items = await getCart(key);
  return items.reduce((sum, it) => sum + it.qty, 0);
}

export const GUEST_COOKIE_NAME = GUEST_COOKIE;
//Acknowledge GetCommand usage so future expansion (merge guest → user) is one import away.
void GetCommand;
