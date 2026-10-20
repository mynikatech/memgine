package com.mynikatech.memgine.component.support

import com.mynikatech.memgine.config.SupportWebhookConfig
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.BadRequestException
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import org.jdbi.v3.core.Jdbi
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

private const val maxMetaWebhookBytes = 262_144

class MetaWhatsAppWebhookService(private val jdbi: Jdbi, private val config: SupportWebhookConfig) {
    private val json = Json { ignoreUnknownKeys = true }

    fun verifies(mode: String?, token: String?) =
        config.verifyToken.isNotBlank() && mode == "subscribe" && constantTimeEquals(token.orEmpty(), config.verifyToken)

    fun process(raw: String, signature: String?) {
        if (config.appSecret.isBlank() || !validSignature(raw, signature)) throw ForbiddenException("Webhook signature is invalid")
        val root = try { json.parseToJsonElement(raw).jsonObject } catch (_: Exception) { throw BadRequestException("Webhook payload is invalid") }
        val callbacks = root["entry"]?.jsonArray.orEmpty().flatMap { entry ->
            entry.jsonObject["changes"]?.jsonArray.orEmpty().flatMap { change ->
                change.jsonObject["value"]?.jsonObject?.get("statuses")?.jsonArray.orEmpty()
            }
        }
        jdbi.inTransaction<Unit, Exception> { handle ->
            val sql = handle.attach(SupportNotificationOutboxSql::class.java)
            callbacks.forEach { status ->
                val item = status.jsonObject
                val messageId = item["id"]?.jsonPrimitive?.contentOrNull ?: return@forEach
                val state = item["status"]?.jsonPrimitive?.contentOrNull?.lowercase() ?: return@forEach
                if (state !in setOf("sent", "delivered", "read", "failed")) return@forEach
                val timestamp = item["timestamp"]?.jsonPrimitive?.longOrNull?.let { OffsetDateTime.ofInstant(Instant.ofEpochSecond(it), ZoneOffset.UTC) }
                val error = if (state == "failed") item["errors"]?.jsonArray?.firstOrNull()?.jsonObject?.get("code")?.jsonPrimitive?.contentOrNull?.let { "META_$it" } else null
                val fingerprint = sha256("$messageId|$state|${timestamp?.toInstant()?.epochSecond}|$error")
                sql.recordWhatsAppStatus("WSE-${UUID.randomUUID()}", messageId, state, timestamp, error, fingerprint)
            }
        }
    }

    fun acknowledge(raw: String, signature: String?) {
        if (config.acknowledgementSecret.isBlank() || !validAcknowledgementSignature(raw, signature)) throw ForbiddenException("Delivery acknowledgement is invalid")
        val item = try { json.decodeFromString<DeliveryAcknowledgement>(raw) } catch (_: Exception) { throw BadRequestException("Delivery acknowledgement is invalid") }
        if (item.deliveryId.isBlank() || item.providerMessageId.isBlank()) throw BadRequestException("Delivery acknowledgement is invalid")
        jdbi.onDemand(SupportNotificationOutboxSql::class.java).acknowledge(item.deliveryId, item.providerMessageId, item.providerCorrelationId)
    }

    private fun validSignature(raw: String, header: String?): Boolean {
        val supplied = header?.removePrefix("sha256=") ?: return false
        if (!header.startsWith("sha256=") || supplied.length != 64) return false
        val expected = Mac.getInstance("HmacSHA256").run {
            init(SecretKeySpec(config.appSecret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256"))
            doFinal(raw.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02x".format(it) }
        }
        return constantTimeEquals(supplied, expected)
    }
    private fun validAcknowledgementSignature(raw: String, header: String?): Boolean {
        val supplied = header?.removePrefix("sha256=") ?: return false
        if (!header.startsWith("sha256=") || supplied.length != 64) return false
        val expected = Mac.getInstance("HmacSHA256").run { init(SecretKeySpec(config.acknowledgementSecret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256")); doFinal(raw.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02x".format(it) } }
        return constantTimeEquals(supplied, expected)
    }
    private fun sha256(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
    private fun constantTimeEquals(left: String, right: String) = MessageDigest.isEqual(left.toByteArray(StandardCharsets.UTF_8), right.toByteArray(StandardCharsets.UTF_8))
}

@Serializable private data class DeliveryAcknowledgement(val deliveryId: String, val providerMessageId: String, val providerCorrelationId: String? = null)

fun Route.metaWhatsAppWebhookRoutes(service: MetaWhatsAppWebhookService) {
    route("/webhooks/whatsapp/meta") {
        get {
            if (!service.verifies(call.request.queryParameters["hub.mode"], call.request.queryParameters["hub.verify_token"])) throw ForbiddenException("Webhook verification is invalid")
            call.respondText(call.request.queryParameters["hub.challenge"] ?: "", ContentType.Text.Plain, HttpStatusCode.OK)
        }
        post {
            val raw = call.receiveText()
            if (raw.toByteArray(StandardCharsets.UTF_8).size > maxMetaWebhookBytes) throw BadRequestException("Webhook payload is too large")
            service.process(raw, call.request.headers["X-Hub-Signature-256"])
            call.respondText("", status = HttpStatusCode.OK)
        }
    }
    post("/webhooks/whatsapp/delivery-ack") {
        val raw = call.receiveText()
        if (raw.toByteArray(StandardCharsets.UTF_8).size > 8_192) throw BadRequestException("Delivery acknowledgement is too large")
        service.acknowledge(raw, call.request.headers["X-Memgine-Delivery-Signature"])
        call.respondText("", status = HttpStatusCode.OK)
    }
}
