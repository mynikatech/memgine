# Phase 329A: application logs only. No EC2 user_data changes.
resource "aws_secretsmanager_secret" "grafana_loki" {
  count                   = var.grafana_logging_managed ? 1 : 0
  name                    = "/${var.app_name}/${var.environment}/grafana/loki"
  description             = "Grafana Loki writer credentials (value managed outside Terraform)"
  recovery_window_in_days = 7
  tags                    = local.tags
}

resource "aws_iam_role_policy" "grafana_loki" {
  count = var.grafana_logging_managed ? 1 : 0
  name  = "${local.name_prefix}-grafana-loki"
  role  = aws_iam_role.ec2.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.grafana_loki[0].arn
    }]
  })
}

resource "aws_ssm_document" "grafana_logging" {
  count           = var.grafana_logging_managed ? 1 : 0
  name            = "${local.name_prefix}-grafana-logging"
  document_type   = "Command"
  document_format = "JSON"
  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Manage Memgine Grafana Alloy application log forwarding"
    mainSteps = [{
      action = "aws:runShellScript"
      name   = "configureAlloy"
      inputs = {
        timeoutSeconds = "600"
        runCommand = [templatefile("${path.module}/grafana-alloy-setup.sh.tftpl", {
          enabled     = var.grafana_logging_enabled
          aws_region  = var.aws_region
          secret_arn  = aws_secretsmanager_secret.grafana_loki[0].arn
          loki_url    = var.grafana_loki_url
          loki_user   = var.grafana_loki_username
          app_name    = var.app_name
          environment = var.environment
        })]
      }
    }]
  })
  tags = local.tags

  lifecycle {
    precondition {
      condition     = !var.grafana_logging_enabled || (var.grafana_loki_url != "" && var.grafana_loki_username != "")
      error_message = "Loki URL and username are required before forwarding can be enabled."
    }
  }
}

resource "aws_ssm_association" "grafana_logging" {
  count                            = var.grafana_logging_managed ? 1 : 0
  name                             = aws_ssm_document.grafana_logging[0].name
  association_name                 = "${local.name_prefix}-grafana-logging"
  document_version                 = tostring(aws_ssm_document.grafana_logging[0].latest_version)
  wait_for_success_timeout_seconds = 900

  targets {
    key    = "InstanceIds"
    values = [aws_instance.app.id]
  }

  depends_on = [aws_iam_role_policy.grafana_loki, aws_eip_association.app]
}
