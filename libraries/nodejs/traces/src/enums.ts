// This file contains enums for traces src.
export enum AttributeNames {
  TRIGGER_SERVICE_TYPE = "trigger.service.type",
  TRIGGER_SERVICE_NAME = "trigger.service",
  TRIGGER_SERVICE_ARN = "trigger.service.arn",
  AWS_OPERATION = "aws.operation",
  AWS_REGION = "aws.region",
  AWS_SERVICE_API = "aws.service.api",
  AWS_SERVICE_NAME = "aws.service.name",
  AWS_SERVICE_IDENTIFIER = "aws.service.identifier",
  AWS_REQUEST_ID = "aws.request.id",
  AWS_REQUEST_EXTENDED_ID = "aws.request.extended_id",
  AWS_SIGNATURE_VERSION = "aws.signature.version",
  LAMBDA_EVENT_RECORD_UNIQUE_IDENTIFIER = "aws.lambda.event.record.unique.indentifier",
  MESSAGING_SERVICE_TYPE = "aws.messaging.service.type",
}

export enum AwsService {
  LAMBDA = "lambda",
  SNS = "sns",
  SQS = "sqs",
  KINESIS = "kinesis",
  EVENTBRIDGE = "eventbridge",
  DYNAMODB = "dynamodb",
  NEPTUNEDB = "neptunedb",
  TIMESTREAMDB = "timestreamdb",
  APIGATEWAY = "apigateway",
  S3 = "s3",
}
