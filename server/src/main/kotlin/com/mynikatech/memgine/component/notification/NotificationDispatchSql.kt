package com.mynikatech.memgine.component.notification

import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper

data class NotificationChannelSettings(
    var emailEnabled: Boolean = true, var smsEnabled: Boolean = true,
    var whatsappEnabled: Boolean = true, var pushEnabled: Boolean = true,
    var inAppEnabled: Boolean = true
)

/** Shared legacy and configured notification database contracts. */
interface NotificationDispatchSql {
    @SqlQuery("SELECT * FROM get_notification_channel_settings(:organizationId)")
    @RegisterBeanMapper(NotificationChannelSettings::class)
    fun settings(@Bind("organizationId") organizationId: String): NotificationChannelSettings?

    @SqlQuery("SELECT get_prepared_notification_content(:id)::text")
    fun inAppContent(@Bind("id") id: String): String?

    @SqlQuery("SELECT materialize_in_app_notification(:id,:title,:message,CAST(:context AS jsonb))")
    fun materialize(@Bind("id") id: String, @Bind("title") title: String, @Bind("message") message: String,
        @Bind("context") context: String?): Boolean

    @SqlQuery("SELECT finish_unclaimed_notification_delivery(:id,:outcome)")
    fun finishUnclaimed(@Bind("id") id: String, @Bind("outcome") outcome: String): Boolean

    @SqlQuery("SELECT claim_notification_delivery(:id)::text")
    fun claim(@Bind("id") id: String): String?

    @SqlQuery("SELECT record_notification_publication(:id,CAST(:token AS uuid),:outcome,:submission)")
    fun recordPublication(@Bind("id") id: String, @Bind("token") token: String,
        @Bind("outcome") outcome: String, @Bind("submission") submission: String?): Boolean

    @SqlQuery("SELECT acknowledge_notification_delivery(:id,:message,:correlation)")
    fun acknowledge(@Bind("id") id: String, @Bind("message") message: String,
        @Bind("correlation") correlation: String?): Boolean
}
