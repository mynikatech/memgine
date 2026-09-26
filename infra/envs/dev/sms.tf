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

resource "aws_pinpointsmsvoicev2_phone_number" "otp_canada" {
  iso_country_code            = "CA"
  message_type                = "TRANSACTIONAL"
  number_capabilities         = ["SMS"]
  number_type                 = "LONG_CODE"
  deletion_protection_enabled = true

  tags = merge(local.lambda_tags, {
    Purpose = "otp"
  })
}
