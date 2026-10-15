import { SpanKind } from "@opentelemetry/api";

import { ServiceAttributes, SpanAttributes } from "../interface";
import { AttributeNames } from "../enums";

import { RequestMetadata, ServiceExtension } from "./types";

export class TimestreamDBServiceExtension implements ServiceExtension {
  /* eslint-disable class-methods-use-this */
  requestPreSpanHook(serviceName: string, attributes: ServiceAttributes): RequestMetadata {
    const spanKind: SpanKind = SpanKind.PRODUCER;
    const spanName = `aws.timestreamdb ${attributes.timestreamDbAttributes?.databaseName?.trim() || "database"}`;

    const spanAttributes: SpanAttributes = {
      [AttributeNames.MESSAGING_SERVICE_TYPE]: serviceName,
      "aws.timestreamdb.database.name": attributes.timestreamDbAttributes?.databaseName,
      "aws.timestreamdb.table.name": attributes.timestreamDbAttributes?.tableName,
      "aws.timestreamdb.operation": attributes.timestreamDbAttributes?.operation,
    };

    return {
      spanAttributes,
      spanKind,
      spanName,
    };
  }
  /* eslint-enable class-methods-use-this */
}
