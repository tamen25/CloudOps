#FinOps Module — Budget hard-cap stop-loss (closes backlog #139)
#
#The notifications in budget.tf only EMAIL/SNS at 80% / 100%. A runaway script
#or a compromised key can keep spending past 100% until a human reads the mail.
#This file adds an `aws_budgets_budget_action` that, when ACTUAL spend crosses a
#configurable hard-cap threshold, attaches an IAM deny policy to the target
#roles so the expensive control-plane calls (launch instances / grow the cluster)
#start failing immediately.
#
#Gated behind `enable_budget_hardcap_action` (default false). It is OFF by
#default on purpose: attaching a deny policy is disruptive, and a too-low cap in
#dev would brick the next pipeline run. Opt in per environment.
#
#Containment / recovery: see docs/runbooks/security/abuse-response.md A3.
#To lift the cap after a fire, either raise `cost_budget_monthly_usd` /
#`budget_hardcap_threshold_percent` and re-apply, or detach the deny policy from
#the affected roles out-of-band, then root-cause before re-enabling.

locals {
  budget_hardcap_enabled = var.enable_budget_hardcap_action && length(var.budget_hardcap_target_role_names) > 0
}

#The deny policy the action attaches when the cap is breached. Scoped to the
#cost-dominant control-plane calls called out in #139 — denying these stops new
#compute/cluster growth without nuking read paths or the platform that is
#already running. Kept narrow so the blast radius is "no NEW spend", not "outage".
resource "aws_iam_policy" "budget_hardcap_deny" {
  count       = local.budget_hardcap_enabled ? 1 : 0
  name        = "${var.project_name}-${var.environment}-budget-hardcap-deny"
  description = "Stop-loss deny attached by AWS Budgets when actual spend crosses the hard cap (#139)."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Deny only verbs that CREATE / LAUNCH new spend. Deliberately omit
        # autoscaling:SetDesiredCapacity / UpdateAutoScalingGroup — those are
        # also how an operator scales a runaway ASG back DOWN during cost
        # containment, so denying them would block remediation. Scale-up via a
        # NEW ASG is still blocked by CreateAutoScalingGroup.
        Sid    = "DenyNewCompute"
        Effect = "Deny"
        Action = [
          "ec2:RunInstances",
          "eks:CreateNodegroup",
          "eks:CreateCluster",
          "autoscaling:CreateAutoScalingGroup",
        ]
        Resource = "*"
      }
    ]
  })

  tags = var.tags
}

#Role that AWS Budgets assumes to execute the action. The action API requires an
#execution role even for IAM-policy actions; it must trust budgets.amazonaws.com
#and be allowed to attach the deny policy to the configured target roles.
resource "aws_iam_role" "budget_action" {
  count = local.budget_hardcap_enabled ? 1 : 0
  name  = "${var.project_name}-${var.environment}-budget-action"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "budgets.amazonaws.com" }
        Action    = "sts:AssumeRole"
        Condition = {
          StringEquals = { "aws:SourceAccount" = var.aws_account_id }
          ArnLike      = { "aws:SourceArn" = "arn:aws:budgets::${var.aws_account_id}:budget/${aws_budgets_budget.monthly.name}" }
        }
      }
    ]
  })

  tags = var.tags
}

#Least-privilege: the execution role may only attach/detach THIS deny policy to
#THESE named roles — nothing else.
resource "aws_iam_role_policy" "budget_action" {
  count = local.budget_hardcap_enabled ? 1 : 0
  name  = "attach-hardcap-deny"
  role  = aws_iam_role.budget_action[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
        ]
        Resource = [for n in var.budget_hardcap_target_role_names : "arn:aws:iam::${var.aws_account_id}:role/${n}"]
        Condition = {
          ArnEquals = { "iam:PolicyARN" = aws_iam_policy.budget_hardcap_deny[0].arn }
        }
      }
    ]
  })
}

#The action itself. ACTUAL spend crossing the hard-cap percentage of the monthly
#budget attaches the deny policy to the target roles. approvalModel = AUTOMATIC
#so it fires without a human ack — that is the whole point of a stop-loss.
resource "aws_budgets_budget_action" "hardcap" {
  count              = local.budget_hardcap_enabled ? 1 : 0
  budget_name        = aws_budgets_budget.monthly.name
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_action[0].arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = var.budget_hardcap_threshold_percent
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.budget_hardcap_deny[0].arn
      roles      = var.budget_hardcap_target_role_names
    }
  }

  subscriber {
    address           = aws_sns_topic.cost_alerts.arn
    subscription_type = "SNS"
  }

  dynamic "subscriber" {
    for_each = var.cost_alert_email != "" ? [var.cost_alert_email] : []
    content {
      address           = subscriber.value
      subscription_type = "EMAIL"
    }
  }

  tags = var.tags
}
