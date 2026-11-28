package com.mynikatech.memgine.component.notification

import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory

/** Common notification dispatcher. The legacy OTP/Support path is retained. */
class NotificationDispatchService(
    private val sql: NotificationDispatchSql,
    private val notifications: NotificationService,
    private val externalPublisher: ExternalNotificationPublisher
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    /** Legacy dispatch contract; OTP and Support behaviour is unchanged. */
    fun dispatch(event: NotificationEvent, applyOrganizationChannelSettings: Boolean = true) {
        val enabled = if (applyOrganizationChannelSettings) enabledChannels(event) else event.channels
        if (NotificationChannel.IN_APP in enabled) {
            val recipientUserId = requireNotNull(event.recipientUserId) { "Notification recipient is required" }
            notifications.createNotification(event.organizationId, recipientUserId,
                event.eventType, event.title, event.message, event.context)
        }
        val external = enabled - NotificationChannel.IN_APP
        if (external.isNotEmpty()) externalPublisher.publish(event, external)
    }

    private fun enabledChannels(event: NotificationEvent): Set<NotificationChannel> {
        val settings = event.organizationId?.let(sql::settings) ?: return event.channels
        return event.channels.filterTo(linkedSetOf()) { channel -> when (channel) {
            NotificationChannel.IN_APP -> settings.inAppEnabled
            NotificationChannel.EMAIL -> settings.emailEnabled
            NotificationChannel.WHATSAPP -> settings.whatsappEnabled
            NotificationChannel.SMS -> settings.smsEnabled
            NotificationChannel.PUSH -> settings.pushEnabled
        } }
    }

    /** Call only with the envelope returned by a committed, on-demand business SQL call. */
    fun afterConfiguredCommit(envelope: String): String? {
        val value = Json.parseToJsonElement(envelope).jsonObject
        val result = value.string("result")
        try {
            (value["deliveries"] as? JsonArray).orEmpty().forEach { entry ->
                val row = entry.jsonObject
                val id = row.string("deliveryId") ?: return@forEach
                if (row.string("status") != "PREPARED") return@forEach
                try {
                    when (row.string("channel")) {
                        "IN_APP" -> materialize(id)
                        "WHATSAPP" -> publish(id)
                    }
                } catch (_: Exception) {
                    // Do not log exception details: provider or database errors may include PII.
                    logger.warn("Configured notification processing failed; deliveryId={}", id)
                }
            }
        } catch (_: Exception) {
            logger.warn("Configured notification envelope processing failed")
        }
        return result
    }

    private fun materialize(id: String) {
        val raw = sql.inAppContent(id)
        if (raw == null) {
            sql.finishUnclaimed(id, "SUPPRESSED")
            return
        }
        val data = Json.parseToJsonElement(raw).jsonObject
        val content = try { render(data) } catch (_: Exception) {
            sql.finishUnclaimed(id, "FAILED")
            return
        }
        val context = data["context"]?.takeUnless { it is JsonNull }?.toString()
        sql.materialize(id, content.title, content.message, context)
    }

    private fun publish(id: String) {
        val transport = (externalPublisher as? SnsExternalNotificationPublisher) ?: run { sql.finishUnclaimed(id, "FAILED"); return }
        val raw = sql.claim(id) ?: return
        val data = Json.parseToJsonElement(raw).jsonObject
        val token = requireNotNull(data.string("claimToken"))
        val event = try {
            val content = render(data)
            NotificationEvent(
                eventType = requireNotNull(data.string("eventType")),
                organizationId = requireNotNull(data.string("organizationId")),
                recipientUserId = requireNotNull(data.string("recipientUserId")),
                channels = setOf(NotificationChannel.WHATSAPP),
                title = content.title, message = content.message,
                context = data["context"]?.takeUnless { it is JsonNull }?.toString(),
                whatsapp = NotificationDestination(requireNotNull(data.string("destination"))),
                whatsappTemplate = NotificationTemplate(requireNotNull(data.string("providerTemplate")),
                    requireNotNull(data.string("language")), content.providerParameters),
                correlationId = data.string("eventId"), deliveryId = id
            )
        } catch (_: Exception) {
            sql.recordPublication(id, token, "FAILED", null)
            return
        }
        val receipt = try { transport.publishWithReceipt(event, event.channels) } catch (_: Exception) {
            // A transport exception is not proof that SNS rejected the submission.
            sql.recordPublication(id, token, "AMBIGUOUS", null)
            return
        }
        if (!sql.recordPublication(id, token, "PUBLISHED", receipt)) {
            logger.warn("Configured notification publication receipt not recorded; deliveryId={}", id)
        }
    }

    private fun render(data: JsonObject): RenderedNotificationContent {
        val allowed = data.getValue("allowedParameters").jsonArray.map { it.jsonPrimitive.content }.toSet()
        val parameters = data.getValue("parameters").jsonObject.mapValues { it.value.jsonPrimitive.content }
        return NotificationTemplateRenderer.render(NotificationContentTemplate(
            requireNotNull(data.string("title")), requireNotNull(data.string("message")), allowed,
            data.getValue("parameterNames").jsonArray.map { it.jsonPrimitive.content }
        ), parameters)
    }

    private fun JsonObject.string(key: String): String? = (get(key) as? JsonPrimitive)?.contentOrNull
}
