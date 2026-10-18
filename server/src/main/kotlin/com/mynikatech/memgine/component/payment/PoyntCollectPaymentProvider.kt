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
import org.slf4j.LoggerFactory

data class PoyntCollectResult(
    val transactionId: String,
    val approved: Boolean,
    val definiteDecline: Boolean = false,
    val verifiedBusinessId: String? = null,
    val verifiedStoreId: String? = null
)

/** Remote Collect uses the existing Poynt cloud OAuth token, not the terminal bridge. */
class PoyntCollectPaymentProvider(
    private val baseUrl: String,
    private val transport: PoyntHttpTransport,
    private val accessToken: (PoyntCatalogConfiguration) -> PoyntAccessToken
) : PaymentProvider {
    private val logger = LoggerFactory.getLogger(PoyntCollectPaymentProvider::class.java)

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

        val transaction = try {
            val root = Json.parseToJsonElement(response.body)
            when (root) {
                is JsonArray -> root.singleOrNull()?.jsonObject
                is JsonObject -> {
                    val transactions = root["transactions"] as? JsonArray
                    when {
                        transactions != null -> transactions.singleOrNull()?.jsonObject
                        root["id"] != null -> root
                        else -> null
                    }
                }
                else -> return null
            }
        } catch (_: Exception) {
            return null
        }

        if (transaction == null) return null

        return try {
            // Confirm that Poynt returned the exact saved transaction.
            if (
                strictString(transaction, "id")
                    != transactionId
            ) return null

            // If Poynt provides the original request ID,
            // it must match our payment intent.
            if (transaction.containsKey("originalRequestId") &&
                strictString(transaction, "originalRequestId") != payment.paymentIntentId
            ) return null

            val context = transaction["context"] as? JsonObject
                ?: return null

            if (
                strictString(context, "businessId")
                    != configuration.businessId ||
                strictString(context, "storeId")
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
        val root = try {
            Json.parseToJsonElement(body).jsonObject
        } catch (_: Exception) {
            logger.warn("Poynt Collect confirmation validation failed: malformed response")
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
        val id = strictString(root, "id")
            ?.takeIf { it.isNotBlank() && it.length <= 160 }
            ?: run {
                logger.warn("Poynt Collect confirmation validation failed: missing transaction id")
                throw ConflictException("Poynt Collect result is invalid; payment requires reconciliation")
            }

        fun rejected(reason: String, definiteDecline: Boolean = false) =
            PoyntCollectResult(id, false, definiteDecline).also {
                logger.warn("Poynt Collect confirmation validation failed: {}", reason)
            }

        val action = strictString(root, "action")
        if (action != "SALE") return rejected("unexpected action")

        if (configuration == null) return rejected("missing Poynt configuration")

        val context = root["context"] as? JsonObject
        if (context != null) {
            if (strictString(context, "businessId") != configuration.businessId) {
                return rejected("business mismatch")
            }
            if (strictString(context, "storeId") != configuration.providerStoreId) {
                return rejected("store mismatch")
            }
        }

        val amounts = root["amounts"] as? JsonObject
            ?: return rejected("missing transaction amounts")
        if (strictString(amounts, "currency") != expectedCurrency) {
            return rejected("currency mismatch")
        }
        if (strictMinorAmount(amounts, "transactionAmount") != expectedAmountMinor) {
            return rejected("transaction amount mismatch")
        }
        if (strictMinorAmount(amounts, "orderAmount") != expectedAmountMinor) {
            return rejected("order amount mismatch")
        }

        val status = strictString(root, "status")
        val processor = root["processorResponse"] as? JsonObject
        val processorStatus = processor?.let { strictString(it, "status") }
        val contradiction = contradictoryIndicator(root)

        if (status == "DECLINED") {
            if (processorStatus != "Failure") return rejected("decline processor status is incomplete")
            if (contradiction != null) return rejected(contradiction)

            val approvedAmountPresent = processor?.containsKey("approvedAmount") == true
            val approvedAmount = processor?.let { strictMinorAmount(it, "approvedAmount") }
            if (approvedAmountPresent && approvedAmount != 0L) {
                return rejected("declined transaction has a nonzero or malformed approved amount")
            }
            return rejected("provider decline", definiteDecline = true)
        }

        if (status != "CAPTURED") return rejected("transaction is not fully captured")
        if (processorStatus != "Successful") return rejected("processor not successful")
        if (contradiction != null) return rejected(contradiction)

        val approvedAmount = processor?.let { strictMinorAmount(it, "approvedAmount") }
        if (approvedAmount != expectedAmountMinor) return rejected("approved amount mismatch")

        return PoyntCollectResult(
            transactionId = id,
            approved = true,
            verifiedBusinessId = context?.let { strictString(it, "businessId") },
            verifiedStoreId = context?.let { strictString(it, "storeId") }
        )
    }

    private fun strictString(value: JsonObject, key: String): String? =
        (value[key] as? kotlinx.serialization.json.JsonPrimitive)
            ?.takeIf { it.isString }
            ?.content

    private fun strictMinorAmount(value: JsonObject, key: String): Long? {
        val primitive = value[key] as? kotlinx.serialization.json.JsonPrimitive ?: return null
        if (primitive.isString) return null
        return primitive.longOrNull
    }

    private fun contradictoryIndicator(transaction: JsonObject): String? {
        val indicators = listOf(
            "partiallyApproved",
            "voided",
            "authOnly",
            "partiallyCaptured",
            "refunded",
            "partiallyRefunded",
            "reversed",
            "reversal"
        )
        for (indicator in indicators) {
            val element = transaction[indicator] ?: continue
            val primitive = element as? kotlinx.serialization.json.JsonPrimitive
                ?: return "$indicator is malformed"
            if (primitive.isString || primitive.content !in setOf("true", "false")) {
                return "$indicator is malformed"
            }
            if (primitive.content == "true") return "$indicator is set"
        }
        return null
    }
}
