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

resource "aws_secretsmanager_secret" "poynt_cloud_app" {
  name        = "memgine/prod/poynt/cloud-app"
  description = "Poynt Production Cloud Application private key for Memgine PROD"

  tags = local.lambda_tags
}

resource "aws_secretsmanager_secret" "poynt_test_lab_cloud_app" {
  name        = "memgine/prod/poynt-test-lab/cloud-app"
  description = "Poynt Production Test Lab private key for Memgine PROD"
  tags        = local.lambda_tags
}

import {
  to = aws_secretsmanager_secret.poynt_test_lab_cloud_app
  id = "arn:aws:secretsmanager:ca-central-1:482762107384:secret:memgine/prod/poynt-test-lab/cloud-app-a96gHC"
}

resource "aws_secretsmanager_secret" "poynt_payment_bridge_callback" {
  name        = "memgine/prod/poynt/payment-bridge-callback"
  description = "Poynt Payment Bridge callback authentication value for Memgine PROD"

  tags = local.lambda_tags
}
