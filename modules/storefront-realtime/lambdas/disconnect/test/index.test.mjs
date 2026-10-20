// ws-disconnect removes the connection record API Gateway is closing, and
// only that one. DynamoDB is a fake.
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const DIR = path.resolve(import.meta.dirname, "..");

test("the closing connection's record is deleted", async () => {
  const calls = [];
  Object.assign(process.env, { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "AKIATESTTESTTESTTEST", AWS_SECRET_ACCESS_KEY: "test", CONNECTIONS_TABLE_NAME: "conns" });
  DynamoDBDocumentClient.prototype.send = async (command) => { calls.push({ name: command.constructor.name, input: command.input }); return {}; };
  const { handler } = await import(pathToFileURL(path.join(DIR, "index.mjs")));
  const res = await handler({ requestContext: { connectionId: "c-1" } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [{ name: "DeleteCommand", input: { TableName: "conns", Key: { connId: "c-1" } } }]);
});
