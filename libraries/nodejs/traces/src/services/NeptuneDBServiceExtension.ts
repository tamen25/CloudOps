import { SpanKind } from "@opentelemetry/api";

import { ServiceAttributes, SpanAttributes } from "../interface";
import { AttributeNames } from "../enums";

import { RequestMetadata, ServiceExtension } from "./types";

export class NeptuneDBServiceExtension implements ServiceExtension {
  /* eslint-disable class-methods-use-this */
  requestPreSpanHook(serviceName: string, attributes: ServiceAttributes): RequestMetadata {
    const spanKind: SpanKind = SpanKind.PRODUCER;
    const spanName = `aws.neptunedb ${attributes.neptuneDbAttributes?.clusterIdentifier?.trim() || "cluster"}`;

    const spanAttributes: SpanAttributes = {
      [AttributeNames.MESSAGING_SERVICE_TYPE]: serviceName,
      "aws.neptunedb.cluster.identifier": attributes.neptuneDbAttributes?.clusterIdentifier,
      "aws.neptunedb.operation": attributes.neptuneDbAttributes?.operation,
    };

    return {
      spanAttributes,
      spanKind,
      spanName,
    };
  }
  /* eslint-enable class-methods-use-this */
}
