package com.mynikatech.memgine.component.notification

import org.slf4j.LoggerFactory
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import software.amazon.awssdk.services.sns.SnsClient
import software.amazon.awssdk.services.sns.model.PublishRequest

interface ExternalNotificationPublisher { fun publish(event: NotificationEvent, channels: Set<NotificationChannel>) }

/** Deliberately does not claim delivery until a provider is introduced. */
class NoopExternalNotificationPublisher : ExternalNotificationPublisher {
    private val logger = LoggerFactory.getLogger(javaClass)
    override fun publish(event: NotificationEvent, channels: Set<NotificationChannel>) {
        logger.info("External notification deferred: eventType={}, recipientUserId={}, channels={}",
            event.eventType, event.recipientUserId, channels.map { it.name })
    }
}

class SnsExternalNotificationPublisher(
    private val topicArn: String,
    private val client: SnsClient = SnsClient.create(),
    private val json: Json = Json { encodeDefaults = true }
) : ExternalNotificationPublisher {
    override fun publish(event: NotificationEvent, channels: Set<NotificationChannel>) {
        val payload = SnsNotificationEvent(
            event.eventType, event.organizationId, event.recipientUserId.orEmpty(), channels.map { it.name }.toSet(),
            event.title, event.message, event.context,
            event.email?.let { SnsDestination(it.address, it.displayName) },
            event.whatsapp?.let { SnsDestination(it.address, it.displayName) },
            event.whatsappTemplate?.let { SnsTemplate(it.name, it.languageCode, it.parameters, it.buttonParameter) },
            event.sms?.let { SnsDestination(it.address, it.displayName) }, event.correlationId
        )
        client.publish(PublishRequest.builder().topicArn(topicArn).message(json.encodeToString(payload)).build())
    }
}

class UnavailableExternalNotificationPublisher : ExternalNotificationPublisher {
    override fun publish(event: NotificationEvent, channels: Set<NotificationChannel>) {
        throw IllegalStateException("External notification publishing is not configured")
    }
}

@Serializable private data class SnsDestination(val address: String, val displayName: String? = null)
@Serializable private data class SnsTemplate(val name: String, val languageCode: String = "en", val parameters: List<String> = emptyList(), val buttonParameter: String? = null)
@Serializable private data class SnsNotificationEvent(
    val eventType: String, val organizationId: String?, val recipientUserId: String, val channels: Set<String>,
    val title: String, val message: String, val context: String?, val email: SnsDestination?,
    val whatsapp: SnsDestination?, val whatsappTemplate: SnsTemplate?, val sms: SnsDestination?, val correlationId: String?
)
