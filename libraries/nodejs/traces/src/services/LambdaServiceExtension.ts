import { SpanKind } from "@opentelemetry/api";

import { ServiceAttributes, SpanAttributes } from "../interface";
import { AttributeNames } from "../enums";
import { extractAccountId } from "../utils";

import { RequestMetadata, ServiceExtension } from "./types";

export class LambdaServiceExtension implements ServiceExtension {
  /* eslint-disable class-methods-use-this */
  requestPreSpanHook(serviceName: string, attributes: ServiceAttributes): RequestMetadata {
    const spanKind: SpanKind = SpanKind.PRODUCER;
    const spanName = `aws.lambda ${process.env.AWS_LAMBDA_FUNCTION_NAME || "function"}`;

    const spanAttributes: SpanAttributes = {
      [AttributeNames.MESSAGING_SERVICE_TYPE]: serviceName,
      "aws.lambda.awsRequestId": attributes.lambdaEventAttributes?.context?.awsRequestId,
      "aws.lambda.arn": attributes.lambdaEventAttributes?.context?.invokedFunctionArn,
      "aws.accountID": extractAccountId(attributes.lambdaEventAttributes?.context?.invokedFunctionArn),
    };

    return {
      spanAttributes,
      spanKind,
      spanName,
    };
  }
  /* eslint-enable class-methods-use-this */
}
