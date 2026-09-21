package com.mynikatech.memgine.lambda.sms

import software.amazon.awssdk.services.pinpointsmsvoicev2.PinpointSmsVoiceV2Client
import software.amazon.awssdk.services.pinpointsmsvoicev2.model.MessageType
import software.amazon.awssdk.services.pinpointsmsvoicev2.model.PinpointSmsVoiceV2Exception
import software.amazon.awssdk.services.pinpointsmsvoicev2.model.SendTextMessageRequest

class AwsEndUserMessagingSmsSender(
    private val client: PinpointSmsVoiceV2Client = PinpointSmsVoiceV2Client.create(),
    private val messageType: MessageType = configuredMessageType(),
    private val originationIdentity: String? = environmentValue("SMS_ORIGINATION_IDENTITY"),
    private val configurationSetName: String? = environmentValue("SMS_CONFIGURATION_SET_NAME"),
    private val maxPrice: String? = environmentValue("SMS_MAX_PRICE")
) : SmsSender {
    override fun send(to: String, message: String): SmsSendResult {
        if (to.isBlank() || message.isBlank()) {
            throw NonRetryableSmsException(reason = "invalid-message-input")
        }

        val request = SendTextMessageRequest.builder()
            .destinationPhoneNumber(to)
            .messageBody(message)
            .messageType(messageType)
            .apply {
                originationIdentity?.let(::originationIdentity)
                configurationSetName?.let(::configurationSetName)
                maxPrice?.let(::maxPrice)
            }
            .build()

        try {
            return SmsSendResult(client.sendTextMessage(request).messageId())
        } catch (error: PinpointSmsVoiceV2Exception) {
            val status = error.statusCode()
            if (status in 400..499 && status != 429) {
                throw NonRetryableSmsException(
                    status = status,
                    providerErrorCode = error.awsErrorDetails()?.errorCode()
                )
            }
            throw error
        }
    }

    private companion object {
        fun configuredMessageType(): MessageType = when (
            (System.getenv("SMS_MESSAGE_TYPE") ?: "TRANSACTIONAL").trim().uppercase()
        ) {
            "TRANSACTIONAL" -> MessageType.TRANSACTIONAL
            "PROMOTIONAL" -> MessageType.PROMOTIONAL
            else -> throw NonRetryableSmsException(reason = "unsupported-message-type")
        }

        fun environmentValue(name: String): String? = System.getenv(name)?.trim()?.takeIf { it.isNotEmpty() }
    }
}
