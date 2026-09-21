package com.mynikatech.memgine.lambda.whatsapp

class NonRetryableWhatsAppException(
    val status: Int,
    val errorCode: Int?,
    val errorType: String?,
    val providerMessage: String?
) : RuntimeException("Meta WhatsApp request was rejected with HTTP $status")
