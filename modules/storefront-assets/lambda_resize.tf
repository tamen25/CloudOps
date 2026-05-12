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

resource "aws_iam_role" "resize" {
  name               = "${local.name_prefix}-image-resize"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "resize_basic" {
  role       = aws_iam_role.resize.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "resize" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/originals/*"]
  }
  statement {
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.assets.arn}/resized/*"]
  }
}

resource "aws_iam_role_policy" "resize" {
  name   = "${local.name_prefix}-image-resize"
  role   = aws_iam_role.resize.id
  policy = data.aws_iam_policy_document.resize.json
}

data "archive_file" "resize" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/resize"
  output_path = "${path.module}/.build/image-resize.zip"
  excludes    = ["node_modules/.package-lock.json"]
}

resource "aws_lambda_function" "resize" {
  function_name = "${local.name_prefix}-image-resize"
  role          = aws_iam_role.resize.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  filename      = data.archive_file.resize.output_path
  source_code_hash = data.archive_file.resize.output_base64sha256
  timeout       = 30
  memory_size   = 1024

  layers = var.sharp_layer_arn != "" ? [var.sharp_layer_arn] : []

  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/lambda/resize/node_modules/.package-lock.json") || fileexists("${path.module}/lambda/resize/package.json")
      error_message = "image-resize Lambda deps missing. Run scripts/build-lambdas.sh."
    }
  }

  tags = var.tags
}

resource "aws_lambda_permission" "s3_invoke" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.resize.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.assets.arn
}

#─── Storefront IRSA gains s3:PutObject on originals/ for presigned upload ─
data "aws_iam_policy_document" "storefront_upload" {
  statement {
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:PutObjectAcl"]
    resources = ["${aws_s3_bucket.assets.arn}/originals/*"]
  }
}

resource "aws_iam_role_policy" "storefront_upload" {
  count  = var.storefront_irsa_role_name != "" ? 1 : 0
  name   = "${local.name_prefix}-storefront-asset-upload"
  role   = var.storefront_irsa_role_name
  policy = data.aws_iam_policy_document.storefront_upload.json
}
