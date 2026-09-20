locals {
  prefix = "${var.app_name}-${var.environment}"
  tags   = { Application = "memgine", Environment = var.environment, ManagedBy = "terraform", Purpose = "notification-transport" }
}
resource "aws_sns_topic" "events" {
  name = "${local.prefix}-notification-events"
  tags = local.tags
}
