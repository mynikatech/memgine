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
