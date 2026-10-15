#GuardDuty — single-account detector with optional protection plans.

resource "aws_guardduty_detector" "main" {
  count  = var.enable_guardduty ? 1 : 0
  enable = true

  finding_publishing_frequency = "FIFTEEN_MINUTES"

  datasources {
    s3_logs {
      enable = var.guardduty_s3_protection
    }

    kubernetes {
      audit_logs {
        enable = var.guardduty_eks_protection
      }
    }

    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = var.guardduty_malware_protection
        }
      }
    }
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-guardduty" })
}

#EKS Runtime Monitoring is a feature toggle (separate API).
resource "aws_guardduty_detector_feature" "eks_runtime" {
  count = var.enable_guardduty && var.guardduty_eks_protection ? 1 : 0

  detector_id = aws_guardduty_detector.main[0].id
  name        = "EKS_RUNTIME_MONITORING"
  status      = "ENABLED"

  additional_configuration {
    name   = "EKS_ADDON_MANAGEMENT"
    status = "ENABLED"
  }
}
