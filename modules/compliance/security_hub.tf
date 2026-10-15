#Security Hub — single-account, with subscribed standards.

resource "aws_securityhub_account" "main" {
  count = var.enable_security_hub ? 1 : 0
}

resource "aws_securityhub_standards_subscription" "main" {
  for_each = var.enable_security_hub ? toset(var.security_hub_standards) : []

  standards_arn = each.value
  depends_on    = [aws_securityhub_account.main]
}
