output "stream_name" {
  value = aws_kinesis_stream.orders.name
}

output "stream_arn" {
  value = aws_kinesis_stream.orders.arn
}
