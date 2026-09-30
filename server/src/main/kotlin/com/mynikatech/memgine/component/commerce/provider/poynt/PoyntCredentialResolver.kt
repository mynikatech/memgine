package com.mynikatech.memgine.component.commerce.provider.poynt

import com.mynikatech.memgine.exception.BadRequestException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest

/** Reads durable private-key material only; its value never leaves this provider package. */
class AwsSecretsManagerPoyntCredentialResolver(private val region: String) : PoyntCredentialResolver {
    override fun resolve(secretReference: String): PoyntCredential {
        if (secretReference.isBlank() || region.isBlank()) throw BadRequestException("Poynt credentials are not configured")
        val secret = SecretsManagerClient.builder().region(Region.of(region)).build().use { client ->
            client.getSecretValue(GetSecretValueRequest.builder().secretId(secretReference).build()).secretString()
        }
        val privateKeyPem = Json.parseToJsonElement(secret).jsonObject["privateKeyPem"]
            ?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException("Poynt credential secret is incomplete")
        return PoyntCredential(privateKeyPem)
    }
}