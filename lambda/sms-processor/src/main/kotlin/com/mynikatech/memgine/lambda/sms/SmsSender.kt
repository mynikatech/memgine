package com.mynikatech.memgine.lambda.sms

data class SmsSendResult(val messageId: String?)

interface SmsSender {
    fun send(to: String, message: String): SmsSendResult
}
