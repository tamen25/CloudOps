# Plans the foundation stack against a mocked AWS provider and checks the
# bootstrap switch. An account bootstrapped from another state already has
# the GitHub OIDC provider, the roles and the state KMS key; creating them
# again fails the apply with EntityAlreadyExists, so the stack must be able
# to leave them out.
#
#   cd stacks/foundation && terraform init -backend=false && terraform test

# Policy documents are only passed through here; a mocked one must still be
# a JSON object, or the role and policy resources reject it at plan.
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}
mock_provider "random" {}

variables {
  environment           = "dev"
  project_name          = "cloudops"
  domain_name           = "example.com"
  aws_account_id        = "123456789012"
  bootstrap_bucket_name = "cloudops-tfstate-example"
}

run "bootstrap_is_created_by_default" {
  command = plan

  assert {
    condition     = length(module.bootstrap) == 1
    error_message = "A new account needs the bootstrap resources: enable_bootstrap must default to true."
  }
}

# The run in an account that already has them: no bootstrap resources, and
# the stack still plans its own (DNS, ECR) with the outputs empty, not
# erroring on module.bootstrap[0].
run "an_existing_bootstrap_is_left_alone" {
  command = plan

  variables {
    enable_bootstrap = false
  }

  assert {
    condition     = length(module.bootstrap) == 0
    error_message = "enable_bootstrap = false must not create the OIDC provider, roles or KMS key."
  }

  assert {
    condition     = length(module.dns) == 1 && length(module.ecr) == 1
    error_message = "Leaving bootstrap out must not drop the stack's other always-on modules."
  }

  assert {
    condition     = output.github_actions_role_arn == null && output.bootstrap_kms_key_arn == null
    error_message = "Bootstrap outputs must be null when this stack does not manage bootstrap."
  }

  # The bucket exists before any stack does (create-s3-bucket.sh), and the
  # platform stack reads its name from this output; a null output is left
  # out of the remote state, and the platform plan fails on the attribute.
  assert {
    condition     = output.bootstrap_bucket_name == "cloudops-tfstate-example"
    error_message = "The state bucket's name must stay in the outputs without bootstrap."
  }
}
