package com.mynikatech.memgine.lambda.whatsapp

object MetaWhatsAppSenderFactory {
    private val secretProvider = SecretsManagerSecretProvider()
    private val sender: MetaWhatsAppSender by lazy {
        val secretId = System.getenv("META_WA_TOKEN_SECRET_ID")?.trim().orEmpty()
        if (secretId.isEmpty()) {
            throw IllegalStateException("Unable to resolve configured provider secret.")
        }
        MetaWhatsAppSender(token = secretProvider.get(secretId))
    }

    fun create(): MetaWhatsAppSender = sender
}
