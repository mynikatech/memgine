package com.mynikatech.memgine.component.redemption

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import kotlinx.serialization.Serializable
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.postgresql.util.PSQLException
import java.util.UUID

@Serializable
data class RedemptionResolutionRequest(
    val redemptionTransactionItemId: String,
    val action: String,
    val reasonCode: String,
    val explanation: String,
    val idempotencyKey: String,
    val supportRequestId: String? = null
)

@Serializable
data class RedemptionResolutionResult(
    var resolutionId: String = "",
    var actionStatus: String = "",
    var paymentRefundId: String? = null
)

@Serializable
data class RedemptionResolutionCandidate(
    var itemId: String = "",
    var transactionId: String = "",
    var itemType: String = "",
    var itemName: String = "",
    var subscriptionId: String = "",
    var redemptionNumber: String = "",
    var itemStatus: String = "",
    var resolutionId: String? = null,
    var actionStatus: String? = null,
    var commerceTransactionId: String? = null,
    var paymentAmountMinor: Long? = null,
    var currencyCode: String? = null,
    var customerUserId: String = "",
    var customerName: String = "",
    var customerEmail: String? = null,
    var customerPhone: String? = null,
    var subscriptionNumber: String = "",
    var redeemedAt: String = "",
    var storeName: String? = null,
    var staffName: String? = null,
    var paymentStatus: String? = null
)

interface RedemptionResolutionSql {
    @SqlQuery("SELECT * FROM redemption_resolution_candidates(:org,:actor)")
    @RegisterBeanMapper(RedemptionResolutionCandidate::class)
    fun candidates(@Bind("org") org: String, @Bind("actor") actor: String): List<RedemptionResolutionCandidate>

    @SqlQuery("SELECT * FROM redemption_resolution_request(:id,:org,:item,:action,:reason,:explanation,:key,:actor,:refund,:support)")
    @RegisterBeanMapper(RedemptionResolutionResult::class)
    fun request(
        @Bind("id") id: String,
        @Bind("org") org: String,
        @Bind("item") item: String,
        @Bind("action") action: String,
        @Bind("reason") reason: String,
        @Bind("explanation") explanation: String,
        @Bind("key") key: String,
        @Bind("actor") actor: String,
        @Bind("refund") refund: String?,
        @Bind("support") support: String?
    ): RedemptionResolutionResult?

    @SqlQuery("SELECT redemption_resolution_complete(:org,:id,:actor)")
    fun complete(@Bind("org") org: String, @Bind("id") id: String, @Bind("actor") actor: String): String

    @SqlQuery("SELECT action_code,action_status,payment_refund_id FROM redemption_resolution_detail(:org,:id,:actor)")
    @RegisterBeanMapper(RedemptionResolutionDetail::class)
    fun detail(@Bind("org") org: String, @Bind("id") id: String, @Bind("actor") actor: String): RedemptionResolutionDetail?
}

@Serializable
data class RedemptionResolutionDetail(
    var actionCode: String = "",
    var actionStatus: String = "",
    var paymentRefundId: String? = null
)

class RedemptionResolutionService(private val sql: RedemptionResolutionSql) {
    fun candidates(org: String, actor: String): List<RedemptionResolutionCandidate> = dbErrors {
        sql.candidates(org, actor)
    }

    fun request(org: String, request: RedemptionResolutionRequest, actor: String): RedemptionResolutionResult {
        if (org.isBlank() || request.redemptionTransactionItemId.isBlank() ||
            request.action !in setOf("RESTORE_ONLY", "REFUND_ONLY", "REFUND_AND_RESTORE") ||
            request.idempotencyKey.isBlank() || request.idempotencyKey.length > 160 ||
            request.reasonCode.isBlank() || request.explanation.trim().length < 10 ||
            request.explanation.length > 500) {
            throw BadRequestException("A valid redemption item, resolution action, idempotency key and explanation are required")
        }
        return dbErrors {
            val refundId = if (request.action == "RESTORE_ONLY") null else "PRF_${UUID.randomUUID()}"
            val created = sql.request("RRS_${UUID.randomUUID()}", org,
                request.redemptionTransactionItemId, request.action, request.reasonCode,
                request.explanation.trim(), request.idempotencyKey, actor, refundId,
                request.supportRequestId)
                ?: throw BadRequestException("Redemption resolution could not be created")
            if (request.action == "RESTORE_ONLY" && created.actionStatus != "COMPLETED") {
                val status = sql.complete(org, created.resolutionId, actor)
                created.copy(actionStatus = status)
            } else created
        }
    }

    fun detail(org: String, id: String, actor: String): RedemptionResolutionDetail = dbErrors {
        sql.detail(org, id, actor) ?: throw BadRequestException("Redemption resolution was not found")
    }

    // No payment calls here. For REFUND_AND_RESTORE, this verifies the refund's
    // SUCCEEDED ledger state inside SQL before changing consumption.
    fun complete(org: String, id: String, actor: String): String = dbErrors {
        sql.complete(org, id, actor)
    }

    private fun <T> dbErrors(action: () -> T): T = try { action() } catch (error: Exception) {
        val pg = generateSequence<Throwable>(error) { it.cause }.filterIsInstance<PSQLException>().firstOrNull()
        when (pg?.sqlState) {
            "42501" -> throw ForbiddenException("Redemption resolution is not permitted")
            "23505" -> throw ConflictException("A conflicting resolution or duplicate request already exists")
            "22023", "23514", "P0002" -> throw BadRequestException(
                "Redemption resolution is not eligible or requires investigation. Review the item, provider payment and status configuration.")
            else -> throw error
        }
    }
}
