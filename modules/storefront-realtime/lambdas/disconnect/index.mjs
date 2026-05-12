import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.CONNECTIONS_TABLE_NAME;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event) => {
  if (!TABLE) return { statusCode: 503, body: "not_configured" };
  await doc.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { connId: event.requestContext.connectionId },
    })
  );
  return { statusCode: 200, body: "disconnected" };
};
