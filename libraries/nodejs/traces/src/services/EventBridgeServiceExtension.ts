import { SpanKind } from "@opentelemetry/api";

import { ServiceAttributes, SpanAttributes } from "../interface";
import { AttributeNames } from "../enums";

import { RequestMetadata, ServiceExtension } from "./types";

export class EventBridgeServiceExtension implements ServiceExtension {
  /* eslint-disable class-methods-use-this */
  requestPreSpanHook(serviceName: string, attributes: ServiceAttributes): RequestMetadata {
    const spanKind: SpanKind = SpanKind.PRODUCER;
    const spanName = `aws.eventbridge ${attributes.eventBridgeAttributes?.eventBusName?.trim() || "eventbus"}`;

    const spanAttributes: SpanAttributes = {
      [AttributeNames.MESSAGING_SERVICE_TYPE]: serviceName,
      "aws.eventbridge.eventbus.name": attributes.eventBridgeAttributes?.eventBusName,
      "aws.eventbridge.source": attributes.eventBridgeAttributes?.source,
      "aws.eventbridge.detail.type": attributes.eventBridgeAttributes?.detailType,
      "aws.eventbridge.operation": attributes.eventBridgeAttributes?.operation,
    };

    return {
      spanAttributes,
      spanKind,
      spanName,
    };
  }
  /* eslint-enable class-methods-use-this */
}
