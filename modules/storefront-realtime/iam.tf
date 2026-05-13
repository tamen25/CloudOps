data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "connect" {
  name               = "${local.name_prefix}-ws-connect"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role" "disconnect" {
  name               = "${local.name_prefix}-ws-disconnect"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role" "fanout" {
  name               = "${local.name_prefix}-ws-fanout"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "connect_basic" {
  role       = aws_iam_role.connect.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_iam_role_policy_attachment" "disconnect_basic" {
  role       = aws_iam_role.disconnect.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_iam_role_policy_attachment" "fanout_basic" {
  role       = aws_iam_role.fanout.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "connect" {
  statement {
    effect    = "Allow"
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.connections.arn]
  }
}

data "aws_iam_policy_document" "disconnect" {
  statement {
    effect    = "Allow"
    actions   = ["dynamodb:DeleteItem"]
    resources = [aws_dynamodb_table.connections.arn]
  }
}

data "aws_iam_policy_document" "fanout" {
  statement {
    effect  = "Allow"
    actions = ["dynamodb:Query", "dynamodb:DeleteItem"]
    resources = [
      aws_dynamodb_table.connections.arn,
      "${aws_dynamodb_table.connections.arn}/index/by-tenant",
    ]
  }
  statement {
    effect = "Allow"
    actions = [
      "kinesis:GetRecords",
      "kinesis:GetShardIterator",
      "kinesis:DescribeStream",
      "kinesis:DescribeStreamSummary",
      "kinesis:ListShards",
      "kinesis:SubscribeToShard",
    ]
    resources = [var.kinesis_stream_arn]
  }
  statement {
    effect    = "Allow"
    actions   = ["execute-api:ManageConnections"]
    resources = ["arn:aws:execute-api:${var.region}:*:${aws_apigatewayv2_api.ws.id}/*/POST/@connections/*"]
  }
  dynamic "statement" {
    for_each = var.fanout_dlq_arn != "" ? [1] : []
    content {
      effect    = "Allow"
      actions   = ["sqs:SendMessage"]
      resources = [var.fanout_dlq_arn]
    }
  }
}

resource "aws_iam_role_policy" "connect" {
  name   = "${local.name_prefix}-ws-connect"
  role   = aws_iam_role.connect.id
  policy = data.aws_iam_policy_document.connect.json
}
resource "aws_iam_role_policy" "disconnect" {
  name   = "${local.name_prefix}-ws-disconnect"
  role   = aws_iam_role.disconnect.id
  policy = data.aws_iam_policy_document.disconnect.json
}
resource "aws_iam_role_policy" "fanout" {
  name   = "${local.name_prefix}-ws-fanout"
  role   = aws_iam_role.fanout.id
  policy = data.aws_iam_policy_document.fanout.json
}
