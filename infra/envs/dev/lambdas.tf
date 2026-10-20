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
  environment { variables = { META_PHONE_NUMBER_ID = var.meta_phone_number_id, META_GRAPH_API_VERSION = var.meta_graph_api_version, META_WA_TOKEN_SECRET_ID = aws_secretsmanager_secret.meta_wa_token.name, MEMGINE_WHATSAPP_DELIVERY_ACK_QUEUE_URL = module.notifications.whatsapp_delivery_ack_queue_url } }
}

resource "aws_iam_role_policy" "whatsapp_ack_send" {
  name   = "memgine-dev-whatsapp-ack-send"
  role   = "memgine-dev-whatsapp-lambda-role"
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["sqs:SendMessage"], Resource = module.notifications.whatsapp_delivery_ack_queue_arn }] })
}

resource "aws_cloudwatch_log_group" "whatsapp_ack" {
  name              = "/aws/lambda/memgine-dev-whatsapp-ack-processor"
  retention_in_days = 14
}
resource "aws_iam_role" "whatsapp_ack" {
  name               = "memgine-dev-whatsapp-ack-lambda-role"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy" "whatsapp_ack" {
  name = "memgine-dev-whatsapp-ack-policy"
  role = aws_iam_role.whatsapp_ack.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], Resource = module.notifications.whatsapp_delivery_ack_queue_arn },
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.whatsapp_ack.arn}:*" }
  ] })
}
resource "aws_lambda_function" "whatsapp_ack" {
  function_name    = "memgine-dev-whatsapp-ack-processor"
  role             = aws_iam_role.whatsapp_ack.arn
  runtime          = "java21"
  handler          = "com.mynikatech.memgine.lambda.whatsapp.DeliveryAcknowledgementProcessorHandler::handleRequest"
  filename         = "${path.module}/../../../lambda/whatsapp-processor/build/libs/memgine-whatsapp-processor.jar"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/whatsapp-processor/build/libs/memgine-whatsapp-processor.jar")
  timeout          = 30
  memory_size      = 512
  environment { variables = { MEMGINE_WHATSAPP_DELIVERY_ACK_URL = var.whatsapp_delivery_ack_url, MEMGINE_WHATSAPP_DELIVERY_ACK_SECRET = var.whatsapp_delivery_ack_secret } }
}
resource "aws_lambda_event_source_mapping" "whatsapp_ack" {
  event_source_arn        = module.notifications.whatsapp_delivery_ack_queue_arn
  function_name           = aws_lambda_function.whatsapp_ack.arn
  batch_size              = 10
  enabled                 = false
  function_response_types = ["ReportBatchItemFailures"]
}

resource "aws_lambda_event_source_mapping" "email" {
  event_source_arn = module.notifications.email_queue_arn
  function_name    = aws_lambda_function.email.arn
  batch_size       = 1
  enabled          = true
}

resource "aws_lambda_event_source_mapping" "whatsapp" {
  event_source_arn        = module.notifications.whatsapp_queue_arn
  function_name           = aws_lambda_function.whatsapp.arn
  batch_size              = 1
  enabled                 = true
  function_response_types = ["ReportBatchItemFailures"]
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
      SMS_PROVIDER     = "AWS_END_USER_MESSAGING_SMS"
      SMS_MESSAGE_TYPE = "TRANSACTIONAL"
    }
  }
}

resource "aws_lambda_event_source_mapping" "sms" {
  event_source_arn = module.notifications.sms_queue_arn
  function_name    = aws_lambda_function.sms.arn
  batch_size       = 1
  enabled          = true
}
