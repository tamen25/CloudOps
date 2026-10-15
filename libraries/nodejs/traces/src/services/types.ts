// This file contains service extension types for traces services.
import { SpanKind, Span } from "@opentelemetry/api";

import { ServiceAttributes, SpanAttributes } from "../interface";
import { AwsService } from "../enums";

export interface RequestMetadata {
  spanAttributes?: SpanAttributes;
  spanKind?: SpanKind;
  spanName?: string;
}

export type propagationAttributes = any;

export interface ServiceExtension {
  requestPreSpanHook: (serviceName: AwsService, attributes: ServiceAttributes) => RequestMetadata;

  requestPropagationAttributes?: (span: Span, serviceName?: AwsService) => propagationAttributes;

  retrievePropagationAttributes?: (event: any, serviceName?: AwsService) => any;
}
