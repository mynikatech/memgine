resource "aws_pinpointsmsvoicev2_phone_number" "sms_simulator" {
  iso_country_code = "US"
  message_type     = "TRANSACTIONAL"
  number_capabilities = [
    "SMS"
  ]
  number_type = "SIMULATOR"

  tags = merge(local.lambda_tags, {
    Purpose = "sms-simulator"
  })
}
