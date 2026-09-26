resource "aws_secretsmanager_secret" "db_liquibase" {
  name        = "memgine/prod/db/liquibase"
  description = "Memgine PROD Liquibase database credentials"

  tags = {
    Application = var.app_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret" "db_runtime" {
  name        = "memgine/prod/db/runtime"
  description = "Memgine PROD application runtime database credentials"

  tags = {
    Application = var.app_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret" "resend_api_key" {
  name        = "memgine/prod/resend-api-key"
  description = "Resend API key for Memgine PROD"

  tags = {
    Application = var.app_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret" "meta_wa_token" {
  name        = "memgine/prod/meta-wa-token"
  description = "Meta WhatsApp token for Memgine PROD"

  tags = {
    Application = var.app_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret" "otp_pepper" {
  name        = "memgine/prod/otp-pepper"
  description = "Memgine PROD OTP pepper"

  tags = {
    Application = var.app_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
