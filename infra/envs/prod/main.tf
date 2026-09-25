module "application_host" {
  source = "../../modules/application-host"

  providers = {
    aws     = aws
    aws.dns = aws.dns
  }

  app_name         = var.app_name
  environment      = var.environment
  aws_region       = var.aws_region
  hosted_zone_name = var.hosted_zone_name
  frontend_domain  = var.frontend_domain
  api_domain       = var.api_domain

  instance_type               = var.instance_type
  db_instance_class           = var.db_instance_class
  db_engine_version           = var.db_engine_version
  db_name                     = var.db_name
  db_master_username          = var.db_master_username
  db_allocated_storage_gb     = var.db_allocated_storage_gb
  db_max_allocated_storage_gb = var.db_max_allocated_storage_gb
  db_backup_retention_days    = var.db_backup_retention_days
  db_deletion_protection      = var.db_deletion_protection
  db_skip_final_snapshot      = var.db_skip_final_snapshot
  runtime_db_secret_arn       = aws_secretsmanager_secret.db_runtime.arn
  additional_secret_arns      = var.additional_secret_arns
}
