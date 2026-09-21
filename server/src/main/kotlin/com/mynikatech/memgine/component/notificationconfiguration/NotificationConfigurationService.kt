package com.mynikatech.memgine.component.notificationconfiguration

import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.net.dto.NotificationConfigurationDto
import com.mynikatech.memgine.net.dto.NotificationConfigurationWriteDto
import org.jdbi.v3.core.Jdbi
import org.postgresql.util.PSQLException

class NotificationConfigurationService(private val jdbi: Jdbi) {
    fun get(organizationId: String, actorUserId: String): NotificationConfigurationDto? {
        requireAdmin(organizationId, actorUserId)
        return jdbi.onDemand(NotificationConfigurationSql::class.java).get(organizationId, actorUserId)
    }

    fun save(organizationId: String, request: NotificationConfigurationWriteDto, actorUserId: String): NotificationConfigurationDto {
        requireAdmin(organizationId, actorUserId)
        if (request.configurationName.isBlank() || request.configurationName.length > 100 ||
            request.notificationStatusId.isBlank() || request.versionNo < 1) {
            throw BadRequestException("Invalid Notification Configuration fields")
        }
        try {
            jdbi.onDemand(NotificationConfigurationSql::class.java).save(
                NotificationConfigurationSqlParams(
                    organizationId, request.configurationName.trim(), request.emailEnabled,
                    request.smsEnabled, request.whatsappEnabled, request.pushEnabled,
                    request.inAppEnabled, request.otpDeliveryChannel, request.notificationStatusId,
                    request.versionNo, actorUserId
                )
            )
        } catch (error: Exception) {
            translate(error)
        }
        return get(organizationId, actorUserId) ?: throw IllegalStateException("Notification Configuration missing after save")
    }

    private fun requireAdmin(organizationId: String, actorUserId: String) {
        if (organizationId.isBlank() || organizationId.length > 40) throw BadRequestException("Invalid organization id")
        if (!jdbi.onDemand(NotificationConfigurationSql::class.java)
                .canAdminister(organizationId, actorUserId)) {
            throw ForbiddenException("Organization access denied")
        }
    }

    private fun translate(error: Exception): Nothing {
        if (error is ApiException) throw error
        var cause: Throwable? = error
        while (cause != null) {
            if (cause is PSQLException) {
                when (cause.sqlState) {
                    "23505", "40001" -> throw ConflictException("Notification Configuration changed since load")
                    "22001", "22023", "23502", "23503", "23514" ->
                        throw BadRequestException("Invalid Notification Configuration")
                    "42501" -> throw ForbiddenException("Organization access denied")
                }
            }
            cause = cause.cause
        }
        throw error
    }
}
