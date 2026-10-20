// ws-fanout Lambda. Kinesis consumer; for each order event, queries the
// `by-tenant` GSI and filters to the owning JWT subject before pushing.
// 410 Gone -> stale connection -> Dynamo delete.
//
// A record that fails for a reason a retry can fix (DynamoDB, API Gateway)
// is reported in batchItemFailures; Lambda retries from that record
// (ReportBatchItemFailures on the event source mapping). A record that
// cannot be parsed is logged and skipped: retrying it cannot help.
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

// ownerConnections returns the owner's connections. The filter on sub runs
// after each 1 MB page of the tenant's connections is read, so every page
// has to be read: the owner's may be on any of them.
async function ownerConnections(tenantId, ownerSub) {
  const conns = [];
  let lastKey;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "by-tenant",
        KeyConditionExpression: "tenantId = :t",
        FilterExpression: "#sub = :s",
        ExpressionAttributeNames: { "#sub": "sub" },
        ExpressionAttributeValues: { ":t": tenantId, ":s": ownerSub },
        ExclusiveStartKey: lastKey,
      })
    );
    conns.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return conns;
}

async function dispatch(tenantId, ownerSub, payload) {
  const conns = await ownerConnections(tenantId, ownerSub);
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
          .catch((delErr) =>
            console.error("stale connection delete failed", { connId: conn.connId, err: delErr?.message })
          );
      } else {
        console.error("post failure", { connId: conn.connId, err: err?.message });
      }
    }
  }
}

export const handler = async (event) => {
  if (!TABLE || !apigw) return { statusCode: 503 };
  for (const record of event.Records ?? []) {
    let payload;
    try {
      payload = JSON.parse(Buffer.from(record.kinesis.data, "base64").toString("utf8"));
    } catch (err) {
      console.error("fanout record unparseable, skipped", { seq: record.kinesis.sequenceNumber, err: err?.message });
      continue;
    }
    const tenantId = payload.tenant_id;
    const ownerSub = payload.owner_sub;
    if (!tenantId || !ownerSub) continue;
    try {
      await dispatch(tenantId, ownerSub, payload);
    } catch (err) {
      // Kinesis is ordered: report this record, and Lambda retries from it.
      // The records after it would be retried too, so stop here.
      console.error("fanout record failed, will retry", { seq: record.kinesis.sequenceNumber, err: err?.message });
      return { batchItemFailures: [{ itemIdentifier: record.kinesis.sequenceNumber }] };
    }
  }
  return { batchItemFailures: [] };
};
