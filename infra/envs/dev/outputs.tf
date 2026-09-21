output "notification_topic_arn" { value = module.notifications.notification_topic_arn }
output "email_queue_arn" { value = module.notifications.email_queue_arn }
output "email_queue_url" { value = module.notifications.email_queue_url }
output "email_dlq_arn" { value = module.notifications.email_dlq_arn }
output "whatsapp_queue_arn" { value = module.notifications.whatsapp_queue_arn }
output "whatsapp_queue_url" { value = module.notifications.whatsapp_queue_url }
output "whatsapp_dlq_arn" { value = module.notifications.whatsapp_dlq_arn }
output "email_lambda_arn" { value = aws_lambda_function.email.arn }
output "email_lambda_name" { value = aws_lambda_function.email.function_name }
output "whatsapp_lambda_arn" { value = aws_lambda_function.whatsapp.arn }
output "whatsapp_lambda_name" { value = aws_lambda_function.whatsapp.function_name }
output "email_lambda_role_arn" { value = module.email_role.role_arn }
output "whatsapp_lambda_role_arn" { value = module.whatsapp_role.role_arn }

output "sms_queue_arn" {
  value = module.notifications.sms_queue_arn
}

output "sms_queue_url" {
  value = module.notifications.sms_queue_url
}

output "sms_dlq_arn" {
  value = module.notifications.sms_dlq_arn
}

output "sms_lambda_arn" {
  value = aws_lambda_function.sms.arn
}

output "sms_lambda_role_arn" {
  value = module.sms_role.role_arn
}

output "sms_simulator_origination_identity" {
  value = aws_pinpointsmsvoicev2_phone_number.sms_simulator.phone_number
}

output "sms_simulator_origination_arn" {
  value = aws_pinpointsmsvoicev2_phone_number.sms_simulator.arn
}
