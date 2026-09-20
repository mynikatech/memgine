package com.mynikatech.memgine.lambda.email

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.SQSEvent
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory

class EmailProcessorHandler(private val sender: EmailSender = EmailSenderFactory.create()) : RequestHandler<SQSEvent, Unit> {
    private val json = Json { ignoreUnknownKeys = true }
    private val log = LoggerFactory.getLogger(javaClass)
    override fun handleRequest(event: SQSEvent, context: Context) {
        event.records.forEach { record ->
            val sns = json.decodeFromString<SnsEnvelope>(record.body)
            val notification = json.decodeFromString<NotificationEventTransport>(sns.message)
            if ("EMAIL" !in notification.channels) return@forEach
            val destination = notification.email?.address?.trim().takeUnless { it.isNullOrEmpty() }
                ?: throw IllegalArgumentException("EMAIL notification has no destination")
            log.info("Processing email notification: eventType={}, correlationId={}", notification.eventType, notification.correlationId)
            val (subject, html) = render(notification)
            sender.send(destination, subject, html)
        }
    }
    private fun render(event: NotificationEventTransport): Pair<String, String> =
        escape(event.title) to "<html><body><h1>${escape(event.title)}</h1><p>${escape(event.message)}</p></body></html>"
    private fun escape(value: String): String = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
}
