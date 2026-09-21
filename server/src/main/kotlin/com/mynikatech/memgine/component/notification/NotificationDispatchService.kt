package com.mynikatech.memgine.component.notification

class NotificationDispatchService(
    private val sql: NotificationDispatchSql,
    private val notifications: NotificationService,
    private val externalPublisher: ExternalNotificationPublisher
) {
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
}
