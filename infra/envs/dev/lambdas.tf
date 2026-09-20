locals {
  lambda_tags = {
    Application = "memgine"
    Environment = "dev"
    ManagedBy   = "terraform"
  }
}

resource "aws_cloudwatch_log_group" "email" {
  name              = "/aws/lambda/memgine-dev-email-processor"
  retention_in_days = 14
  tags              = merge(local.lambda_tags, { Purpose = "notification-email-processor" })
}

resource "aws_cloudwatch_log_group" "whatsapp" {
  name              = "/aws/lambda/memgine-dev-whatsapp-processor"
  retention_in_days = 14
  tags              = merge(local.lambda_tags, { Purpose = "notification-whatsapp-processor" })
}

module "email_role" {
  source        = "../../modules/iam/lambda-email-role"
  role_name     = "memgine-dev-email-lambda-role"
  queue_arn     = module.notifications.email_queue_arn
  log_group_arn = aws_cloudwatch_log_group.email.arn
}

module "whatsapp_role" {
  source        = "../../modules/iam/lambda-whatsapp-role"
  role_name     = "memgine-dev-whatsapp-lambda-role"
  queue_arn     = module.notifications.whatsapp_queue_arn
  log_group_arn = aws_cloudwatch_log_group.whatsapp.arn
}

resource "aws_lambda_function" "email" {
  function_name    = "memgine-dev-email-processor"
  role             = module.email_role.role_arn
  runtime          = "java21"
  handler          = "com.mynikatech.memgine.lambda.email.EmailProcessorHandler::handleRequest"
  filename         = "${path.module}/../../../lambda/email-processor/build/libs/memgine-email-processor.jar"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/email-processor/build/libs/memgine-email-processor.jar")
  timeout          = 30
  memory_size      = 512
  depends_on       = [aws_cloudwatch_log_group.email]
  tags             = merge(local.lambda_tags, { Purpose = "notification-email-processor" })
}

resource "aws_lambda_function" "whatsapp" {
  function_name    = "memgine-dev-whatsapp-processor"
  role             = module.whatsapp_role.role_arn
  runtime          = "java21"
  handler          = "com.mynikatech.memgine.lambda.whatsapp.WhatsAppProcessorHandler::handleRequest"
  filename         = "${path.module}/../../../lambda/whatsapp-processor/build/libs/memgine-whatsapp-processor.jar"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/whatsapp-processor/build/libs/memgine-whatsapp-processor.jar")
  timeout          = 30
  memory_size      = 512
  depends_on       = [aws_cloudwatch_log_group.whatsapp]
  tags             = merge(local.lambda_tags, { Purpose = "notification-whatsapp-processor" })
}

resource "aws_lambda_event_source_mapping" "email" {
  event_source_arn = module.notifications.email_queue_arn
  function_name    = aws_lambda_function.email.arn
  batch_size       = 1
  enabled          = true
}

resource "aws_lambda_event_source_mapping" "whatsapp" {
  event_source_arn = module.notifications.whatsapp_queue_arn
  function_name    = aws_lambda_function.whatsapp.arn
  batch_size       = 1
  enabled          = true
}
