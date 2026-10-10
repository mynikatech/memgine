package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntAccessToken
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import java.net.URI
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
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
        paymentToken: String,
        token: PoyntAccessToken,
        amountMinor: Long
    ): PoyntCollectResult {
        if (!isAvailable || configuration.providerStoreId.isNullOrBlank() ||
            configuration.merchantCurrencyCode != payment.currencyCode ||
            !configuration.businessId.matches(Regex("^[A-Za-z0-9_-]{1,128}$")) ||
            !configuration.providerStoreId.matches(Regex("^[A-Za-z0-9_-]{1,128}$")) ||
            paymentToken.isBlank() || paymentToken.length > 16_384 || amountMinor <= 0L
        ) throw BadRequestException("Poynt Collect payment is unavailable")
        val request = requestBody(configuration, paymentToken, amountMinor, payment.currencyCode)
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
        return parseResult(response.body, amountMinor, payment.currencyCode, configuration)
    }

    /** Direct one-time wallet nonce charge. Never call tokenize() on a wallet nonce. */
    fun chargeWalletNonce(
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
        ) throw BadRequestException("Poynt Collect wallet payment is unavailable")
        // Same endpoint/request ID/reconciliation as card charges.
        val request = requestBody(configuration, nonce, amountMinor, payment.currencyCode, "nonce")
        val uri = URI.create("$baseUrl/businesses/${configuration.businessId}/cards/tokenize/charge")
        val response = try {
            transport.post(uri, "${token.tokenType} ${token.value}", payment.paymentIntentId, request)
        } catch (_: Exception) {
            throw ConflictException("Poynt wallet result is unavailable; payment requires reconciliation")
        }
        if (response.statusCode !in 200..299) {
            throw ConflictException("Poynt wallet result is unavailable; payment requires reconciliation")
        }
        return parseResult(response.body, amountMinor, payment.currencyCode, configuration)
    }

    fun tokenize(
        configuration: PoyntCatalogConfiguration,
        nonce: String,
        token: PoyntAccessToken
    ): String {
        if (!isAvailable || configuration.providerStoreId.isNullOrBlank() ||
            !configuration.businessId.matches(Regex("^[A-Za-z0-9_-]{1,128}$")) ||
            !configuration.providerStoreId.matches(Regex("^[A-Za-z0-9_-]{1,128}$")) ||
            nonce.isBlank() || nonce.length > 4096
        ) throw BadRequestException("Poynt Collect payment is unavailable")
        val response = try {
            transport.post(
                URI.create("$baseUrl/businesses/${configuration.businessId}/cards/tokenize"),
                "${token.tokenType} ${token.value}",
                "collect-tokenize-${java.util.UUID.randomUUID()}",
                buildJsonObject { put("nonce", nonce) }.toString()
            )
        } catch (_: Exception) {
            throw BadRequestException("Poynt Collect card tokenization is unavailable")
        }
        if (response.statusCode !in 200..299) {
            throw BadRequestException("Poynt Collect card tokenization was not approved")
        }
        return try {
            val body = Json.parseToJsonElement(response.body).jsonObject
            val status = body["status"]?.jsonPrimitive?.contentOrNull
            val paymentToken = body["paymentToken"]?.jsonPrimitive?.contentOrNull
            if (status != "ACTIVE" || paymentToken.isNullOrBlank() || paymentToken.length > 16_384) {
                throw BadRequestException("Poynt Collect card tokenization was not approved")
            }
            paymentToken
        } catch (error: BadRequestException) {
            throw error
        } catch (_: Exception) {
            throw BadRequestException("Poynt Collect card tokenization was not approved")
        }
    }

    /**
     * Looks up the one charge associated with the stable Poynt-Request-Id.
     * A missing, malformed, or nonterminal result deliberately remains unknown:
     * callers must retain PROCESSING and must never repost the nonce.
     */
    
    fun reconcile(
        payment: PaymentIntentDto,
        configuration: PoyntCatalogConfiguration,
        token: PoyntAccessToken,
        amountMinor: Long
    ): PoyntCollectResult? {
        // Never guess which transaction belongs to a payment.
        val transactionId = payment.providerReferenceId
            ?.takeIf {
                it.matches(
                    Regex("^[A-Za-z0-9_-]{1,160}$")
                )
            } ?: return null

        val response = try {
            transport.get(
                transport.transactionByIdUri(
                    configuration.businessId,
                    transactionId
                ),
                "${token.tokenType} ${token.value}"
            )
        } catch (_: Exception) {
            return null
        }

        if (response.statusCode !in 200..299) return null

        val transactions = try {
            val root = Json.parseToJsonElement(response.body)
            when (root) {
                is JsonArray -> root
                is JsonObject ->
                    root["transactions"] as? JsonArray ?: return null
                else -> return null
            }
        } catch (_: Exception) {
            return null
        }

        if (transactions.size != 1) return null

        return try {
            val transaction = transactions.single().jsonObject

            // Confirm that Poynt returned the exact saved transaction.
            if (
                transaction["id"]?.jsonPrimitive?.contentOrNull
                    != transactionId
            ) return null

            // If Poynt provides the original request ID,
            // it must match our payment intent.
            val originalRequestId =
                transaction["originalRequestId"]
                    ?.jsonPrimitive?.contentOrNull

            if (
                originalRequestId != null &&
                originalRequestId != payment.paymentIntentId
            ) return null

            val context = transaction["context"]?.jsonObject
                ?: return null

            if (
                context["businessId"]?.jsonPrimitive?.contentOrNull
                    != configuration.businessId ||
                context["storeId"]?.jsonPrimitive?.contentOrNull
                    != configuration.providerStoreId
            ) return null

            parseResult(
                transaction,
                amountMinor,
                payment.currencyCode,
                configuration
            )
        } catch (_: Exception) {
            null
        }
    }


    internal fun requestBody(
        configuration: PoyntCatalogConfiguration, paymentToken: String, amountMinor: Long, currency: String, fundingKey: String = "cardToken"
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
        put("fundingSource", buildJsonObject { put(fundingKey, paymentToken) })
    }.toString()

    internal fun parseResult(
        body: String,
        expectedAmountMinor: Long,
        expectedCurrency: String,
        configuration: PoyntCatalogConfiguration? = null
    ): PoyntCollectResult {
        val root = try { Json.parseToJsonElement(body).jsonObject } catch (_: Exception) {
            throw ConflictException("Poynt Collect result is invalid; payment requires reconciliation")
        }
        return parseResult(root, expectedAmountMinor, expectedCurrency, configuration)
    }

    private fun parseResult(
        root: JsonObject,
        expectedAmountMinor: Long,
        expectedCurrency: String,
        configuration: PoyntCatalogConfiguration? = null
    ): PoyntCollectResult {
        fun string(key: String) = root[key]?.jsonPrimitive?.contentOrNull
        val id = try { string("id")?.takeIf { it.isNotBlank() && it.length <= 160 } } catch (_: Exception) { null }
            ?: throw ConflictException("Poynt Collect result is invalid; payment requires reconciliation")
        val action = try { string("action") } catch (_: Exception) { null }
        if (action != "SALE") return PoyntCollectResult(id, false)
        val status = try { string("status") } catch (_: Exception) { null }
        val processor = try { root["processorResponse"]?.jsonObject } catch (_: Exception) { null }
        val amounts = try { root["amounts"]?.jsonObject } catch (_: Exception) { null }
        val context = try { root["context"]?.jsonObject } catch (_: Exception) { null }
        val businessId = try { context?.get("businessId")?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
        val storeId = try { context?.get("storeId")?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
        val approved = try { processor?.get("approvedAmount")?.jsonPrimitive?.longOrNull } catch (_: Exception) { null }
        val currency = try { amounts?.get("currency")?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
        val transactionAmount = try { amounts?.get("transactionAmount")?.jsonPrimitive?.longOrNull } catch (_: Exception) { null }
        val orderAmount = try { amounts?.get("orderAmount")?.jsonPrimitive?.longOrNull } catch (_: Exception) { null }
        val processorStatus = try { processor?.get("status")?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
        val responseCode = try { processor?.get("statusCode")?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
       if (
            configuration == null ||
            businessId != configuration.businessId ||
            storeId != configuration.providerStoreId ||
            currency != expectedCurrency ||
            transactionAmount != expectedAmountMinor ||
            orderAmount != expectedAmountMinor ||
            approved != expectedAmountMinor
        ) {
            return PoyntCollectResult(id, false)
        }
        if (status == "DECLINED") return PoyntCollectResult(id, false, true)
        if (status !in setOf("AUTHORIZED", "CAPTURED") ||
            processorStatus != "Successful" ||
            responseCode != "AA"
        ) {
            return PoyntCollectResult(id, false)
        }
        return PoyntCollectResult(id, true)
    }
}
