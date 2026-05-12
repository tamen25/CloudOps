output "table_name" {
  value = aws_dynamodb_table.cart.name
}

output "table_arn" {
  value = aws_dynamodb_table.cart.arn
}

output "irsa_role_arn" {
  description = "Annotate the storefront ServiceAccount with this role to grant cart Dynamo access."
  value       = aws_iam_role.cart.arn
}
