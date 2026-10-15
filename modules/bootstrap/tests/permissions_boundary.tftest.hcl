# Plans the bootstrap module with the permissions boundary off and on, and
# checks what the deployer may do in each case. Only plans: the two data
# sources that would call AWS are overridden, and the policy documents are
# rendered by the provider locally.
#
#   cd modules/bootstrap && terraform init -backend=false && terraform test

provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

override_data {
  target          = data.aws_caller_identity.current
  override_during = plan
  values = {
    account_id = "123456789012"
    arn        = "arn:aws:iam::123456789012:user/test"
  }
}

override_data {
  target          = data.aws_s3_bucket.terraform_state
  override_during = plan
  values = {
    id  = "cloudops-tfstate-bucket"
    arn = "arn:aws:s3:::cloudops-tfstate-bucket"
  }
}

variables {
  environment  = "dev"
  project_name = "cloudops"
  owner        = "test"
  github_repo  = "owner/repo"
}

run "off_by_default" {
  command = plan

  assert {
    condition     = output.permissions_boundary_arn == null
    error_message = "With the boundary off, no module should be given one."
  }

  assert {
    condition = length([
      for s in jsondecode(data.aws_iam_policy_document.deployer_infrastructure.json).Statement : s
      if s.Effect == "Deny"
    ]) == 0
    error_message = "With the boundary off, the deployer policy should have no deny statements."
  }
}

run "on" {
  command = plan

  variables {
    enable_permissions_boundary = true
  }

  assert {
    condition     = output.permissions_boundary_arn == "arn:aws:iam::123456789012:policy/cloudops-permissions-boundary"
    error_message = "The boundary ARN passed to the modules is not the boundary policy's."
  }

  # The deployer creates or changes a project role only with the boundary on it.
  assert {
    condition = anytrue([
      for s in jsondecode(data.aws_iam_policy_document.deployer_infrastructure.json).Statement :
      s.Effect == "Deny"
      && contains(flatten([try(s.Action, [])]), "iam:CreateRole")
      && contains(flatten([try(s.Action, [])]), "iam:PutRolePolicy")
      && try(s.Condition.StringNotEquals["iam:PermissionsBoundary"], null) == "arn:aws:iam::123456789012:policy/cloudops-permissions-boundary"
    ])
    error_message = "The deployer can create or change a project role without the boundary."
  }

  # ...and cannot edit the boundary or its own role, take a boundary off, or
  # assume a project role.
  assert {
    condition = anytrue([
      for s in jsondecode(data.aws_iam_policy_document.deployer_infrastructure.json).Statement :
      s.Effect == "Deny" && contains(flatten([try(s.Resource, [])]), "arn:aws:iam::123456789012:policy/cloudops-permissions-boundary")
      && contains(flatten([try(s.Resource, [])]), "arn:aws:iam::123456789012:role/cloudops-deployer")
      && contains(flatten([try(s.Resource, [])]), "arn:aws:iam::123456789012:role/cloudops-github-actions")
    ])
    error_message = "The deployer can edit the boundary or the bootstrap roles."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(data.aws_iam_policy_document.deployer_infrastructure.json).Statement :
      s.Effect == "Deny" && contains(flatten([try(s.Action, [])]), "iam:DeleteRolePermissionsBoundary")
    ])
    error_message = "The deployer can take a boundary off a role."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(data.aws_iam_policy_document.deployer_infrastructure.json).Statement :
      s.Effect == "Deny" && contains(flatten([try(s.Action, [])]), "sts:AssumeRole")
      && contains(flatten([try(s.Resource, [])]), "arn:aws:iam::123456789012:role/cloudops-*")
    ])
    error_message = "The deployer can assume a project role."
  }
}

# The boundary itself: nothing in IAM beyond reads, the ELB service-linked
# role and the budget hard-cap deny; nothing account-level.
run "boundary_policy" {
  command = plan

  assert {
    condition = anytrue([
      for s in jsondecode(data.aws_iam_policy_document.permissions_boundary.json).Statement :
      s.Effect == "Allow" && s.Resource == "*"
      && length(setsubtract(["iam:*", "organizations:*", "account:*"], flatten([try(s.NotAction, [])]))) == 0
    ])
    error_message = "The boundary's broad allow does not exclude IAM, Organizations and account actions."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(data.aws_iam_policy_document.permissions_boundary.json).Statement :
      alltrue([
        for a in flatten([try(s.Action, [])]) :
        !startswith(a, "iam:") || contains(["iam:Get*", "iam:List*", "iam:CreateServiceLinkedRole", "iam:AttachRolePolicy", "iam:DetachRolePolicy"], a)
      ])
    ])
    error_message = "The boundary allows an IAM write it should not."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(data.aws_iam_policy_document.permissions_boundary.json).Statement :
      contains(flatten([try(s.Action, [])]), "iam:AttachRolePolicy")
      && try(s.Condition.ArnLike["iam:PolicyARN"], null) == "arn:aws:iam::123456789012:policy/cloudops-*-budget-hardcap-deny"
    ])
    error_message = "Attaching a policy is allowed for more than the budget hard-cap deny."
  }
}
