// ws-fanout pushes each order event to its owner's open connections only,
// drops connections API Gateway says are gone, and reports a record it
// could not deliver so Lambda retries it. DynamoDB and API Gateway are fakes.
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
// Bare specifiers resolve to the same modules index.mjs imports.
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient } from "@aws-sdk/client-apigatewaymanagementapi";

const DIR = path.resolve(import.meta.dirname, "..");

let n = 0;
// pages: the by-tenant query's result pages, in order.
// post:  connId -> function that throws to simulate a failed push.
async function load({ pages = [[]], post = {}, query } = {}) {
  const calls = [];
  Object.assign(process.env, {
    AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "AKIATESTTESTTESTTEST", AWS_SECRET_ACCESS_KEY: "test",
    CONNECTIONS_TABLE_NAME: "conns", WS_MANAGEMENT_ENDPOINT: "https://ws.test",
  });
  DynamoDBDocumentClient.prototype.send = async (command) => {
    const name = command.constructor.name;
    calls.push({ name, input: command.input });
    if (name !== "QueryCommand") return {};
    if (query) return query();
    const page = Number(command.input.ExclusiveStartKey?.page ?? 0);
    return { Items: pages[page], LastEvaluatedKey: page + 1 < pages.length ? { page: page + 1 } : undefined };
  };
  ApiGatewayManagementApiClient.prototype.send = async (command) => {
    calls.push({ name: "Post", input: command.input });
    post[command.input.ConnectionId]?.();
    return {};
  };
  const { handler } = await import(`${pathToFileURL(path.join(DIR, "index.mjs"))}?v=${n++}`);
  return { handler, calls };
}

const record = (seq, payload) => ({
  kinesis: { sequenceNumber: seq, data: Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload)).toString("base64") },
});
const order = { tenant_id: "t1", owner_sub: "u1", status: "SHIPPED" };
const posted = (calls) => calls.filter((c) => c.name === "Post").map((c) => c.input.ConnectionId);
const gone = () => { const e = new Error("Gone"); e.$metadata = { httpStatusCode: 410 }; throw e; };

// The sub filter runs per 1 MB page; the owner's connection can be on page 2.
test("the owner's connections on every page of the tenant are reached", async () => {
  const { handler, calls } = await load({ pages: [[{ connId: "a" }], [{ connId: "b" }]] });
  await handler({ Records: [record("1", order)] });
  assert.deepEqual(posted(calls), ["a", "b"]);
  const q = calls.find((c) => c.name === "QueryCommand").input;
  assert.deepEqual(q.ExpressionAttributeValues, { ":t": "t1", ":s": "u1" });
});

test("a connection API Gateway says is gone is deleted", async () => {
  const { handler, calls } = await load({ pages: [[{ connId: "a" }]], post: { a: gone } });
  const res = await handler({ Records: [record("1", order)] });
  assert.deepEqual(calls.filter((c) => c.name === "DeleteCommand").map((c) => c.input.Key), [{ connId: "a" }]);
  assert.deepEqual(res.batchItemFailures, []);
});

// Every failure used to be swallowed and the batch reported clean, so a
// DynamoDB throttle lost the push with no retry.
test("a record that fails for a retryable reason is reported, and processing stops there", async () => {
  let queries = 0;
  const { handler, calls } = await load({
    query: () => { queries++; if (queries === 2) { const e = new Error("Throttled"); e.name = "ProvisionedThroughputExceededException"; throw e; } return { Items: [{ connId: "a" }] }; },
  });
  const res = await handler({ Records: [record("1", order), record("2", order), record("3", order)] });
  assert.deepEqual(res.batchItemFailures, [{ itemIdentifier: "2" }]);
  assert.equal(queries, 2, "record 3 is left for the retry");
  assert.deepEqual(posted(calls), ["a"]);
});

test("an unparseable record, or one without an owner, is skipped and not retried", async () => {
  const { handler, calls } = await load({ pages: [[{ connId: "a" }]] });
  const res = await handler({ Records: [record("1", "{not json"), record("2", { tenant_id: "t1" }), record("3", order)] });
  assert.deepEqual(res.batchItemFailures, []);
  assert.deepEqual(posted(calls), ["a"]);
});
