resource "aws_iam_role_policy" "this" {
  role   = aws_iam_role.this.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${var.log_group_arn}:*" }, { Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], Resource = var.queue_arn }, { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.secret_arn }] })
}
