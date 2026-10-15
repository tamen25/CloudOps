import api, { SpanKind, Span, propagation } from "@opentelemetry/api";

import { ServiceAttributes, SpanAttributes } from "../interface";
import { AttributeNames } from "../enums";

import { RequestMetadata, ServiceExtension } from "./types";

// Message attributes that carry trace context: W3C (traceparent, tracestate,
// baggage) and B3.
const PROPAGATION_KEYS = new Set(["traceparent", "tracestate", "baggage", "b3"]);

export class SnsServiceExtension implements ServiceExtension {
  /* eslint-disable class-methods-use-this */
  requestPreSpanHook(serviceName: string, attributes: ServiceAttributes): RequestMetadata {
    const spanKind: SpanKind = SpanKind.PRODUCER;
    const spanName = `aws.sns ${attributes.snsAttributes?.topicName?.trim() || "topic"}`;

    const spanAttributes: SpanAttributes = {
      [AttributeNames.MESSAGING_SERVICE_TYPE]: serviceName,
      "aws.sns.messaging.destination": attributes.snsAttributes?.messageDestination,
      "aws.sns.arn": attributes.snsAttributes?.topicArn,
      "aws.sns.messaging.operation": "send",
    };

    return {
      spanAttributes,
      spanKind,
      spanName,
    };
  }
  /* eslint-enable class-methods-use-this */

  /* eslint-disable class-methods-use-this */
  requestPropagationAttributes(span: Span): any {
    const propagationAttributes: any = {};

    propagation.inject(api.trace.setSpan(api.context.active(), span), propagationAttributes);

    const snsMessageAttributes: any = {};

    for (const [key, value] of Object.entries(propagationAttributes)) {
      snsMessageAttributes[key] = {
        DataType: "String",
        StringValue: value as string,
      };
    }

    return snsMessageAttributes;
  }
  /* eslint-enable class-methods-use-this */

  /* eslint-disable class-methods-use-this */
  retrievePropagationAttributes(event: any): any {
    const contextAttributes: any = {};

    Object.keys(event.Records?.[0]?.Sns.MessageAttributes).forEach((key) => {
      if (PROPAGATION_KEYS.has(key)) {
        const { Value } = (event.Records?.[0]?.Sns.MessageAttributes as any)[key];
        contextAttributes[key] = Value;
      }
    });

    return contextAttributes;
  }
  /* eslint-enable class-methods-use-this */
}
