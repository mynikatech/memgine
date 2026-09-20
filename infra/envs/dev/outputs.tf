output "notification_topic_arn" { value = module.notifications.notification_topic_arn }
output "email_queue_arn" { value = module.notifications.email_queue_arn }
output "email_queue_url" { value = module.notifications.email_queue_url }
output "email_dlq_arn" { value = module.notifications.email_dlq_arn }
output "whatsapp_queue_arn" { value = module.notifications.whatsapp_queue_arn }
output "whatsapp_queue_url" { value = module.notifications.whatsapp_queue_url }
output "whatsapp_dlq_arn" { value = module.notifications.whatsapp_dlq_arn }
