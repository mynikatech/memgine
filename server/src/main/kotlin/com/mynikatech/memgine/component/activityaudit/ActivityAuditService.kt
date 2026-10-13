package com.mynikatech.memgine.component.activityaudit

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.security.AuthenticatedPrincipal
import org.slf4j.LoggerFactory
import java.util.UUID

object ActivityEventType {
    const val LOGIN_SUCCESS = "LOGIN_SUCCESS"
    const val BUY_MEMBERSHIP_CLICKED = "BUY_MEMBERSHIP_CLICKED"
    const val COUNTER_SELL_MEMBERSHIP_CLICKED = "COUNTER_SELL_MEMBERSHIP_CLICKED"
    const val COUNTER_REDEEM_CLICKED = "COUNTER_REDEEM_CLICKED"
    const val REDEMPTION_QR_GENERATED = "REDEMPTION_QR_GENERATED"
    const val PURCHASE_COMPLETED = "PURCHASE_COMPLETED"
    const val REDEMPTION_COMPLETED = "REDEMPTION_COMPLETED"

    val all = setOf(LOGIN_SUCCESS, BUY_MEMBERSHIP_CLICKED, COUNTER_SELL_MEMBERSHIP_CLICKED,
        COUNTER_REDEEM_CLICKED, REDEMPTION_QR_GENERATED, PURCHASE_COMPLETED, REDEMPTION_COMPLETED)
    val frontend = setOf(BUY_MEMBERSHIP_CLICKED, COUNTER_SELL_MEMBERSHIP_CLICKED, COUNTER_REDEEM_CLICKED)
}

data class ActivityAuditEvent(
    val eventType: String,
    val actorUserId: String? = null,
    val actorRole: String? = null,
    val organizationId: String? = null,
    val storeId: String? = null,
    val staffId: String? = null,
    val customerUserId: String? = null,
    val membershipProductId: String? = null,
    val subscriptionId: String? = null,
    val transactionId: String? = null,
    val platform: String = "UNKNOWN",
    val source: String,
    val deduplicationKey: String? = null
)

class ActivityAuditService(private val sql: ActivityAuditSql) {
    private val logger = LoggerFactory.getLogger(ActivityAuditService::class.java)

    fun record(event: ActivityAuditEvent) {
        if (event.eventType !in ActivityEventType.all) return
        try {
            sql.insert(UUID.randomUUID().toString(), event.eventType, event.actorUserId,
                event.actorRole, event.organizationId, event.storeId, event.staffId,
                event.customerUserId, event.membershipProductId, event.subscriptionId,
                event.transactionId, event.platform, event.source, "{}", event.deduplicationKey)
        } catch (error: Exception) {
            logger.warn("Activity audit recording failed for eventType={}", event.eventType)
        }
    }

    fun recordFrontend(principal: AuthenticatedPrincipal, request: ActivityAuditEventRequest) {
        if (request.eventType !in ActivityEventType.frontend) {
            throw BadRequestException("Unsupported activity event")
        }
        val organizationId = request.organizationId?.takeIf(::validId)
            ?: throw BadRequestException("Organization id is required")
        if (request.platform !in setOf("WEB", "ANDROID", "IOS", "UNKNOWN")) {
            throw BadRequestException("Invalid activity platform")
        }
        val counterEvent = request.eventType != ActivityEventType.BUY_MEMBERSHIP_CLICKED
        if (counterEvent) {
            val storeId = request.storeId?.takeIf(::validId)
                ?: throw BadRequestException("Store id is required")
            val staffId = request.staffId?.takeIf(::validId)
                ?: throw BadRequestException("Staff id is required")
            principal.posContext?.let { context ->
                if (context.organizationId != organizationId ||
                    context.storeId != storeId ||
                    context.staffId != staffId) {
                    throw ForbiddenException("Fixed POS context does not match this Counter operation")
                }
            }
            if (!sql.canOperate(organizationId, storeId, staffId, principal.userId)) {
                throw ForbiddenException("Staff is not active at this store")
            }
        } else if (!sql.organizationExists(organizationId)) {
            throw BadRequestException("Organization is unavailable")
        }
        record(ActivityAuditEvent(request.eventType, principal.userId,
            if (counterEvent) "COUNTER_STAFF" else roleFor(principal, organizationId),
            organizationId, request.storeId, request.staffId,
            membershipProductId = request.membershipProductId,
            subscriptionId = request.subscriptionId, platform = request.platform,
            source = if (counterEvent) "COUNTER" else "CUSTOMER"))
    }

    fun roleFor(principal: AuthenticatedPrincipal, organizationId: String?): String = when {
        principal.posContext != null -> "COUNTER_STAFF"
        principal.has("PLATFORM_ADMIN_ACCESS") -> "PLATFORM_ADMIN"
        principal.has("ORG_ADMIN_ACCESS", organizationId) || principal.has("BUSINESS_OWNER_ACCESS", organizationId) -> "ORG_ADMIN"
        else -> "CUSTOMER"
    }

    fun recordLogin(principal: AuthenticatedPrincipal) {
        val role = roleFor(principal, principal.posContext?.organizationId)
        record(ActivityAuditEvent(ActivityEventType.LOGIN_SUCCESS, principal.userId,
            role,
            principal.posContext?.organizationId, principal.posContext?.storeId,
            principal.posContext?.staffId, platform = "UNKNOWN",
            source = when (role) {
                "COUNTER_STAFF" -> "COUNTER"
                "PLATFORM_ADMIN" -> "PLATFORM_ADMIN"
                "ORG_ADMIN" -> "ORG_ADMIN"
                else -> "CUSTOMER"
            }))
    }

    private fun validId(value: String): Boolean = value.isNotBlank() && value.length <= 64
}
