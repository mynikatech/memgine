module "role" {
  source        = "../lambda-email-role"
  role_name     = var.role_name
  queue_arn     = var.queue_arn
  log_group_arn = var.log_group_arn
  secret_arn    = var.secret_arn
}
