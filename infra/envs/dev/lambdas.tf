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
  secret_arn    = aws_secretsmanager_secret.resend_api_key.arn
}

module "whatsapp_role" {
  source        = "../../modules/iam/lambda-whatsapp-role"
  role_name     = "memgine-dev-whatsapp-lambda-role"
  queue_arn     = module.notifications.whatsapp_queue_arn
  log_group_arn = aws_cloudwatch_log_group.whatsapp.arn
  secret_arn    = aws_secretsmanager_secret.meta_wa_token.arn
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
  environment { variables = { RESEND_FROM_EMAIL = var.resend_from_email, RESEND_API_KEY_SECRET_ID = aws_secretsmanager_secret.resend_api_key.name } }
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
  environment { variables = { META_PHONE_NUMBER_ID = var.meta_phone_number_id, META_GRAPH_API_VERSION = var.meta_graph_api_version, META_WA_TOKEN_SECRET_ID = aws_secretsmanager_secret.meta_wa_token.name } }
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

resource "aws_cloudwatch_log_group" "sms" {
  name              = "/aws/lambda/memgine-dev-sms-processor"
  retention_in_days = 14
  tags = merge(local.lambda_tags, {
    Purpose = "notification-sms-processor"
  })
}

module "sms_role" {
  source        = "../../modules/iam/lambda-sms-role"
  role_name     = "memgine-dev-sms-lambda-role"
  queue_arn     = module.notifications.sms_queue_arn
  log_group_arn = aws_cloudwatch_log_group.sms.arn

  sms_send_message_resources = [aws_pinpointsmsvoicev2_phone_number.sms_simulator.arn]
}

resource "aws_lambda_function" "sms" {
  function_name    = "memgine-dev-sms-processor"
  role             = module.sms_role.role_arn
  runtime          = "java21"
  handler          = "com.mynikatech.memgine.lambda.sms.SmsProcessorHandler"
  filename         = "${path.module}/../../../lambda/sms-processor/build/libs/memgine-sms-processor.jar"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/sms-processor/build/libs/memgine-sms-processor.jar")
  timeout          = 30
  memory_size      = 512
  depends_on       = [aws_cloudwatch_log_group.sms]
  tags = merge(local.lambda_tags, {
    Purpose = "notification-sms-processor"
  })

  environment {
    variables = {
      SMS_PROVIDER             = "AWS_END_USER_MESSAGING_SMS"
      SMS_MESSAGE_TYPE         = "TRANSACTIONAL"
      SMS_ORIGINATION_IDENTITY = aws_pinpointsmsvoicev2_phone_number.sms_simulator.phone_number
    }
  }
}

resource "aws_lambda_event_source_mapping" "sms" {
  event_source_arn = module.notifications.sms_queue_arn
  function_name    = aws_lambda_function.sms.arn
  batch_size       = 1
  enabled          = true
}
