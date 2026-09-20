package com.mynikatech.memgine.component.notification

import org.slf4j.LoggerFactory

interface ExternalNotificationPublisher { fun publish(event: NotificationEvent, channels: Set<NotificationChannel>) }

/** Deliberately does not claim delivery until a provider is introduced. */
class NoopExternalNotificationPublisher : ExternalNotificationPublisher {
    private val logger = LoggerFactory.getLogger(javaClass)
    override fun publish(event: NotificationEvent, channels: Set<NotificationChannel>) {
        logger.info("External notification deferred: eventType={}, recipientUserId={}, channels={}",
            event.eventType, event.recipientUserId, channels.map { it.name })
    }
}
