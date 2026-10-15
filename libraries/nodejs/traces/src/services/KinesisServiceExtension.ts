import { SpanKind } from "@opentelemetry/api";

import { ServiceAttributes, SpanAttributes } from "../interface";
import { AttributeNames } from "../enums";

import { RequestMetadata, ServiceExtension } from "./types";

export class KinesisServiceExtension implements ServiceExtension {
  /* eslint-disable class-methods-use-this */
  requestPreSpanHook(serviceName: string, attributes: ServiceAttributes): RequestMetadata {
    const spanKind: SpanKind = SpanKind.PRODUCER;
    const spanName = `aws.kinesis ${attributes.kinesisAttributes?.streamName?.trim() || "stream"}`;

    const spanAttributes: SpanAttributes = {
      [AttributeNames.MESSAGING_SERVICE_TYPE]: serviceName,
      "aws.kinesis.stream.name": attributes.kinesisAttributes?.streamName,
      "aws.kinesis.partition.key": attributes.kinesisAttributes?.partitionKey,
      "aws.kinesis.shard.id": attributes.kinesisAttributes?.shardId,
      "aws.kinesis.operation": attributes.kinesisAttributes?.operation,
    };

    return {
      spanAttributes,
      spanKind,
      spanName,
    };
  }
  /* eslint-enable class-methods-use-this */
}
