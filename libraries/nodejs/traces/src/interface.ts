// This file contains interfaces for traces src.
import { Context, SpanKind } from "@opentelemetry/api";
import { Context as AWSLambdaContext } from "aws-lambda";

/**
 * Properties for startBasicSpan
 */
export interface spanProps {
  /**
   * The SpanKind of a span
   * @default {@link SpanKind.INTERNAL}
   */
  spanKind?: SpanKind;
  /**
   * The new span will be a root span
   * @default true
   */
  root?: boolean;
  /**
   * Set the current span as active context
   * @default false
   */
  setActiveContext?: boolean;
  /**
   * Pass the parent of the span
   * default is set active acontext
   */
  parent?: Context;
}

export type SpanAttributes =
  | {
      [key: string]: number | string | undefined;
    }
  | string
  | undefined;

// Interface for SNS attributes
export interface SnsAttributes {
  topicName: string; // Name of the topic
  topicArn?: string; // The ARN of the SNS topic
  messageDestination?: string; // Destination of the sns message
}

// Interface for SQS attributes
export interface SqsAttributes {
  queueName: string;
  queueARN?: string; // The URL of the SQS queue
  messageConsumer?: string;
  delaySeconds?: number; // Optional: The delay in seconds for the message
}

// Interface for Kinesis attributes
export interface KinesisAttributes {
  streamName: string; // The name of the Kinesis stream
  partitionKey?: string; // The partition key for the data record
  operation?: string; // Type of kinesis operation
  shardId?: string; // kinesis stream shardId
}

// Interface for DynamoDB attributes
export interface DynamoDbAttributes {
  tableName: string; // The name of the DynamoDB table
  key?: string; // The primary key of the item
  operation?: string; // DynamoDB operation
}

// Interface for EventBridge attributes
export interface EventBridgeAttributes {
  eventBusName: string; // The name of the EventBridge event bus
  detailType?: string; // The type of the detail
  source?: string; // The source of the event
  operation?: string; // The name of the operation
}

// Interface for Lambda attributes
export interface LambdaEventAttributes {
  event: {
    Records?: Array<{
      eventSource?: string; // Lambda triggered AWS source
      EventSource?: string; // Attribute to represent SNS event source
      EventSubscriptionArn?: string; // Lambda triggered AWS source ARN
      eventSourceARN?: string; // Attribute to represent SNS event source ARN
      MessageId?: string; // Lambda triggered AWS source MessageId
      messageId?: string; // Attribute to represent SNS event source messageId
    }>;
  };
  context: AWSLambdaContext;
}

// Interface for NeptuneDB attributes
export interface NeptuneDbAttributes {
  clusterArn?: string; // The ARN of the Neptune cluster
  databaseName: string; // The name of the database
  clusterIdentifier?: string; // The cluster indetifier of the Neptune cluster
  operation?: string; // Operation performed
}

// Interface for TimestreamDB attributes
export interface TimestreamDbAttributes {
  databaseName: string; // The name of the Timestream database
  tableName?: string; // The name of the table
  operation?: string; // The name of the operation
}

// Interface for API Gateway attributes
export interface ApiGatewayAttributes {
  apiName: string; // Name of the API
  restApiId?: string; // The ID of the REST API
  resourceId?: string; // The ID of the resource
  httpMethod?: string; // The HTTP method (e.g., GET, POST)
  path?: string; // The path of the API endpoint
  requestBody?: string; // Optional: The request body for POST/PUT requests
}

export interface S3Attributes {
  bucketName: string; // Name of the bucket
  objectKey?: string; // Object key of the bucket
  operation?: string; // Operation performed
}

export type ServiceAttributes = {
  lambdaEventAttributes?: LambdaEventAttributes;
  snsAttributes?: SnsAttributes;
  sqsAttributes?: SqsAttributes;
  kinesisAttributes?: KinesisAttributes;
  dynamoDbAttributes?: DynamoDbAttributes;
  eventBridgeAttributes?: EventBridgeAttributes;
  neptuneDbAttributes?: NeptuneDbAttributes;
  timestreamDbAttributes?: TimestreamDbAttributes;
  apiGatewayAttributes?: ApiGatewayAttributes;
  s3Attributes?: S3Attributes;
};
