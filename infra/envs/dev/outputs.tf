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

output "app_ec2_instance_id" {
  value = module.application_host.ec2_instance_id
}

output "app_elastic_ip" {
  value = module.application_host.elastic_ip
}

output "app_deploy_bucket" {
  value = module.application_host.deploy_bucket_name
}

output "app_data_bucket" {
  value = module.application_host.app_data_bucket_name
}

output "app_database_endpoint" {
  value = module.application_host.database_endpoint
}

output "app_database_master_secret_arn" {
  value     = module.application_host.database_master_secret_arn
  sensitive = true
}

output "app_database_liquibase_secret_arn" {
  value     = aws_secretsmanager_secret.db_liquibase.arn
  sensitive = true
}

output "app_database_runtime_secret_arn" {
  value     = aws_secretsmanager_secret.db_runtime.arn
  sensitive = true
}
