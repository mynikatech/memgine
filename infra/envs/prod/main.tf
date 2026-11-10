module "notifications" {
  source      = "../../modules/notifications"
  app_name    = var.app_name
  environment = var.environment
}

