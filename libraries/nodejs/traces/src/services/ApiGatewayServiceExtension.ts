import { SpanKind } from "@opentelemetry/api";

import { ServiceAttributes, SpanAttributes } from "../interface";
import { AttributeNames } from "../enums";

import { RequestMetadata, ServiceExtension } from "./types";

export class ApiGatewayServiceExtension implements ServiceExtension {
  /* eslint-disable class-methods-use-this */
  requestPreSpanHook(serviceName: string, attributes: ServiceAttributes): RequestMetadata {
    const spanKind: SpanKind = SpanKind.PRODUCER;
    const spanName = `aws.apigateway ${attributes.apiGatewayAttributes?.apiName?.trim() || "api"} ${
      attributes.apiGatewayAttributes?.requestBody
    }`;

    const spanAttributes: SpanAttributes = {
      [AttributeNames.MESSAGING_SERVICE_TYPE]: serviceName,
      "aws.apigateway.api.name": attributes.apiGatewayAttributes?.apiName,
      "aws.apigateway.method": attributes.apiGatewayAttributes?.httpMethod,
      "aws.apigateway.resource.path": attributes.apiGatewayAttributes?.path,
      "aws.apigateway.operation": attributes.apiGatewayAttributes?.requestBody,
    };

    return {
      spanAttributes,
      spanKind,
      spanName,
    };
  }
  /* eslint-enable class-methods-use-this */
}
