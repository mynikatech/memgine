package com.mynikatech.memgine.component.support

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import org.jdbi.v3.core.Jdbi
import java.time.OffsetDateTime

@Serializable
data class SupportNotificationSettingsDto(
    val whatsappEnabled: Boolean,
    val whatsappConsentGranted: Boolean,
    val emailEnabled: Boolean,
    val emailAvailable: Boolean
)

@Serializable
data class UpdateSupportNotificationSettingsDto(
    val whatsappEnabled: Boolean,
    val emailEnabled: Boolean,
    val whatsappConsent: Boolean? = null
)

class SupportNotificationSettingsService(private val jdbi: Jdbi) {
    fun get(userId: String): SupportNotificationSettingsDto = jdbi.withHandle<SupportNotificationSettingsDto, Exception> { h ->
        h.createQuery("""
            SELECT coalesce(s.whatsapp_enabled,true) whatsapp_enabled,
                   (s.whatsapp_consent_at IS NOT NULL AND s.whatsapp_consent_withdrawn_at IS NULL) consent,
                   coalesce(s.email_opted_in,false) email_enabled,
                   (nullif(btrim(u.primary_email),'') IS NOT NULL) email_available
            FROM "user" u LEFT JOIN support_notification_user_settings s ON s.user_id=u.user_id
            WHERE u.user_id=:id AND NOT u.is_deleted AND u.user_status_id='entity-status-user-active'
        """.trimIndent()).bind("id", userId).map { rs, _ ->
            SupportNotificationSettingsDto(rs.getBoolean("whatsapp_enabled"), rs.getBoolean("consent"), rs.getBoolean("email_enabled"), rs.getBoolean("email_available"))
        }.findOne().orElseThrow { BadRequestException("Active user not found") }
    }

    fun update(userId: String, input: UpdateSupportNotificationSettingsDto): SupportNotificationSettingsDto {
        jdbi.useTransaction<Exception> { h ->
            val available = h.createQuery("""
                SELECT (nullif(btrim(primary_email),'') IS NOT NULL) FROM "user"
                WHERE user_id=:id AND NOT is_deleted AND user_status_id='entity-status-user-active'
                FOR UPDATE
            """.trimIndent()).bind("id",userId).mapTo(Boolean::class.java).findOne()
                .orElseThrow { BadRequestException("Active user not found") }
            if (input.emailEnabled && !available) throw BadRequestException("Add an email address before enabling email notifications")
            // A separate affirmative action is required to grant consent; enabling preference is insufficient.
            val grant = input.whatsappConsent == true && input.whatsappEnabled
            val withdraw = input.whatsappConsent == false || !input.whatsappEnabled
            h.createUpdate("""
                INSERT INTO support_notification_user_settings
                    (user_id, delivery_mode, whatsapp_enabled, whatsapp_opted_in, email_opted_in, whatsapp_consent_at, whatsapp_consent_withdrawn_at)
                VALUES (:id,'DEFAULT',:enabled,:grant,:email,
                    CASE WHEN :grant THEN CURRENT_TIMESTAMP ELSE NULL END,
                    CASE WHEN :withdraw THEN CURRENT_TIMESTAMP ELSE NULL END)
                ON CONFLICT (user_id) DO UPDATE SET
                    whatsapp_enabled=EXCLUDED.whatsapp_enabled,
                    email_opted_in=EXCLUDED.email_opted_in,
                    whatsapp_opted_in=CASE WHEN :grant THEN true WHEN :withdraw THEN false ELSE support_notification_user_settings.whatsapp_opted_in END,
                    whatsapp_consent_at=CASE WHEN :grant THEN CURRENT_TIMESTAMP ELSE support_notification_user_settings.whatsapp_consent_at END,
                    whatsapp_consent_withdrawn_at=CASE WHEN :grant THEN NULL WHEN :withdraw THEN CURRENT_TIMESTAMP ELSE support_notification_user_settings.whatsapp_consent_withdrawn_at END,
                    updated_at=CURRENT_TIMESTAMP
            """.trimIndent()).bind("id",userId).bind("enabled",input.whatsappEnabled)
                .bind("email",input.emailEnabled).bind("grant",grant).bind("withdraw",withdraw).execute()
        }
        return get(userId)
    }
}

fun Route.supportNotificationSettingsRoutes(service: SupportNotificationSettingsService) {
    route("/customer/support-notification-settings") {
        get { call.respond(ApiResponse.success(service.get(call.authenticatedPrincipal().userId),call.callId)) }
        put { call.respond(ApiResponse.success(service.update(call.authenticatedPrincipal().userId,call.receive<UpdateSupportNotificationSettingsDto>()),call.callId)) }
    }
}
