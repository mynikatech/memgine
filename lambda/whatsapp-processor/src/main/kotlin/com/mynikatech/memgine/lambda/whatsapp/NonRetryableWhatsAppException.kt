package com.mynikatech.memgine.lambda.whatsapp
class NonRetryableWhatsAppException(val status:Int) : RuntimeException("Meta WhatsApp request was rejected with HTTP $status")
