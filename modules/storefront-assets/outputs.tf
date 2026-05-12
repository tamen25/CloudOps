output "bucket_name" {
  value = aws_s3_bucket.assets.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.assets.arn
}

output "distribution_domain_name" {
  value = aws_cloudfront_distribution.assets.domain_name
}

output "assets_url" {
  value = var.create_custom_domain ? "https://${local.asset_host}" : "https://${aws_cloudfront_distribution.assets.domain_name}"
}
