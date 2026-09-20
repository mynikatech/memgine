module "notifications" {
  source      = "../../modules/notifications"
  app_name    = "memgine"
  environment = "dev"
}
