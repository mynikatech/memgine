package com.mynikatech.memgine.lambda.sms

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.SQSEvent
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory

class SmsProcessorHandler(
    private val sender: SmsSender = SmsSenderFactory.create()
) : RequestHandler<SQSEvent, Unit> {
    private val json = Json { ignoreUnknownKeys = true }
    private val log = LoggerFactory.getLogger(javaClass)

    override fun handleRequest(event: SQSEvent, context: Context) {
        event.records.forEach { record ->
            try {
                val sns = json.decodeFromString<SnsEnvelope>(record.body)
                val notification = json.decodeFromString<NotificationEventTransport>(sns.message)
                if ("SMS" !in notification.channels) {
                    return@forEach
                }

                val destination = notification.sms?.address?.trim()
                    ?.takeIf { it.length >= 7 }
                    ?: throw NonRetryableSmsException(reason = "missing-or-invalid-destination")

                log.info(
                    "Processing SMS notification: eventType={}, correlationId={}",
                    notification.eventType,
                    notification.correlationId
                )
                val result = sender.send(destination, notification.message)
                log.info(
                    "SMS notification delivered: eventType={}, correlationId={}, messageId={}",
                    notification.eventType,
                    notification.correlationId,
                    result.messageId
                )
            } catch (error: NonRetryableSmsException) {
                log.warn(
                    "Non-retryable SMS provider response: status={}, providerErrorCode={}",
                    error.status,
                    error.providerErrorCode
                )
            }
        }
    }
}
