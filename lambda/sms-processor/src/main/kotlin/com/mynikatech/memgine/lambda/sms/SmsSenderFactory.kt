package com.mynikatech.memgine.lambda.sms

object SmsSenderFactory {
    fun create(): SmsSender = when (
        System.getenv("SMS_PROVIDER")?.trim()?.uppercase() ?: "AWS_END_USER_MESSAGING_SMS"
    ) {
        "AWS_END_USER_MESSAGING_SMS" -> AwsEndUserMessagingSmsSender()
        else -> throw NonRetryableSmsException(reason = "unsupported-provider")
    }
}
