output "state_machine_arn" {
  value = aws_sfn_state_machine.checkout.arn
}

output "state_machine_name" {
  value = aws_sfn_state_machine.checkout.name
}

output "email_queue_url" {
  value = aws_sqs_queue.email.url
}

output "email_function_name" {
  value = aws_lambda_function.email.function_name
}
