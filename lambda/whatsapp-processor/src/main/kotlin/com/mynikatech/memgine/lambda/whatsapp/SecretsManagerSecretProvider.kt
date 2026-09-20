package com.mynikatech.memgine.lambda.whatsapp

import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest
import java.util.concurrent.ConcurrentHashMap

class SecretsManagerSecretProvider(
    private val client: SecretsManagerClient = SecretsManagerClient.create()
) {
    private val cache = ConcurrentHashMap<String, String>()

    fun get(secretId: String): String {
        if (secretId.isBlank()) {
            throw IllegalStateException("Unable to resolve configured provider secret.")
        }

        return cache.computeIfAbsent(secretId) { requestedSecretId ->
            try {
                client.getSecretValue(
                    GetSecretValueRequest.builder()
                        .secretId(requestedSecretId)
                        .build()
                ).secretString()?.takeIf { it.isNotBlank() }
                    ?: throw IllegalStateException("Unable to resolve configured provider secret.")
            } catch (error: IllegalStateException) {
                throw error
            } catch (_: Exception) {
                throw IllegalStateException("Unable to resolve configured provider secret.")
            }
        }
    }
}
