package com.mynikatech.memgine.lambda.email

object EmailSenderFactory {
    private val secretProvider = SecretsManagerSecretProvider()
    private val sender: EmailSender by lazy {
        val secretId = System.getenv("RESEND_API_KEY_SECRET_ID")?.trim().orEmpty()
        if (secretId.isEmpty()) {
            throw IllegalStateException("Unable to resolve configured provider secret.")
        }
        ResendEmailSender(apiKey = secretProvider.get(secretId))
    }

    fun create(): EmailSender = sender
}
