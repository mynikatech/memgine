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
    var issuedAt: String = ""
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
    var refundStatus: String? = null
)

interface TransactionReceiptSql {
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

fun Route.transactionReceiptRoutes(sql: TransactionReceiptSql) {
    get("/customer/transactions") {
        val limit = call.request.queryParameters["limit"]?.toIntOrNull()?.coerceIn(1, 100) ?: 25
        val offset = call.request.queryParameters["offset"]?.toIntOrNull()?.coerceAtLeast(0) ?: 0
        call.respond(ApiResponse.success(sql.customerTransactionHistory(
            call.authenticatedPrincipal().userId,
            call.request.queryParameters["organizationId"], call.request.queryParameters["status"],
            call.request.queryParameters["transactionType"], call.request.queryParameters["search"], limit, offset
        ), call.callId))
    }
    route("/customer/organizations/{organizationId}") {
        get("/transactions") {
            val organizationId = call.parameters["organizationId"] ?: throw NotFoundException("Organization was not found")
            val limit = call.request.queryParameters["limit"]?.toIntOrNull()?.coerceIn(1, 100) ?: 25
            val offset = call.request.queryParameters["offset"]?.toIntOrNull()?.coerceAtLeast(0) ?: 0
            call.respond(ApiResponse.success(sql.customerReceipts(organizationId, call.authenticatedPrincipal().userId, limit, offset), call.callId))
        }
        get("/receipts/{receiptId}") {
            val receipt = sql.customerReceipt(
                call.parameters["organizationId"] ?: throw NotFoundException("Organization was not found"),
                call.authenticatedPrincipal().userId,
                call.parameters["receiptId"] ?: throw NotFoundException("Receipt was not found")
            ) ?: throw NotFoundException("Receipt was not found")
            call.respond(ApiResponse.success(receipt, call.callId))
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
