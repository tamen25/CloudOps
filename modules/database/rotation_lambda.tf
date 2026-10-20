#Auto-deploys the AWS SAR app `SecretsManagerRDSPostgreSQLRotationSingleUser`
#when var.rotation_enabled = true and var.rotation_lambda_arn = "".
#
#The SAR application is published by AWS in us-east-1 only; the
#CloudFormation stack itself deploys into the caller's region. The Lambda
#the stack creates lives in that same region and runs in the VPC subnets +
#security group passed in.
#
#Closes backlog #11 — rotation Lambda is no longer a manual handoff.

data "aws_region" "current" {
  count = var.rotation_enabled && var.rotation_lambda_arn == "" && var.rotation_lambda_auto_deploy ? 1 : 0
}

#Groups local values used by this Terraform file.
locals {
  #Default Secrets Manager endpoint when caller does not supply one. Public
  #AWS endpoint is fine when the Lambda has internet egress (NAT) or when a
  #Secrets Manager VPC endpoint resolves the same hostname inside the VPC.
  rotation_endpoint = var.rotation_lambda_endpoint != "" ? var.rotation_lambda_endpoint : (
    length(data.aws_region.current) > 0 ? "https://secretsmanager.${data.aws_region.current[0].name}.amazonaws.com" : ""
  )

  rotation_function_name = "${var.name_prefix}-secrets-rotation"

  #Final Lambda ARN: explicit value wins; otherwise use the SAR-deployed one.
  resolved_rotation_lambda_arn = var.rotation_lambda_arn != "" ? var.rotation_lambda_arn : (
    length(aws_serverlessapplicationrepository_cloudformation_stack.rotation) > 0 ?
    aws_serverlessapplicationrepository_cloudformation_stack.rotation[0].outputs["RotationLambdaARN"] : ""
  )
}

#Creates the AWS serverlessapplicationrepository cloudformation stack resource named rotation.
#
#Update procedure (closes backlog #112):
#1. Find the latest version:
#   aws serverlessrepo get-application \
#     --application-id arn:aws:serverlessrepo:us-east-1:297356227824:applications/SecretsManagerRDSPostgreSQLRotationSingleUser \
#     --query 'Version.SemanticVersion' --output text
#2. Read its release notes — AWS occasionally tightens IAM or changes
#   parameter shape. Skim them before bumping.
#3. Open a PR that bumps the `rotation_sar_semantic_version` variable
#   default (or the env tfvars override). Single-purpose PR — no other
#   infra changes.
#4. Apply in dev first. Confirm rotation succeeds end-to-end:
#   aws secretsmanager rotate-secret --secret-id <db-master-secret-id>
#   then check the new password works against the cluster.
#5. Promote to staging → prod via the normal merge path.
#
#`lifecycle.ignore_changes = [parameters]` would let AWS drift the SAR
#template internals without re-applying our CF stack, but we explicitly
#do NOT want that — the SAR template owns the Lambda's IAM, and a
#silent template bump could change permissions. Bumps are a code change
#with a PR, not a quiet drift.
resource "aws_serverlessapplicationrepository_cloudformation_stack" "rotation" {
  count = var.rotation_enabled && var.rotation_lambda_arn == "" && var.rotation_lambda_auto_deploy ? 1 : 0

  name           = "${var.name_prefix}-secrets-rotation"
  application_id = "arn:aws:serverlessrepo:us-east-1:297356227824:applications/SecretsManagerRDSPostgreSQLRotationSingleUser"
  capabilities   = ["CAPABILITY_IAM", "CAPABILITY_RESOURCE_POLICY"]
  #Pinned (closes backlog #29 — supply-chain reproducibility). Bumping
  #requires testing rotation against the configured RDS engine version.
  #Latest at pin time: 1.1.656 (verified via `aws serverlessrepo get-application`).
  semantic_version = var.rotation_sar_semantic_version

  parameters = {
    endpoint            = local.rotation_endpoint
    functionName        = local.rotation_function_name
    vpcSubnetIds        = join(",", var.rotation_lambda_subnet_ids)
    vpcSecurityGroupIds = var.rotation_lambda_security_group_id
  }

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-secrets-rotation"
  })
}

#Permission so Secrets Manager can invoke the Lambda for rotation.
#Only needed when the SAR stack created the Lambda; the SAR template wires its
#own permission for its own secret, but our secret was created separately.
resource "aws_lambda_permission" "rotation_secretsmanager" {
  count = var.rotation_enabled && var.rotation_lambda_arn == "" && var.rotation_lambda_auto_deploy ? 1 : 0

  statement_id  = "AllowSecretsManagerInvoke"
  action        = "lambda:InvokeFunction"
  function_name = local.rotation_function_name
  principal     = "secretsmanager.amazonaws.com"

  depends_on = [aws_serverlessapplicationrepository_cloudformation_stack.rotation]
}
