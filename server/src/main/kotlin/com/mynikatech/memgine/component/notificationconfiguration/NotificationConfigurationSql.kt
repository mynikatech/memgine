package com.mynikatech.memgine.component.notificationconfiguration

import com.mynikatech.memgine.net.dto.NotificationConfigurationDto
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.customizer.BindBean
import org.jdbi.v3.sqlobject.statement.SqlQuery

data class NotificationConfigurationSqlParams(
    val organizationId: String, val configurationName: String,
    val emailEnabled: Boolean, val smsEnabled: Boolean,
    val whatsappEnabled: Boolean, val pushEnabled: Boolean,
    val inAppEnabled: Boolean, val notificationStatusId: String,
    val versionNo: Int, val actorUserId: String
)

interface NotificationConfigurationSql {
    @SqlQuery("SELECT can_administer_organization(:organizationId, :actorUserId)")
    fun canAdminister(@Bind("organizationId") organizationId: String,
                      @Bind("actorUserId") actorUserId: String): Boolean

    @SqlQuery("SELECT * FROM get_organization_notification_configuration(:organizationId, :actorUserId)")
    fun get(@Bind("organizationId") organizationId: String,
            @Bind("actorUserId") actorUserId: String): NotificationConfigurationDto?

    @SqlQuery("""SELECT save_organization_notification_configuration(
        :organizationId, :configurationName, :emailEnabled, :smsEnabled,
        :whatsappEnabled, :pushEnabled, :inAppEnabled,
        :notificationStatusId, :versionNo, :actorUserId)""")
    fun save(@BindBean params: NotificationConfigurationSqlParams): Boolean
}
