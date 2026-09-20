package com.mynikatech.memgine.lambda.email

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class SnsEnvelope(@SerialName("Message") val message: String)
@Serializable data class NotificationDestinationTransport(val address: String, val displayName: String? = null)
@Serializable data class NotificationEventTransport(
    val eventType: String, val organizationId: String? = null, val recipientUserId: String,
    val channels: Set<String>, val title: String, val message: String,
    val context: String? = null, val email: NotificationDestinationTransport? = null,
    val whatsapp: NotificationDestinationTransport? = null, val sms: NotificationDestinationTransport? = null,
    val correlationId: String? = null
)
