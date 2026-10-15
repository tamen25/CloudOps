import { SpanKind } from "@opentelemetry/api";

import { ServiceAttributes, SpanAttributes } from "../interface";

import { RequestMetadata, ServiceExtension } from "./types";

// The DB semantic-convention constant is experimental in @opentelemetry/semantic-conventions
// and not exported from the stable entrypoint used across these libraries, so the attribute
// key is inlined to keep parity with the other exporters/instrumentations.
const ATTR_DB_SYSTEM = "db.system";

export class DynamodbServiceExtension implements ServiceExtension {
  /* eslint-disable class-methods-use-this */
  requestPreSpanHook(serviceName: string, attributes: ServiceAttributes): RequestMetadata {
    const spanKind: SpanKind = SpanKind.PRODUCER;
    const spanName = `aws.dynamodb ${attributes.dynamoDbAttributes?.tableName?.trim() || "table"} ${
      attributes.dynamoDbAttributes?.operation
    }`;

    const spanAttributes: SpanAttributes = {
      [ATTR_DB_SYSTEM]: serviceName,
      "aws.dynamodb.table.name": attributes.dynamoDbAttributes?.tableName,
      "aws.dynamodb.operation": attributes.dynamoDbAttributes?.operation,
      "aws.dynamodb.primary.key": attributes.dynamoDbAttributes?.key,
    };

    return {
      spanAttributes,
      spanKind,
      spanName,
    };
  }
  /* eslint-enable class-methods-use-this */
}
