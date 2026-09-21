resource "aws_sqs_queue" "email_dlq" {
  name                      = "${local.prefix}-email-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true

  tags = merge(local.tags, {
    Purpose = "notification-email-dlq"
  })
}

resource "aws_sqs_queue" "email" {
  name                       = "${local.prefix}-email-queue"
  visibility_timeout_seconds = 60
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.email_dlq.arn
    maxReceiveCount     = 5
  })

  tags = merge(local.tags, {
    Purpose = "notification-email"
  })
}

resource "aws_sqs_queue" "whatsapp_dlq" {
  name                      = "${local.prefix}-whatsapp-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true

  tags = merge(local.tags, {
    Purpose = "notification-whatsapp-dlq"
  })
}

resource "aws_sqs_queue" "whatsapp" {
  name                       = "${local.prefix}-whatsapp-queue"
  visibility_timeout_seconds = 60
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.whatsapp_dlq.arn
    maxReceiveCount     = 5
  })

  tags = merge(local.tags, {
    Purpose = "notification-whatsapp"
  })
}