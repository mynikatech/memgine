package com.mynikatech.memgine.component.notification

import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class NotificationChannelSettings(
    var emailEnabled: Boolean = true, var smsEnabled: Boolean = true,
    var whatsappEnabled: Boolean = true, var pushEnabled: Boolean = true,
    var inAppEnabled: Boolean = true
)

interface NotificationDispatchSql {
    @SqlQuery("SELECT * FROM get_notification_channel_settings(:organizationId)")
    @RegisterBeanMapper(NotificationChannelSettings::class)
    fun settings(@Bind("organizationId") organizationId: String): NotificationChannelSettings?
}
