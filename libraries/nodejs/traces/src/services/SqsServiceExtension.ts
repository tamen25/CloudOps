import api, { SpanKind, Span, propagation } from "@opentelemetry/api";

import { ServiceAttributes, SpanAttributes } from "../interface";
import { AttributeNames } from "../enums";

import { RequestMetadata, ServiceExtension } from "./types";

// Message attributes that carry trace context: W3C (traceparent, tracestate,
// baggage) and B3.
const PROPAGATION_KEYS = new Set(["traceparent", "tracestate", "baggage", "b3"]);

export class SqsServiceExtension implements ServiceExtension {
  /* eslint-disable class-methods-use-this */
  requestPreSpanHook(serviceName: string, attributes: ServiceAttributes): RequestMetadata {
    const spanKind: SpanKind = SpanKind.PRODUCER;
    const spanName = `aws.sqs ${attributes.sqsAttributes?.queueName?.trim() || "queue"}`;

    const spanAttributes: SpanAttributes = {
      [AttributeNames.MESSAGING_SERVICE_TYPE]: serviceName,
      "aws.sqs.messaging.consumer": attributes.sqsAttributes?.messageConsumer,
      "aws.sqs.arn": attributes.sqsAttributes?.queueARN,
      "aws.sqs.messaging.operation": "publish",
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
    return propagationAttributes;
  }
  /* eslint-enable class-methods-use-this */

  /* eslint-disable class-methods-use-this */
  retrievePropagationAttributes(event: any): any {
    const contextAttributes: any = {};

    Object.keys(event.Records?.[0]?.messageAttributes).forEach((key) => {
      if (PROPAGATION_KEYS.has(key)) {
        const { stringValue } = (event.Records?.[0]?.messageAttributes as any)[key];
        contextAttributes[key] = stringValue;
      }
    });

    return contextAttributes;
  }
  /* eslint-enable class-methods-use-this */
}
