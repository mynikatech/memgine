package com.mynikatech.memgine.lambda.sms

class NonRetryableSmsException(
    val status: Int? = null,
    val providerErrorCode: String? = null,
    reason: String = "provider-rejected-request"
) : RuntimeException("SMS request cannot be retried: $reason")
