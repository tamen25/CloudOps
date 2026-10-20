import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const TABLE = process.env.REALTIME_CONNECTIONS_TABLE_NAME ?? "";

let client: DynamoDBDocumentClient | null = null;

function getClient(): DynamoDBDocumentClient | null {
  if (!TABLE) return null;
  if (client) return client;
  client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  return client;
}

export async function deleteUserConnections(
  tenantId: string,
  sub: string,
): Promise<number> {
  const doc = getClient();
  if (!doc) return 0;
  // The sub filter runs after each 1 MB page of the tenant's connections, so
  // every page is read: an erase that stopped at the first page left the
  // user's other connections behind.
  const rows: Array<{ connId?: string }> = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "by-tenant",
        KeyConditionExpression: "tenantId = :tenant",
        FilterExpression: "#sub = :sub",
        ExpressionAttributeNames: { "#sub": "sub" },
        ExpressionAttributeValues: {
          ":tenant": tenantId,
          ":sub": sub,
        },
        ProjectionExpression: "connId",
        ExclusiveStartKey: lastKey,
      }),
    );
    rows.push(...((res.Items ?? []) as Array<{ connId?: string }>));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  for (const row of rows) {
    if (!row.connId) continue;
    await doc.send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { connId: row.connId },
      }),
    );
  }
  return rows.length;
}
