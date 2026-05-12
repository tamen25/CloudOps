// ws-fanout Lambda. Kinesis consumer; for each order event, queries the
// `by-tenant` GSI for active connections and PostToConnection's the JSON
// payload to each. 410 Gone -> stale connection -> Dynamo delete.
import { Buffer } from "node:buffer";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

const TABLE = process.env.CONNECTIONS_TABLE_NAME;
const ENDPOINT = process.env.WS_MANAGEMENT_ENDPOINT;

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const apigw = ENDPOINT
  ? new ApiGatewayManagementApiClient({ endpoint: ENDPOINT })
  : null;

async function dispatch(tenantId, payload) {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "by-tenant",
      KeyConditionExpression: "tenantId = :t",
      ExpressionAttributeValues: { ":t": tenantId },
    })
  );
  const conns = (res.Items ?? []);
  for (const conn of conns) {
    try {
      await apigw.send(
        new PostToConnectionCommand({
          ConnectionId: conn.connId,
          Data: Buffer.from(JSON.stringify(payload)),
        })
      );
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 410) {
        await doc
          .send(
            new DeleteCommand({
              TableName: TABLE,
              Key: { connId: conn.connId },
            })
          )
          .catch(() => undefined);
      } else {
        console.error("post failure", { connId: conn.connId, err: err?.message });
      }
    }
  }
}

export const handler = async (event) => {
  if (!TABLE || !apigw) return { statusCode: 503 };
  for (const record of event.Records ?? []) {
    try {
      const text = Buffer.from(record.kinesis.data, "base64").toString("utf8");
      const payload = JSON.parse(text);
      const tenantId = payload.tenant_id;
      if (!tenantId) continue;
      await dispatch(tenantId, payload);
    } catch (err) {
      console.error("fanout record failed", { err: err?.message });
    }
  }
  return { batchItemFailures: [] };
};
