
package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntAccessToken
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntCatalogConfiguration
import com.mynikatech.memgine.component.commerce.provider.poynt.PoyntHttpTransport
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.slf4j.LoggerFactory

/**
 * Read-only, fail-closed verification of an original Poynt Collect capture.
 * Never initiates a payment or refund.
 * Never logs credentials or raw provider response bodies.
 */
class PoyntOriginalCaptureVerifier(
    private val transport: PoyntHttpTransport,
    private val token: (PoyntCatalogConfiguration) -> PoyntAccessToken
) {
    enum class Result {
        VERIFIED,
        NOT_CAPTURED,
        REQUIRES_RECONCILIATION
    }

    private val logger =
        LoggerFactory.getLogger(PoyntOriginalCaptureVerifier::class.java)

    private val json = Json { ignoreUnknownKeys = true }

    private fun reject(
        reason: String,
        httpStatus: Int? = null
    ): Result {
        logger.warn(
            "Poynt original capture verification rejected reason={} httpStatus={}",
            reason,
            httpStatus
        )
        return Result.REQUIRES_RECONCILIATION
    }

    fun verify(
        configuration: PoyntCatalogConfiguration,
        originalCaptureId: String,
        capturedAmountMinor: Long,
        currencyCode: String
    ): Result {

        if (
            originalCaptureId.isBlank() ||
            capturedAmountMinor <= 0 ||
            !currencyCode.matches(Regex("^[A-Z]{3}$")) ||
            configuration.businessId.isBlank() ||
            configuration.providerStoreId.isNullOrBlank()
        ) {
            return reject("INVALID_VERIFICATION_INPUT")
        }

        val response = try {
            val credential = token(configuration)

            transport.get(
                transport.transactionByIdUri(
                    configuration.businessId,
                    originalCaptureId
                ),
                "${credential.tokenType} ${credential.value}"
            )
        } catch (e: Exception) {
            logger.warn(
                "Poynt original capture lookup failed exceptionType={}",
                e.javaClass.simpleName
            )
            return reject("PROVIDER_LOOKUP_FAILED")
        }

        if (response.statusCode !in 200..299) {
            return reject(
                "PROVIDER_HTTP_FAILURE",
                response.statusCode
            )
        }

        val candidates = try {
            when (val root = json.parseToJsonElement(response.body)) {
                is JsonArray ->
                    root.filterIsInstance<JsonObject>()

                is JsonObject ->
                    (root["transactions"] as? JsonArray)
                        ?.filterIsInstance<JsonObject>()
                        ?: listOf(root)

                else -> emptyList()
            }
        } catch (_: Exception) {
            return reject("INVALID_PROVIDER_JSON", response.statusCode)
        }

        val matching = candidates.filter {
            string(it, "id") == originalCaptureId
        }

        if (matching.size != 1) {
            logger.warn(
                "Poynt capture lookup mismatch candidateCount={} exactMatches={}",
                candidates.size,
                matching.size
            )
            return reject(
                "EXACT_TRANSACTION_NOT_FOUND",
                response.statusCode
            )
        }

        val tx = matching.single()

        val context = tx["context"] as? JsonObject
            ?: return reject("MISSING_MERCHANT_CONTEXT")

        val amounts = tx["amounts"] as? JsonObject
            ?: return reject("MISSING_TRANSACTION_AMOUNTS")

        if (string(context, "businessId") != configuration.businessId) {
            return reject("BUSINESS_ID_MISMATCH")
        }

        if (string(context, "storeId") != configuration.providerStoreId) {
            return reject("STORE_ID_MISMATCH")
        }

        if (string(amounts, "currency") != currencyCode) {
            return reject("CURRENCY_MISMATCH")
        }

        if (amount(amounts, "transactionAmount") != capturedAmountMinor) {
            return reject("CAPTURE_AMOUNT_MISMATCH")
        }

        for (flag in listOf(
            "voided",
            "reversed",
            "reversal",
            "actionVoid",
            "reversalVoid",
            "authOnly"
        )) {
            if (tx.containsKey(flag) && tx[flag].toString() != "false") {
                return reject("CONTRADICTORY_TRANSACTION_FLAG_$flag")
            }
        }

        val status = string(tx, "status")
        val action = string(tx, "action")
        val processor = tx["processorResponse"] as? JsonObject
        val processorStatus = processor?.let {
            string(it, "status")
        }

        // Log only bounded, known status classifications.
        // Unknown provider values are never trusted as success.
        logger.info(
            "Poynt original capture status check statusClass={} actionClass={} processorClass={}",
            classifyStatus(status),
            classifyAction(action),
            classifyProcessor(processorStatus)
        )

        return when (status) {
            "CAPTURED" -> {
                if (processorStatus == "Successful") {
                    logger.info(
                        "Poynt original capture independently verified"
                    )
                    Result.VERIFIED
                } else {
                    reject("PROCESSOR_STATUS_UNVERIFIED")
                }
            }

            "DECLINED", "VOIDED" -> {
                logger.info(
                    "Poynt original payment verified as not captured"
                )
                Result.NOT_CAPTURED
            }

            "PARTIALLY_REFUNDED", "REFUNDED" ->
                reject("PROVIDER_REFUND_STATE_REQUIRES_RECONCILIATION")

            else ->
                reject("UNRECOGNIZED_PROVIDER_STATUS")
        }
    }

    private fun classifyStatus(value: String?): String = when (value) {
        "CAPTURED" -> "CAPTURED"
        "DECLINED" -> "DECLINED"
        "VOIDED" -> "VOIDED"
        "AUTHORIZED" -> "AUTHORIZED"
        "PARTIALLY_REFUNDED" -> "PARTIALLY_REFUNDED"
        "REFUNDED" -> "REFUNDED"
        null -> "MISSING"
        else -> "OTHER"
    }

    private fun classifyAction(value: String?): String = when (value) {
        "SALE" -> "SALE"
        "CAPTURE" -> "CAPTURE"
        "AUTHORIZE" -> "AUTHORIZE"
        "REFUND" -> "REFUND"
        null -> "MISSING"
        else -> "OTHER"
    }

    private fun classifyProcessor(value: String?): String = when (value) {
        "Successful" -> "Successful"
        "Failure" -> "Failure"
        null -> "MISSING"
        else -> "OTHER"
    }

    private fun string(obj: JsonObject, key: String): String? =
        (obj[key] as? JsonPrimitive)
            ?.takeIf { it.isString }
            ?.content

    private fun amount(obj: JsonObject, key: String): Long? =
        (obj[key] as? JsonPrimitive)
            ?.takeIf { !it.isString }
            ?.longOrNull
}
