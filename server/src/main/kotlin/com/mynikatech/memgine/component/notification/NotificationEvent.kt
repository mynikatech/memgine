package com.mynikatech.memgine.component.notification

enum class NotificationChannel { IN_APP, EMAIL, WHATSAPP, SMS, PUSH }

data class NotificationDestination(val address: String, val displayName: String? = null)
data class NotificationTemplate(val name: String, val languageCode: String = "en", val parameters: List<String> = emptyList(), val buttonParameter: String? = null)

data class NotificationEvent(
    val eventType: String,
    val organizationId: String? = null,
    val recipientUserId: String,
    val channels: Set<NotificationChannel> = setOf(NotificationChannel.IN_APP),
    val title: String,
    val message: String,
    val context: String? = null,
    val email: NotificationDestination? = null,
    val whatsapp: NotificationDestination? = null,
    val whatsappTemplate: NotificationTemplate? = null,
    val sms: NotificationDestination? = null,
    val correlationId: String? = null
)
