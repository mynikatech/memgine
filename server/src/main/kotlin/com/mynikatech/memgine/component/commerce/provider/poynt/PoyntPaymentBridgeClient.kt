package com.mynikatech.memgine.component.commerce.provider.poynt

import com.mynikatech.memgine.component.commerce.CommerceRemoteTerminalPaymentRequest
import com.mynikatech.memgine.exception.BadRequestException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull

/** Poynt Payment Bridge serializer. It contains no cardholder data. */
class PoyntPaymentBridgeClient(private val transport: PoyntHttpTransport, private val tokens: PoyntTokenService) {
    private val json = Json { encodeDefaults = true }
    fun dispatch(configuration: PoyntCatalogConfiguration, request: CommerceRemoteTerminalPaymentRequest) {
        if (request.target.providerDeviceId.isBlank()) throw BadRequestException("Poynt terminal device is required")
        val payment = PoyntBridgePayment(request.amountMinor, request.currencyCode, false, false, true, request.referenceId, request.providerOrderId)
        val data = PoyntBridgeData(request.callbackUrl, "${request.callbackHeaderName}: ${request.callbackHeaderValue}", json.encodeToString(payment))
        val message = PoyntCloudMessage(request.ttlSeconds, request.target.providerBusinessId, request.target.providerStoreId, request.target.providerDeviceId, json.encodeToString(data))
        val token = tokens.token(configuration)
        val response = transport.post(transport.cloudMessagesUri(), "${token.tokenType} ${token.value}", request.referenceId, json.encodeToString(message))
        if (response.statusCode !in 200..299) throw BadRequestException("Poynt Payment Bridge dispatch was not acknowledged")
    }

    /** Read-only lookup by the persisted unique refund-attempt request ID.
     * Return nothing when Poynt omits request-ID correlation or gives multiple candidates.
     */
    fun lookupRefundReference(configuration:PoyntCatalogConfiguration,refundAttemptId:String):String? {
        if(refundAttemptId.isBlank()) return null
        return try {
            val token=tokens.token(configuration)
            val response=transport.get(transport.transactionsByOriginalRequestIdUri(
                configuration.businessId,refundAttemptId),"${token.tokenType} ${token.value}")
            if(response.statusCode !in 200..299) return null
            val root=json.parseToJsonElement(response.body)
            val candidates=when(root) {
                is JsonArray -> root.mapNotNull { it as? JsonObject }
                is JsonObject -> (root["transactions"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: listOf(root)
                else -> emptyList()
            }
            candidates.filter {
                it["originalRequestId"]?.jsonPrimitive?.contentOrNull==refundAttemptId &&
                    it["action"]?.jsonPrimitive?.contentOrNull=="REFUND"
            }.singleOrNull()?.get("id")?.jsonPrimitive?.contentOrNull
        }catch (_:Exception){null}
    }

    /** Read-only exact transaction-id verification. No refund POST is performed. */
    fun verifyRefundReference(
        configuration: PoyntCatalogConfiguration,
        originalTransactionId: String,
        refundAttemptId: String,
        refundAmountMinor: Long,
        currencyCode: String,
        refundReference: String
    ): Boolean {
        if (originalTransactionId.isBlank() || refundAttemptId.isBlank() || refundAmountMinor<=0 ||
            refundReference.isBlank() || configuration.providerStoreId.isNullOrBlank()) return false
        return try {
            val token=tokens.token(configuration)
            val response=transport.get(transport.transactionByIdUri(configuration.businessId,refundReference),
                "${token.tokenType} ${token.value}")
            if (response.statusCode !in 200..299) return false
            val root=json.parseToJsonElement(response.body)
            val candidates=when(root) {
                is JsonArray -> root.mapNotNull { it as? JsonObject }
                is JsonObject -> (root["transactions"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: listOf(root)
                else -> emptyList()
            }
            fun value(o:JsonObject,k:String)=o[k]?.jsonPrimitive?.contentOrNull
            val tx=candidates.singleOrNull { value(it,"id")==refundReference } ?: return false
            val amounts=tx["amounts"] as? JsonObject ?:return false
            val merchant=tx["context"] as? JsonObject ?:return false
            val processor=tx["processorResponse"] as? JsonObject ?:return false
            if (tx.containsKey("originalRequestId") && value(tx,"originalRequestId")!=refundAttemptId) return false
            val approved=processor["approvedAmount"]?.jsonPrimitive?.longOrNull
            val validApproved=!processor.containsKey("approvedAmount") || approved==refundAmountMinor
            value(tx,"action")=="REFUND" && value(tx,"parentId")==originalTransactionId &&
                value(tx,"status")=="REFUNDED" && value(processor,"status")=="Successful" &&
                validApproved && amounts["transactionAmount"]?.jsonPrimitive?.longOrNull==refundAmountMinor &&
                value(amounts,"currency")==currencyCode &&
                value(merchant,"businessId")==configuration.businessId &&
                value(merchant,"storeId")==configuration.providerStoreId
        } catch (_:Exception) { false }
    }

    fun dispatchRefund(configuration: PoyntCatalogConfiguration, request: PoyntBridgeRefundDispatchRequest) {
        if (request.originalTransactionId.isBlank() || request.referenceId.isBlank() || request.deviceId.isBlank() ||
            request.businessId.isBlank() || request.storeId.isBlank() || request.amountMinor <= 0 ||
            !request.currencyCode.matches(Regex("[A-Z]{3}")) || request.callbackUrl.isBlank() ||
            request.callbackHeaderName.isBlank() || request.callbackHeaderValue.isBlank() || request.ttlSeconds<=0)
            throw BadRequestException("Poynt refund dispatch is invalid")
        if (configuration.businessId!=request.businessId || configuration.providerStoreId!=request.storeId)
            throw BadRequestException("Original Poynt merchant/store identity mismatch")
        val refund = PoyntBridgeRefund(
            action = "refund", transactionId = request.originalTransactionId, purchaseAmount = request.amountMinor,
            currency = request.currencyCode, referenceId = request.referenceId, callbackUrl = request.callbackUrl,
            customHttpHeader = "${request.callbackHeaderName}: ${request.callbackHeaderValue}", enableStatusUpdates = true
        )
        val message = PoyntCloudMessage(request.ttlSeconds, request.businessId, request.storeId, request.deviceId, json.encodeToString(refund))
        val token = tokens.token(configuration)
        // No POST retry. The caller must treat any transport uncertainty as UNKNOWN.
        val response = transport.post(transport.cloudMessagesUri(), "${token.tokenType} ${token.value}", request.referenceId, json.encodeToString(message))
        if (response.statusCode !in 200..299) throw BadRequestException("Poynt Payment Bridge refund dispatch was not acknowledged")
    }
}

data class PoyntBridgeRefundDispatchRequest(
    val originalTransactionId: String, val referenceId: String, val amountMinor: Long, val currencyCode: String,
    val businessId: String, val storeId: String, val deviceId: String, val callbackUrl: String,
    val callbackHeaderName: String, val callbackHeaderValue: String, val ttlSeconds: Long
)

@kotlinx.serialization.Serializable private data class PoyntCloudMessage(val ttl: Long, val businessId: String, val storeId: String, val deviceId: String, val data: String)
@kotlinx.serialization.Serializable private data class PoyntBridgeData(val callbackUrl: String, @kotlinx.serialization.SerialName("custom-http-header") val customHttpHeader: String, val payment: String)
@kotlinx.serialization.Serializable private data class PoyntBridgePayment(val amount: Long, val currency: String, val multiTender: Boolean, val authzOnly: Boolean, val disableTip: Boolean, val referenceId: String, val orderId: String, val enableStatusUpdates: Boolean = true)
@kotlinx.serialization.Serializable private data class PoyntBridgeRefund(
    val action: String, val transactionId: String, val purchaseAmount: Long, val currency: String,
    val referenceId: String, val callbackUrl: String,
    @kotlinx.serialization.SerialName("custom-http-header") val customHttpHeader: String,
    val enableStatusUpdates: Boolean
)
