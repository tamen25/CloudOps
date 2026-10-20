// Privacy erasure closes every realtime connection the user holds. DynamoDB
// is a fake that answers the tenant query in pages.
import test from "node:test";
import assert from "node:assert/strict";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

process.env.REALTIME_CONNECTIONS_TABLE_NAME = "conns";
process.env.AWS_REGION = "us-east-1";
process.env.AWS_ACCESS_KEY_ID = "AKIATESTTESTTESTTEST";
process.env.AWS_SECRET_ACCESS_KEY = "test";

// The filter on sub runs per 1 MB page, so the user's connections can sit on
// any page. Erasure used to read only the first.
test("every page of the tenant's connections is read", async () => {
  const pages = [[{ connId: "a" }], [], [{ connId: "b" }]];
  const deleted: string[] = [];
  DynamoDBDocumentClient.prototype.send = (async (command: { constructor: { name: string }; input: Record<string, any> }) => {
    if (command.constructor.name === "QueryCommand") {
      const page = Number(command.input.ExclusiveStartKey?.page ?? 0);
      return { Items: pages[page], LastEvaluatedKey: page + 1 < pages.length ? { page: page + 1 } : undefined };
    }
    deleted.push(command.input.Key.connId);
    return {};
  }) as never;
  const { deleteUserConnections } = await import("../src/lib/realtime");
  assert.equal(await deleteUserConnections("t1", "user-1"), 2);
  assert.deepEqual(deleted, ["a", "b"]);
});
