package com.mynikatech.memgine.component.receipt

import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery

/**
 * Read-only access to immutable receipt snapshots.  Rendering is deliberately
 * a client concern: no endpoint re-prices a historic transaction.
 */
@Serializable
data class TransactionReceiptRow(
    var transactionReceiptId: String = "",
    var receiptNumber: String = "",
    var organizationId: String = "",
    var storeId: String? = null,
    var customerUserId: String? = null,
    var receiptKind: String = "",
    var sourceTransactionId: String = "",
    var currencyCode: String = "",
    var subtotalMinor: Long = 0,
    var discountMinor: Long = 0,
    var taxMinor: Long = 0,
    var totalMinor: Long = 0,
    var paymentMethod: String? = null,
    var providerReference: String? = null,
    var receiptSnapshot: String = "{}",
    var issuedAt: String = "",
    var actualSavings: TransactionActualSavings? = null
)

/** A ledger row is intentionally available even when no immutable receipt exists. */
@Serializable
data class TransactionHistoryRow(
    var transactionId: String = "",
    var transactionNumber: String = "",
    var organizationId: String = "",
    var organizationName: String = "",
    var storeId: String? = null,
    var storeName: String? = null,
    var customerUserId: String? = null,
    var customerDisplayName: String? = null,
    var transactionType: String = "",
    var status: String = "",
    var paymentMethod: String? = null,
    var currencyCode: String = "",
    var totalMinor: Long = 0,
    var occurredAt: String = "",
    var receiptId: String? = null,
    var receiptNumber: String? = null,
    var receiptAvailable: Boolean = false,
    var refundStatus: String? = null,
    var actualSavings: TransactionActualSavings? = null,
    var subscriptionId: String? = null,
    var itemDescription: String? = null,
    var canonicalOrderId: String? = null
)

@Serializable
data class TransactionActualSavings(
    var transactionId: String = "",
    var subscriptionId: String? = null,
    var redemptionTransactionId: String? = null,
    var currencyCode: String? = null,
    var originalDiscountMinor: Long? = null,
    var reversalMinor: Long? = null,
    var netSavingsMinor: Long? = null,
    var verificationState: String = "",
    var completedAt: String? = null
)

@Serializable
data class SubscriptionActualSavings(
    var subscriptionId: String = "",
    var currencyCode: String? = null,
    var netSavingsMinor: Long? = null,
    var verifiedNetSavingsMinor: Long? = null,
    var verifiedRedemptionCount: Long = 0,
    var unverifiedRedemptionCount: Long = 0,
    var unattributedHistoryCount: Long = 0,
    var coverageState: String = ""
)

interface TransactionReceiptSql {
    @SqlQuery("SELECT * FROM get_customer_transaction_actual_savings(:customerUserId, :transactionIds)")
    @RegisterBeanMapper(TransactionActualSavings::class)
    fun customerActualSavings(
        @Bind("customerUserId") customerUserId: String,
        @Bind("transactionIds") transactionIds: Array<String>
    ): List<TransactionActualSavings>

    @SqlQuery("SELECT * FROM get_customer_subscription_actual_savings(:customerUserId, :organizationId, :subscriptionId)")
    @RegisterBeanMapper(SubscriptionActualSavings::class)
    fun subscriptionActualSavings(
        @Bind("customerUserId") customerUserId: String,
        @Bind("organizationId") organizationId: String,
        @Bind("subscriptionId") subscriptionId: String
    ): List<SubscriptionActualSavings>

    @SqlQuery("""
      SELECT * FROM receipt_customer_transaction_history(:customerUserId, :organizationId, :status, :transactionType, :search, :limit, :offset)
    """)
    @RegisterBeanMapper(TransactionHistoryRow::class)
    fun customerTransactionHistory(@Bind("customerUserId") customerUserId: String,
        @Bind("organizationId") organizationId: String?, @Bind("status") status: String?,
        @Bind("transactionType") transactionType: String?, @Bind("search") search: String?,
        @Bind("limit") limit: Int, @Bind("offset") offset: Int): List<TransactionHistoryRow>

    @SqlQuery("""
      SELECT * FROM receipt_counter_transaction_history(:organizationId, :storeId, :staffId, :actorUserId, :customerUserId, :status, :transactionType, :paymentMethod, :search, :limit, :offset)
    """)
    @RegisterBeanMapper(TransactionHistoryRow::class)
    fun counterTransactionHistory(@Bind("organizationId") organizationId: String, @Bind("storeId") storeId: String,
        @Bind("staffId") staffId: String, @Bind("actorUserId") actorUserId: String, @Bind("customerUserId") customerUserId: String?,
        @Bind("status") status: String?, @Bind("transactionType") transactionType: String?, @Bind("paymentMethod") paymentMethod: String?,
        @Bind("search") search: String?, @Bind("limit") limit: Int, @Bind("offset") offset: Int): List<TransactionHistoryRow>
    @SqlQuery("""
        SELECT transaction_receipt_id,receipt_number,organization_id,store_id,customer_user_id,
          receipt_kind,source_transaction_id,currency_code,subtotal_minor,discount_minor,tax_minor,
          total_minor,payment_method,provider_reference,receipt_snapshot::text,issued_at::text
        FROM transaction_receipts
        WHERE organization_id=:organizationId AND customer_user_id=:customerUserId
        ORDER BY issued_at DESC,transaction_receipt_id DESC
        LIMIT :limit OFFSET :offset
    """)
    @RegisterBeanMapper(TransactionReceiptRow::class)
    fun customerReceipts(@Bind("organizationId") organizationId: String, @Bind("customerUserId") customerUserId: String,
                         @Bind("limit") limit: Int, @Bind("offset") offset: Int): List<TransactionReceiptRow>

    @SqlQuery("""
        SELECT transaction_receipt_id,receipt_number,organization_id,store_id,customer_user_id,
          receipt_kind,source_transaction_id,currency_code,subtotal_minor,discount_minor,tax_minor,
          total_minor,payment_method,provider_reference,receipt_snapshot::text,issued_at::text
        FROM transaction_receipts
        WHERE transaction_receipt_id=:receiptId AND organization_id=:organizationId
          AND customer_user_id=:customerUserId
    """)
    @RegisterBeanMapper(TransactionReceiptRow::class)
    fun customerReceipt(@Bind("organizationId") organizationId: String, @Bind("customerUserId") customerUserId: String,
                        @Bind("receiptId") receiptId: String): TransactionReceiptRow?

    @SqlQuery("""
        SELECT r.transaction_receipt_id,r.receipt_number,r.organization_id,r.store_id,r.customer_user_id,
          r.receipt_kind,r.source_transaction_id,r.currency_code,r.subtotal_minor,r.discount_minor,r.tax_minor,
          r.total_minor,r.payment_method,r.provider_reference,r.receipt_snapshot::text,r.issued_at::text
        FROM transaction_receipts r
        WHERE r.organization_id=:organizationId AND r.store_id=:storeId
          AND counter_can_operate(:organizationId,:storeId,:staffId,:actorUserId)
        ORDER BY r.issued_at DESC,r.transaction_receipt_id DESC LIMIT :limit OFFSET :offset
    """)
    @RegisterBeanMapper(TransactionReceiptRow::class)
    fun counterReceipts(@Bind("organizationId") organizationId: String, @Bind("storeId") storeId: String,
                        @Bind("staffId") staffId: String, @Bind("actorUserId") actorUserId: String,
                        @Bind("limit") limit: Int, @Bind("offset") offset: Int): List<TransactionReceiptRow>

    @SqlQuery("""
        SELECT r.transaction_receipt_id,r.receipt_number,r.organization_id,r.store_id,r.customer_user_id,
          r.receipt_kind,r.source_transaction_id,r.currency_code,r.subtotal_minor,r.discount_minor,r.tax_minor,
          r.total_minor,r.payment_method,r.provider_reference,r.receipt_snapshot::text,r.issued_at::text
        FROM transaction_receipts r
        WHERE r.transaction_receipt_id=:receiptId AND r.organization_id=:organizationId AND r.store_id=:storeId
          AND counter_can_operate(:organizationId,:storeId,:staffId,:actorUserId)
    """)
    @RegisterBeanMapper(TransactionReceiptRow::class)
    fun counterReceipt(@Bind("organizationId") organizationId: String, @Bind("storeId") storeId: String,
                       @Bind("staffId") staffId: String, @Bind("actorUserId") actorUserId: String,
                       @Bind("receiptId") receiptId: String): TransactionReceiptRow?
}

private fun TransactionReceiptSql.savingsByTransaction(
    customerUserId: String,
    transactionIds: List<String>
): Map<String, TransactionActualSavings> =
    if (transactionIds.isEmpty()) emptyMap()
    else customerActualSavings(customerUserId, transactionIds.distinct().toTypedArray()).associateBy { it.transactionId }

private fun TransactionHistoryRow.isCompletedRedemption(): Boolean =
    transactionType == "COUNTER_REDEMPTION" && status == "COMPLETED"

fun Route.transactionReceiptRoutes(sql: TransactionReceiptSql) {
    get("/customer/transactions") {
        val limit = call.request.queryParameters["limit"]?.toIntOrNull()?.coerceIn(1, 100) ?: 25
        val offset = call.request.queryParameters["offset"]?.toIntOrNull()?.coerceAtLeast(0) ?: 0
        val customerId = call.authenticatedPrincipal().userId
        val history = sql.customerTransactionHistory(
            customerId,
            call.request.queryParameters["organizationId"], call.request.queryParameters["status"],
            call.request.queryParameters["transactionType"], call.request.queryParameters["search"], limit, offset
        )
        // A checkout can complete between the history query and the batch
        // lookup. Do not attach savings to a history row read as pending.
        val savings = sql.savingsByTransaction(
            customerId, history.filter { it.isCompletedRedemption() }.map { it.transactionId }
        )
        call.respond(ApiResponse.success(history.map { row ->
            if (row.isCompletedRedemption()) row.copy(actualSavings = savings[row.transactionId]) else row
        }, call.callId))
    }
    route("/customer/organizations/{organizationId}") {
        get("/transactions") {
            val organizationId = call.parameters["organizationId"] ?: throw NotFoundException("Organization was not found")
            val limit = call.request.queryParameters["limit"]?.toIntOrNull()?.coerceIn(1, 100) ?: 25
            val offset = call.request.queryParameters["offset"]?.toIntOrNull()?.coerceAtLeast(0) ?: 0
            val customerId = call.authenticatedPrincipal().userId
            val receipts = sql.customerReceipts(organizationId, customerId, limit, offset)
            val savings = sql.savingsByTransaction(customerId, receipts.mapNotNull {
                it.sourceTransactionId.takeIf { _ -> it.receiptKind == "COUNTER_REDEMPTION" }
            })
            call.respond(ApiResponse.success(receipts.map {
                it.copy(actualSavings = savings[it.sourceTransactionId].takeIf { _ -> it.receiptKind == "COUNTER_REDEMPTION" })
            }, call.callId))
        }
        get("/receipts/{receiptId}") {
            val customerId = call.authenticatedPrincipal().userId
            val receipt = sql.customerReceipt(
                call.parameters["organizationId"] ?: throw NotFoundException("Organization was not found"),
                customerId,
                call.parameters["receiptId"] ?: throw NotFoundException("Receipt was not found")
            ) ?: throw NotFoundException("Receipt was not found")
            if (receipt.receiptKind == "COUNTER_REDEMPTION") {
                receipt.actualSavings = sql.customerActualSavings(customerId, arrayOf(receipt.sourceTransactionId)).singleOrNull()
            }
            call.respond(ApiResponse.success(receipt, call.callId))
        }
        get("/subscriptions/{subscriptionId}/actual-savings") {
            val organizationId = call.parameters["organizationId"] ?: throw NotFoundException("Organization was not found")
            val subscriptionId = call.parameters["subscriptionId"] ?: throw NotFoundException("Subscription was not found")
            val savings = sql.subscriptionActualSavings(call.authenticatedPrincipal().userId, organizationId, subscriptionId)
            if (savings.isEmpty()) throw NotFoundException("Subscription was not found")
            call.respond(ApiResponse.success(savings, call.callId))
        }
    }
    route("/organizations/{organizationId}/counter") {
        get("/transactions") {
            val organizationId = call.parameters["organizationId"] ?: throw NotFoundException("Organization was not found")
            val storeId = call.request.queryParameters["storeId"] ?: throw NotFoundException("Store was not found")
            val staffId = call.request.queryParameters["staffId"] ?: throw NotFoundException("Staff was not found")
            val limit = call.request.queryParameters["limit"]?.toIntOrNull()?.coerceIn(1, 100) ?: 25
            val offset = call.request.queryParameters["offset"]?.toIntOrNull()?.coerceAtLeast(0) ?: 0
            call.respond(ApiResponse.success(sql.counterTransactionHistory(
                organizationId, storeId, staffId, call.authenticatedPrincipal().userId,
                call.request.queryParameters["customerUserId"], call.request.queryParameters["status"],
                call.request.queryParameters["transactionType"], call.request.queryParameters["paymentMethod"],
                call.request.queryParameters["search"], limit, offset
            ), call.callId))
        }
        get("/receipts/{receiptId}") {
            val organizationId = call.parameters["organizationId"] ?: throw NotFoundException("Organization was not found")
            val storeId = call.request.queryParameters["storeId"] ?: throw NotFoundException("Store was not found")
            val staffId = call.request.queryParameters["staffId"] ?: throw NotFoundException("Staff was not found")
            val receipt = sql.counterReceipt(organizationId, storeId, staffId, call.authenticatedPrincipal().userId,
                call.parameters["receiptId"] ?: throw NotFoundException("Receipt was not found"))
                ?: throw NotFoundException("Receipt was not found")
            call.respond(ApiResponse.success(receipt, call.callId))
        }
    }
}
