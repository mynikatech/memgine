package com.mynikatech.memgine.lambda.whatsapp

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class DeliveryAcknowledgementClient(
    private val url: String = System.getenv("MEMGINE_WHATSAPP_DELIVERY_ACK_URL").orEmpty(),
    private val secret: String = System.getenv("MEMGINE_WHATSAPP_DELIVERY_ACK_SECRET").orEmpty(),
    private val client: OkHttpClient = OkHttpClient()
) {
    fun acknowledge(deliveryId: String, providerMessageId: String) {
        if (url.isBlank() || secret.isBlank()) throw IllegalStateException("Support delivery acknowledgement is not configured")
        val payload = Json.encodeToString(DeliveryAcknowledgement(deliveryId, providerMessageId))
        val signature = Mac.getInstance("HmacSHA256").run { init(SecretKeySpec(secret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256")); doFinal(payload.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02x".format(it) } }
        client.newCall(Request.Builder().url(url).header("X-Memgine-Delivery-Signature", "sha256=$signature").post(payload.toRequestBody("application/json".toMediaType())).build()).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("Support delivery acknowledgement failed")
        }
    }
}

@kotlinx.serialization.Serializable
private data class DeliveryAcknowledgement(val deliveryId: String, val providerMessageId: String)
