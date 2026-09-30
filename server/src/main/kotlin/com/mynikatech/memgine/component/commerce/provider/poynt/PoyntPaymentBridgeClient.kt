package com.mynikatech.memgine.component.commerce.provider.poynt

import com.mynikatech.memgine.component.commerce.CommerceRemoteTerminalPaymentRequest
import com.mynikatech.memgine.exception.BadRequestException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.URI

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
        if (response.statusCode !in 200..299) throw BadRequestException("Poynt Payment Bridge dispatch failed (HTTP ${response.statusCode})")
    }
}

@kotlinx.serialization.Serializable private data class PoyntCloudMessage(val ttl: Long, val businessId: String, val storeId: String, val deviceId: String, val data: String)
@kotlinx.serialization.Serializable private data class PoyntBridgeData(val callbackUrl: String, @kotlinx.serialization.SerialName("custom-http-header") val customHttpHeader: String, val payment: String)
@kotlinx.serialization.Serializable private data class PoyntBridgePayment(val amount: Long, val currency: String, val multiTender: Boolean, val authzOnly: Boolean, val disableTip: Boolean, val referenceId: String, val orderId: String, val enableStatusUpdates: Boolean = true)
