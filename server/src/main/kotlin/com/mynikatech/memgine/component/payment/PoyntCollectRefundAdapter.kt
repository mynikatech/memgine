package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntAccessToken
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import org.slf4j.LoggerFactory

data class PoyntCollectRefundRequest(
    val refundAttemptId: String,
    val originalCaptureId: String,
    val refundAmountMinor: Long,
    val currencyCode: String,
    val configuration: PoyntCatalogConfiguration
)

data class PoyntCollectRefundResult(
    val outcome: PaymentRefundProviderOutcome,
    val providerReference: String? = null,
    val providerOriginalRequestId: String? = null
)

/**
 * Referenced refunds are deliberately isolated from Collect charge handling.
 * It accepts only already-verified ledger values and never receives card data.
 */
class PoyntCollectRefundAdapter(
    private val baseUrl: String,
    private val transport: PoyntHttpTransport,
    private val accessToken: (PoyntCatalogConfiguration) -> PoyntAccessToken
) {
    private val logger = LoggerFactory.getLogger(PoyntCollectRefundAdapter::class.java)

    fun execute(request: PoyntCollectRefundRequest): PoyntCollectRefundResult {
        if (!valid(request)) return PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
        val token = token(request.configuration) ?: return PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
        val response = try {
            transport.post(
                transactionsUri(request.configuration.businessId),
                "${token.tokenType} ${token.value}",
                request.refundAttemptId,
                requestBody(request)
            )
        } catch (_: Exception) {
            logger.warn("Poynt Collect refund provider operation failed; operation=execute attemptId={} category=transport", request.refundAttemptId)
            return PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
        }
        // A transport status does not provide the verified transaction evidence
        // required to classify money movement as a definitive provider rejection.
        if (response.statusCode !in 200..299) {
            logger.warn("Poynt Collect refund provider operation was unresolved; operation=execute attemptId={} httpStatus={}", request.refundAttemptId, response.statusCode)
            return unknown()
        }
        return parse(response.body, request)
    }

    /** Read-only lookup. It never submits a second refund. */
    fun reconcile(request: PoyntCollectRefundRequest, providerReference: String?): PoyntCollectRefundResult {
        if (!valid(request)) return PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
        // Poynt's original-request-id search is not reliable enough to attach
        // an unknown refund to an attempt. Automatic reconciliation is exact-ID
        // only; manual verified-reference recovery supplies that ID separately.
        if (providerReference.isNullOrBlank()) return unknown()
        val token = token(request.configuration) ?: return PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
        val response = try {
            transport.get(
                transport.transactionByIdUri(request.configuration.businessId, providerReference),
                "${token.tokenType} ${token.value}"
            )
        } catch (_: Exception) {
            logger.warn("Poynt Collect refund provider operation failed; operation=reconcile attemptId={} category=transport", request.refundAttemptId)
            return PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
        }
        if (response.statusCode !in 200..299) return PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
        val transaction = transaction(response.body, providerReference, request.refundAttemptId)
            ?: return unknown(request, "response-candidate")
        return parse(transaction, request)
    }

    /** Exact-ID, GET-only evidence verification for the Platform recovery boundary. */
    fun verifyProviderReference(
        request: PoyntCollectRefundRequest,
        providerReference: String
    ): PoyntCollectRefundResult = reconcile(request, providerReference)

    internal fun requestBody(request: PoyntCollectRefundRequest): String = buildJsonObject {
        put("parentId", request.originalCaptureId)
        put("action", "REFUND")
        put("fundingSource", buildJsonObject { put("type", "CREDIT_DEBIT") })
        put("amounts", buildJsonObject {
            put("transactionAmount", request.refundAmountMinor)
            put("orderAmount", request.refundAmountMinor)
            put("currency", request.currencyCode)
        })
    }.toString()

    private fun token(configuration: PoyntCatalogConfiguration): PoyntAccessToken? = try {
        accessToken(configuration)
    } catch (_: Exception) {
        null
    }

    private fun transaction(body: String, reference: String?, requestId: String): JsonObject? = try {
        val root = Json.parseToJsonElement(body)
        val candidates = when (root) {
            is JsonArray -> root.mapNotNull { it as? JsonObject }
            is JsonObject -> (root["transactions"] as? JsonArray)?.mapNotNull { it as? JsonObject }
                ?: listOf(root)
            else -> emptyList()
        }
        val matches = candidates.filter {
            val id = strictString(it, "id")
            val originalRequestId = strictString(it, "originalRequestId")
            (reference == null || id == reference) &&
                (originalRequestId == null || originalRequestId == requestId)
        }
        matches.singleOrNull()
    } catch (_: Exception) {
        null
    }

    private fun parse(body: String, request: PoyntCollectRefundRequest): PoyntCollectRefundResult = try {
        val transaction = transaction(body, null, request.refundAttemptId)
            ?: return unknown(request, "response-candidate")
        parse(transaction, request)
    } catch (_: Exception) {
        logger.warn("Poynt Collect refund provider response was malformed; operation=execute attemptId={}", request.refundAttemptId)
        PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
    }

    private fun parse(transaction: JsonObject, request: PoyntCollectRefundRequest): PoyntCollectRefundResult {
        val id = strictString(transaction, "id") ?: return unknown(request, "missing-transaction-id")
        if (strictString(transaction, "action") != "REFUND") return unknown(request, "action")
        if (strictString(transaction, "parentId") != request.originalCaptureId) return unknown(request, "parent")
        if (transaction.containsKey("originalRequestId") &&
            strictString(transaction, "originalRequestId") != request.refundAttemptId
        ) return unknown(request, "request-id")
        if (!matchesMerchant(transaction, request.configuration)) return unknown(request, "merchant")
        if (!matchesAmounts(transaction, request)) return unknown(request, "amount-or-currency")
        if (contradictoryIndicator(transaction) != null) return unknown(request, "contradictory-state")

        val status = strictString(transaction, "status")
        val originalRequestId = strictString(transaction, "originalRequestId")
        val processor = transaction["processorResponse"] as? JsonObject
        val processorStatus = processor?.let { strictString(it, "status") }
        val approvedAmount = if (processor?.containsKey("approvedAmount") == true) {
            strictAmount(processor, "approvedAmount") ?: return unknown(request, "approved-amount")
        } else {
            null
        }
        return when {
            status == "REFUNDED" && processorStatus == "Successful" &&
                (approvedAmount == null || approvedAmount == request.refundAmountMinor) ->
                PoyntCollectRefundResult(PaymentRefundProviderOutcome.SUCCEEDED, id, originalRequestId)
            status == "DECLINED" && processorStatus == "Failure" &&
                (approvedAmount == null || approvedAmount == 0L) ->
                PoyntCollectRefundResult(PaymentRefundProviderOutcome.FAILED, id, originalRequestId)
            status in setOf("CREATED", "SAVED", "AUTHORIZED", "PARTIALLY_REFUNDED") ->
                PoyntCollectRefundResult(PaymentRefundProviderOutcome.PENDING, id, originalRequestId)
            else -> unknown(request, "provider-status")
        }
    }

    private fun matchesMerchant(transaction: JsonObject, configuration: PoyntCatalogConfiguration): Boolean {
        val context = transaction["context"] as? JsonObject ?: return false
        return strictString(context, "businessId") == configuration.businessId &&
            strictString(context, "storeId") == configuration.providerStoreId
    }

    private fun matchesAmounts(transaction: JsonObject, request: PoyntCollectRefundRequest): Boolean {
        val amounts = transaction["amounts"] as? JsonObject ?: return false
        return strictString(amounts, "currency") == request.currencyCode &&
            strictAmount(amounts, "transactionAmount") == request.refundAmountMinor &&
            strictAmount(amounts, "orderAmount") == request.refundAmountMinor
    }

    private fun valid(request: PoyntCollectRefundRequest): Boolean =
        baseUrl.startsWith("https://") && request.refundAttemptId.isNotBlank() &&
            request.originalCaptureId.isNotBlank() && request.refundAmountMinor > 0 &&
            request.currencyCode.matches(Regex("^[A-Z]{3}$")) &&
            request.configuration.businessId.matches(Regex("^[A-Za-z0-9_-]{1,128}$")) &&
            !request.configuration.providerStoreId.isNullOrBlank()

    private fun transactionsUri(businessId: String) = java.net.URI.create("$baseUrl/businesses/$businessId/transactions")
    private fun unknown() = PoyntCollectRefundResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
    private fun unknown(request: PoyntCollectRefundRequest, condition: String): PoyntCollectRefundResult {
        logger.warn(
            "Poynt Collect refund provider evidence was rejected; operation=parse attemptId={} condition={}",
            request.refundAttemptId,
            condition
        )
        return unknown()
    }
    private fun strictString(value: JsonObject, key: String): String? =
        (value[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
    private fun strictAmount(value: JsonObject, key: String): Long? {
        val primitive = value[key] as? JsonPrimitive ?: return null
        return if (primitive.isString) null else primitive.longOrNull
    }

    private fun contradictoryIndicator(transaction: JsonObject): String? {
        val flags = listOf("voided", "reversed", "reversal", "actionVoid", "reversalVoid", "partiallyApproved", "authOnly")
        return flags.firstOrNull { flag ->
            val element = transaction[flag] ?: return@firstOrNull false
            val value = element as? JsonPrimitive
            value == null || value.isString || value.content !in setOf("true", "false") || value.content == "true"
        }
    }
}
