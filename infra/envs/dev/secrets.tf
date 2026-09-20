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