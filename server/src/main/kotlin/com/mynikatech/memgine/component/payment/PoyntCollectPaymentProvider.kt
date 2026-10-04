package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntAccessToken
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import java.net.URI
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

data class PoyntCollectResult(
    val transactionId: String,
    val approved: Boolean,
    val definiteDecline: Boolean = false
)

/** Remote Collect uses the existing Poynt cloud OAuth token, not the terminal bridge. */
class PoyntCollectPaymentProvider(
    private val baseUrl: String,
    private val transport: PoyntHttpTransport,
    private val accessToken: (PoyntCatalogConfiguration) -> PoyntAccessToken
) : PaymentProvider {
    override val code = "POYNT_COLLECT"
    override val isAvailable: Boolean get() = baseUrl.startsWith("https://")
    override fun canConfirm(status: String) = false
    override fun providerReference(paymentIntent: PaymentIntentDto, suppliedReference: String?) = suppliedReference

    fun token(configuration: PoyntCatalogConfiguration): PoyntAccessToken = try {
        accessToken(configuration)
    } catch (_: Exception) {
        throw BadRequestException("Poynt Collect authentication is unavailable")
    }

    fun charge(
        payment: PaymentIntentDto,
        configuration: PoyntCatalogConfiguration,
        nonce: String,
        token: PoyntAccessToken,
        amountMinor: Long
    ): PoyntCollectResult {
        if (!isAvailable || configuration.providerStoreId.isNullOrBlank() ||
            configuration.merchantCurrencyCode != payment.currencyCode ||
            !configuration.businessId.matches(Regex("^[A-Za-z0-9_-]{1,128}$")) ||
            !configuration.providerStoreId.matches(Regex("^[A-Za-z0-9_-]{1,128}$")) ||
            nonce.isBlank() || nonce.length > 4096 || amountMinor <= 0L
        ) throw BadRequestException("Poynt Collect payment is unavailable")
        val request = requestBody(configuration, nonce, amountMinor, payment.currencyCode)
        val uri = URI.create("$baseUrl/businesses/${configuration.businessId}/cards/tokenize/charge")
        // Poynt-Request-Id is stable for this intent. Transport does not retry POST.
        val response = try {
            transport.post(uri, "${token.tokenType} ${token.value}", payment.paymentIntentId, request)
        } catch (_: Exception) {
            throw ConflictException("Poynt Collect result is unavailable; payment requires reconciliation")
        }
        if (response.statusCode !in 200..299) {
            // Do not interpret a transport/protocol error as a safe decline: the
            // remote outcome may be ambiguous and must be reconciled first.
            throw ConflictException("Poynt Collect result is unavailable; payment requires reconciliation")
        }
        return parseResult(response.body, amountMinor, payment.currencyCode)
    }

    internal fun requestBody(
        configuration: PoyntCatalogConfiguration, nonce: String, amountMinor: Long, currency: String
    ): String = buildJsonObject {
        put("action", "SALE")
        put("context", buildJsonObject {
            put("businessId", configuration.businessId)
            put("storeId", configuration.providerStoreId!!)
        })
        put("amounts", buildJsonObject {
            put("transactionAmount", amountMinor)
            put("orderAmount", amountMinor)
            put("currency", currency)
        })
        put("fundingSource", buildJsonObject { put("nonce", nonce) })
    }.toString()

    internal fun parseResult(body: String, expectedAmountMinor: Long, expectedCurrency: String): PoyntCollectResult {
        val root = try { Json.parseToJsonElement(body).jsonObject } catch (_: Exception) {
            throw ConflictException("Poynt Collect result is invalid; payment requires reconciliation")
        }
        fun string(key: String) = root[key]?.jsonPrimitive?.contentOrNull
        val id = try { string("id")?.takeIf { it.isNotBlank() && it.length <= 160 } } catch (_: Exception) { null }
            ?: throw ConflictException("Poynt Collect result is invalid; payment requires reconciliation")
        val action = try { string("action") } catch (_: Exception) { null }
        if (action != "SALE") return PoyntCollectResult(id, false)
        val status = try { string("status") } catch (_: Exception) { null }
        val processor = try { root["processorResponse"]?.jsonObject } catch (_: Exception) { null }
        val amounts = try { root["amounts"]?.jsonObject } catch (_: Exception) { null }
        val approved = try { processor?.get("approvedAmount")?.jsonPrimitive?.longOrNull } catch (_: Exception) { null }
        val currency = try { amounts?.get("currency")?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
        val transactionAmount = try { amounts?.get("transactionAmount")?.jsonPrimitive?.longOrNull } catch (_: Exception) { null }
        val orderAmount = try { amounts?.get("orderAmount")?.jsonPrimitive?.longOrNull } catch (_: Exception) { null }
        val processorStatus = try { processor?.get("status")?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
        val responseCode = try { processor?.get("statusCode")?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
        if ((processor?.containsKey("approvedAmount") == true && approved == null) ||
            (amounts?.containsKey("transactionAmount") == true && transactionAmount == null) ||
            (amounts?.containsKey("orderAmount") == true && orderAmount == null) ||
            (amounts?.containsKey("currency") == true && currency.isNullOrBlank()) ||
            (currency != null && currency != expectedCurrency) ||
            (transactionAmount != null && transactionAmount != expectedAmountMinor) ||
            (orderAmount != null && orderAmount != expectedAmountMinor) ||
            (approved != null && approved != expectedAmountMinor)
        ) return PoyntCollectResult(id, false)
        if (status == "DECLINED") return PoyntCollectResult(id, false, true)
        if (status != "AUTHORIZED" || processorStatus != "Successful" || responseCode != "AA") {
            return PoyntCollectResult(id, false)
        }
        return PoyntCollectResult(id, true)
    }
}
