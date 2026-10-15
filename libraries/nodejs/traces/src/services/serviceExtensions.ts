// This file contains the service extension registry for traces services.
import { Span } from "@opentelemetry/api";

import { ServiceAttributes } from "../interface";
import { AwsService } from "../enums";

import { ServiceExtension, RequestMetadata, propagationAttributes } from "./types";
import { SnsServiceExtension } from "./SnsServiceExtension";
import { SqsServiceExtension } from "./SqsServiceExtension";
import { DynamodbServiceExtension } from "./DynamodbServiceExtension";
import { LambdaServiceExtension } from "./LambdaServiceExtension";
import { KinesisServiceExtension } from "./KinesisServiceExtension";
import { NeptuneDBServiceExtension } from "./NeptuneDBServiceExtension";
import { TimestreamDBServiceExtension } from "./TimestreamDBServiceExtension";
import { EventBridgeServiceExtension } from "./EventBridgeServiceExtension";
import { S3ServiceExtension } from "./S3ServiceExtension";
import { ApiGatewayServiceExtension } from "./ApiGatewayServiceExtension";

export class ServicesExtensions implements ServiceExtension {
  services: Map<string, ServiceExtension> = new Map();

  private validPropagationServices = new Set<AwsService>([AwsService.SNS, AwsService.SQS, AwsService.EVENTBRIDGE]);

  constructor() {
    this.services.set("sqs", new SqsServiceExtension());
    this.services.set("sns", new SnsServiceExtension());
    this.services.set("dynamodb", new DynamodbServiceExtension());
    this.services.set("lambda", new LambdaServiceExtension());
    this.services.set("kinesis", new KinesisServiceExtension());
    this.services.set("neptunedb", new NeptuneDBServiceExtension());
    this.services.set("timestreamdb", new TimestreamDBServiceExtension());
    this.services.set("eventbridge", new EventBridgeServiceExtension());
    this.services.set("s3", new S3ServiceExtension());
    this.services.set("apigateway", new ApiGatewayServiceExtension());
  }

  requestPreSpanHook(serviceName: AwsService, attributes: ServiceAttributes): RequestMetadata {
    const serviceExtension = this.services.get(serviceName);
    if (!serviceExtension) return {};

    return serviceExtension.requestPreSpanHook(serviceName, attributes);
  }

  requestPropagationAttributes(span: Span, serviceName?: AwsService): propagationAttributes {
    if (serviceName && !this.validPropagationServices.has(serviceName)) {
      return undefined;
    }

    const serviceExtension = serviceName ? this.services.get(serviceName) : undefined;

    return serviceExtension?.requestPropagationAttributes?.(span);
  }

  retrievePropagationAttributes(event: any, serviceName?: AwsService): any {
    if (serviceName && !this.validPropagationServices.has(serviceName)) {
      return undefined;
    }

    const serviceExtension = serviceName ? this.services.get(serviceName) : undefined;

    return serviceExtension?.retrievePropagationAttributes?.(event);
  }
}
