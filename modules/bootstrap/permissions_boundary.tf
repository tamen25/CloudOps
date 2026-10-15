# Permissions boundary for every role the platform creates (S08).
#
# The deployer may create and edit the project's roles (iam.tf,
# IAMProjectResources). Without a boundary, a role it creates can be given
# any policy, including one that grants the deployer more than it has: the
# deployer could escalate through a role it made. The boundary caps what any
# project role can do, whatever policy is attached to it: everything except
# IAM writes and account-level actions. The deployer, in turn, may only
# create or change a project role that carries this boundary, and may never
# remove it, edit it, or change the two bootstrap roles.
#
# Off by default (enable_permissions_boundary): turning it on puts the
# boundary on all 34 workload roles, so it is switched on and checked in a
# live environment, not by a merge (docs/runbooks/security/permissions-boundary.md).
# The bootstrap module is then applied by an administrator, as on first
# install: the deployer can no longer change its own roles or the boundary.
#
# The policy itself always exists. Only its use is switched: IAM will not
# delete a policy that is still the boundary of a role in another stack, so a
# switch that also deleted it could not be turned off in one apply.

locals {
  permissions_boundary_name = "${var.project_name}-permissions-boundary"
  permissions_boundary_arn  = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${local.permissions_boundary_name}"
}

data "aws_iam_policy_document" "permissions_boundary" {
  #tfsec:ignore:aws-iam-no-policy-wildcards A boundary is a ceiling, not a grant: each role's own policy grants, the boundary removes IAM and account actions from all of them.
  statement {
    sid         = "EverythingButIAMAndAccount"
    effect      = "Allow"
    not_actions = ["iam:*", "organizations:*", "account:*"]
    resources   = ["*"]
  }

  #tfsec:ignore:aws-iam-no-policy-wildcards Read-only; the compliance scanner and the load-balancer controller read IAM.
  statement {
    sid       = "IAMRead"
    effect    = "Allow"
    actions   = ["iam:Get*", "iam:List*"]
    resources = ["*"]
  }

  # The load-balancer controller creates the ELB service-linked role on first
  # use. AWS defines what a service-linked role can do.
  statement {
    sid       = "ServiceLinkedRoles"
    effect    = "Allow"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/*"]
  }

  # The budget hard-cap action (finops) attaches its deny policy to the
  # target roles. Attaching a deny can only take permissions away.
  statement {
    sid       = "BudgetHardCap"
    effect    = "Allow"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/*"]
    condition {
      test     = "ArnLike"
      variable = "iam:PolicyARN"
      values   = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${var.project_name}-*-budget-hardcap-deny"]
    }
  }
}

resource "aws_iam_policy" "permissions_boundary" {
  name        = local.permissions_boundary_name
  description = "Ceiling for every ${var.project_name} workload role: no IAM writes, no account actions."
  policy      = data.aws_iam_policy_document.permissions_boundary.json

  tags = merge(local.common_tags, { Name = local.permissions_boundary_name })
}
