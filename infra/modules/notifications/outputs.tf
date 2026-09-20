output "notification_topic_arn" { value = aws_sns_topic.events.arn }
output "email_queue_arn" { value = aws_sqs_queue.email.arn }
output "email_queue_url" { value = aws_sqs_queue.email.url }
output "email_dlq_arn" { value = aws_sqs_queue.email_dlq.arn }
output "whatsapp_queue_arn" { value = aws_sqs_queue.whatsapp.arn }
output "whatsapp_queue_url" { value = aws_sqs_queue.whatsapp.url }
output "whatsapp_dlq_arn" { value = aws_sqs_queue.whatsapp_dlq.arn }
