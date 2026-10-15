#Cognito User Pool + Hosted UI app client for the storefront.
#- Email-only signup, verification via Cognito's built-in email channel.
#- Custom attribute `tenant_id` (immutable post-signup) drives multi-tenancy
#  end-to-end (order-api withTenant + RLS already reads custom:tenant_id).
#- Hosted UI custom domain `auth.<domain_name>` is optional — flip
#  create_hosted_ui_domain=true plus an ACM cert in us-east-1 to enable.

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

resource "aws_cognito_user_pool" "storefront" {
  name = "${local.name_prefix}-storefront"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = var.password_minimum_length
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  mfa_configuration = var.mfa_configuration

  dynamic "software_token_mfa_configuration" {
    for_each = var.mfa_configuration == "OFF" ? [] : [1]
    content {
      enabled = true
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  schema {
    name                     = "tenant_id"
    attribute_data_type      = "String"
    mutable                  = false
    required                 = false
    developer_only_attribute = false
    string_attribute_constraints {
      min_length = 1
      max_length = 64
    }
  }

  user_pool_add_ons {
    advanced_security_mode = var.environment == "prod" ? "ENFORCED" : "AUDIT"
  }

  deletion_protection = var.environment == "prod" ? "ACTIVE" : "INACTIVE"

  tags = var.tags
}

#Admin group — storefront middleware checks for membership before allowing
#/admin/* (lands in #88 wiring).
resource "aws_cognito_user_group" "admin" {
  name         = var.admin_group_name
  user_pool_id = aws_cognito_user_pool.storefront.id
  description  = "Storefront admin group — gates /admin routes."
  precedence   = 1
}

#Storefront app client — PKCE, no client secret (public client / browser).
resource "aws_cognito_user_pool_client" "storefront" {
  name         = "${local.name_prefix}-storefront-client"
  user_pool_id = aws_cognito_user_pool.storefront.id

  generate_secret              = false
  supported_identity_providers = ["COGNITO"]

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  id_token_validity      = var.id_token_validity_minutes
  access_token_validity  = var.access_token_validity_minutes
  refresh_token_validity = var.refresh_token_validity_days

  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  read_attributes = [
    "email",
    "email_verified",
    "custom:tenant_id",
  ]

  write_attributes = [
    "email",
  ]
}

#Hosted UI custom domain. Only created when an ACM cert in us-east-1 is
#provided AND a Route 53 zone ID for the apex domain is set.
resource "aws_cognito_user_pool_domain" "storefront" {
  count = var.create_hosted_ui_domain ? 1 : 0

  domain          = "auth.${var.domain_name}"
  user_pool_id    = aws_cognito_user_pool.storefront.id
  certificate_arn = var.hosted_ui_acm_certificate_arn
}

#Alias A record auth.<domain> -> Cognito Hosted UI CloudFront distribution.
resource "aws_route53_record" "auth" {
  count = var.create_hosted_ui_domain ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "auth.${var.domain_name}"
  type    = "A"

  alias {
    #Cognito custom domain uses CloudFront under the hood; this is the
    #fixed CloudFront hosted zone ID for alias records.
    name                   = aws_cognito_user_pool_domain.storefront[0].cloudfront_distribution
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}
