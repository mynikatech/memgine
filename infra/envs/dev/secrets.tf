resource "aws_secretsmanager_secret" "resend_api_key" {
  name        = "memgine/dev/resend-api-key"
  description = "Resend API key for Memgine DEV"
  tags        = local.lambda_tags
}

resource "aws_secretsmanager_secret" "meta_wa_token" {
  name        = "memgine/dev/meta-wa-token"
  description = "Meta WhatsApp token for Memgine DEV"
  tags        = local.lambda_tags
}

resource "aws_secretsmanager_secret" "db_liquibase" {
  name        = "memgine/dev/db/liquibase"
  description = "Memgine DEV Liquibase database credentials"
  tags        = local.lambda_tags
}

resource "aws_secretsmanager_secret" "db_runtime" {
  name        = "memgine/dev/db/runtime"
  description = "Memgine DEV application runtime database credentials"
  tags        = local.lambda_tags
}
