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

output "app_otp_pepper_secret_arn" {
  value     = aws_secretsmanager_secret.otp_pepper.arn
  sensitive = true
}

output "otp_sms_canada_origination_identity" {
  value = var.otp_sms_canada_origination_identity
}

output "otp_allow_live_sms" {
  value = var.allow_live_sms
}

output "app_database_port" {
  value = module.application_host.database_port
}
