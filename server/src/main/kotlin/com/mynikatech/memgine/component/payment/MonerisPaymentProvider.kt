package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.config.PaymentConfig
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.slf4j.LoggerFactory
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Instant

data class MonerisPaymentResult(
    val paymentId: String?,
    val status: String,
    val failureCode: String? = null
)

/**
 * Moneris REST adapter. The only card-related value accepted is the short-lived
 * Hosted Tokenization token returned by the Moneris-controlled iframe.
 */
class MonerisPaymentProvider(
    private val config: PaymentConfig
) : PaymentProvider {

    override val code = "MONERIS"

    override val isAvailable: Boolean
        get() = config.monerisClientId.isNotBlank() &&
            config.monerisClientSecret.isNotBlank() &&
            config.monerisMerchantId.isNotBlank() &&
            config.monerisHostedTokenizationProfileId.isNotBlank()

    override fun canConfirm(status: String): Boolean = false

    override fun providerReference(
        paymentIntent: PaymentIntentDto,
        suppliedReference: String?
    ): String? = suppliedReference

    private val logger = LoggerFactory.getLogger(MonerisPaymentProvider::class.java)

    private val client = HttpClient.newBuilder().build()

    private val tokenLock = Any()

    @Volatile
    private var accessToken: CachedAccessToken? = null

    fun hostedTokenizationProfileId(): String {
        requireAvailable()
        return config.monerisHostedTokenizationProfileId
    }

    fun hostedTokenizationUrl(): String {
        requireAvailable()
        return config.monerisHostedTokenizationUrl
    }

    fun purchase(
        payment: PaymentIntentDto,
        temporaryToken: String
    ): MonerisPaymentResult {

        requireAvailable()

        if (temporaryToken.isBlank() || temporaryToken.length > 512) {
            throw BadRequestException("Moneris payment token is invalid")
        }

        val requestBody = buildJsonObject {
            // Moneris requires a 1-36 character idempotency key.
            // Memgine payment intent IDs are UUIDs.
            put("idempotencyKey", payment.paymentIntentId)

            put(
                "orderId",
                "mg_${payment.paymentIntentId.replace("-", "")}"
            )

            put(
                "amount",
                buildJsonObject {
                    put("amount", amountMinor(payment.amount))
                    put("currency", payment.currencyCode.uppercase())
                }
            )

            put(
                "paymentMethod",
                buildJsonObject {
                    put("paymentMethodSource", "TEMPORARY_TOKEN")
                    put("temporaryToken", temporaryToken)
                }
            )

            put("ecommerceIndicator", "AUTHENTICATED_ECOMMERCE")
            put("automaticCapture", true)
        }.toString()

        val maskedToken =
            if (temporaryToken.length > 6) {
                "${temporaryToken.take(6)}***"
            } else {
                "***"
            }

        val safeRequestBody =
            requestBody.replace(temporaryToken, maskedToken)

        logger.info(
            "Moneris request: paymentIntentId={}, baseUrl={}, merchantId={}, apiVersion={}, amountMinor={}, currency={}, tokenPrefix={}, tokenLength={}, body={}",
            payment.paymentIntentId,
            config.monerisBaseUrl,
            config.monerisMerchantId,
            config.monerisApiVersion,
            amountMinor(payment.amount),
            payment.currencyCode.uppercase(),
            temporaryToken.take(6),
            temporaryToken.length,
            safeRequestBody
        )

        var response = sendPayment(
            payment.paymentIntentId,
            requestBody,
            accessToken()
        )

        if (response.statusCode() == 401) {
            accessToken = null

            response = sendPayment(
                payment.paymentIntentId,
                requestBody,
                accessToken()
            )
        }

        val body = parseJson(response.body())
        if (response.statusCode() !in 200..299) {
            val safeResponseBody =
                response.body().replace(temporaryToken, maskedToken)

            logger.warn(
                "Moneris error response: httpStatus={}, paymentIntentId={}, headers={}, body={}",
                response.statusCode(),
                payment.paymentIntentId,
                response.headers().map(),
                safeResponseBody
            )
        }

        val paymentId = body.string("paymentId")
        val paymentStatus = body.string("paymentStatus")?.uppercase()

        val transactionDetails = body.objectValue("transactionDetails")

        val responseCode = transactionDetails?.string("responseCode")
        val isoResponseCode = transactionDetails?.string("isoResponseCode")
        val providerMessage = transactionDetails?.string("message")

        logger.info(
            "Moneris payment response: httpStatus={}, paymentIntentId={}, paymentId={}, paymentStatus={}, responseCode={}, isoResponseCode={}, message={}",
            response.statusCode(),
            payment.paymentIntentId,
            paymentId,
            paymentStatus,
            responseCode,
            isoResponseCode,
            providerMessage
        )

        if (
            response.statusCode() in 200..299 &&
            paymentStatus == "SUCCEEDED" &&
            !paymentId.isNullOrBlank()
        ) {
            return MonerisPaymentResult(
                paymentId = paymentId,
                status = "SUCCEEDED"
            )
        }

        if (
            paymentStatus in setOf(
                "DECLINED",
                "DECLINED_RETRY",
                "FAILED",
                "CANCELED"
            ) &&
            !paymentId.isNullOrBlank()
        ) {
            val failureCode = buildFailureCode(
                paymentStatus = paymentStatus,
                responseCode = responseCode,
                isoResponseCode = isoResponseCode
            )

            logger.warn(
                "Moneris payment declined: paymentIntentId={}, paymentId={}, paymentStatus={}, responseCode={}, isoResponseCode={}, message={}",
                payment.paymentIntentId,
                paymentId,
                paymentStatus,
                responseCode,
                isoResponseCode,
                providerMessage
            )

            return MonerisPaymentResult(
                paymentId = paymentId,
                status = "FAILED",
                failureCode = failureCode
            )
        }

        if (
            response.statusCode() in 400..499 &&
            !paymentId.isNullOrBlank()
        ) {
            val failureCode = buildFailureCode(
                paymentStatus = paymentStatus ?: "MONERIS_DECLINED",
                responseCode = responseCode,
                isoResponseCode = isoResponseCode
            )

            logger.warn(
                "Moneris payment rejected: httpStatus={}, paymentIntentId={}, paymentId={}, paymentStatus={}, responseCode={}, isoResponseCode={}, message={}",
                response.statusCode(),
                payment.paymentIntentId,
                paymentId,
                paymentStatus,
                responseCode,
                isoResponseCode,
                providerMessage
            )

            return MonerisPaymentResult(
                paymentId = paymentId,
                status = "FAILED",
                failureCode = failureCode
            )
        }

        if (
            response.statusCode() in 500..599 ||
            paymentStatus == "PROCESSING"
        ) {
            logger.warn(
                "Moneris payment uncertain: httpStatus={}, paymentIntentId={}, paymentId={}, paymentStatus={}, responseCode={}, isoResponseCode={}, message={}",
                response.statusCode(),
                payment.paymentIntentId,
                paymentId,
                paymentStatus,
                responseCode,
                isoResponseCode,
                providerMessage
            )

            throw ConflictException(
                "Moneris payment is still processing; check payment status before retrying"
            )
        }

        logger.warn(
            "Moneris payment not approved: httpStatus={}, paymentIntentId={}, paymentId={}, paymentStatus={}, responseCode={}, isoResponseCode={}, message={}",
            response.statusCode(),
            payment.paymentIntentId,
            paymentId,
            paymentStatus,
            responseCode,
            isoResponseCode,
            providerMessage
        )

        throw BadRequestException(
            buildNotApprovedMessage(
                httpStatus = response.statusCode(),
                paymentStatus = paymentStatus,
                responseCode = responseCode,
                isoResponseCode = isoResponseCode,
                providerMessage = providerMessage
            )
        )
    }

    private fun accessToken(): String {

        accessToken
            ?.takeIf {
                it.expiresAt.isAfter(
                    Instant.now().plusSeconds(60)
                )
            }
            ?.let {
                return it.value
            }

        synchronized(tokenLock) {

            accessToken
                ?.takeIf {
                    it.expiresAt.isAfter(
                        Instant.now().plusSeconds(60)
                    )
                }
                ?.let {
                    return it.value
                }

            val form = listOf(
                "grant_type" to "client_credentials",
                "client_id" to config.monerisClientId,
                "client_secret" to config.monerisClientSecret,
                "scope" to "payment.write"
            ).joinToString("&") { (key, value) ->
                "$key=${URLEncoder.encode(value, StandardCharsets.UTF_8)}"
            }

            val response = try {
                client.send(
                    HttpRequest.newBuilder(
                        URI.create(
                            "${config.monerisBaseUrl}/oauth2/token"
                        )
                    )
                        .header(
                            "Content-Type",
                            "application/x-www-form-urlencoded"
                        )
                        .header(
                            "Accept",
                            "application/json"
                        )
                        .POST(
                            HttpRequest.BodyPublishers.ofString(form)
                        )
                        .build(),
                    HttpResponse.BodyHandlers.ofString()
                )
            } catch (_: Exception) {
                throw ConflictException(
                    "Moneris authentication is unavailable"
                )
            }

            val body = parseJson(response.body())

            val value = body.string("access_token")
            val expiresIn =
                body.string("expires_in")?.toLongOrNull()

            if (
                response.statusCode() !in 200..299 ||
                value.isNullOrBlank() ||
                expiresIn == null
            ) {
                throw ConflictException(
                    "Moneris authentication is unavailable"
                )
            }

            return value.also {
                accessToken = CachedAccessToken(
                    value = it,
                    expiresAt = Instant.now()
                        .plusSeconds(expiresIn)
                )
            }
        }
    }

    private fun sendPayment(
        paymentIntentId: String,
        requestBody: String,
        token: String
    ): HttpResponse<String> = try {

        client.send(
            HttpRequest.newBuilder(
                URI.create("${config.monerisBaseUrl}/payments")
            )
                .header(
                    "Authorization",
                    "Bearer $token"
                )
                .header(
                    "Content-Type",
                    "application/json"
                )
                .header(
                    "Accept",
                    "application/json"
                )
                .header(
                    "Api-Version",
                    config.monerisApiVersion
                )
                .header(
                    "X-Merchant-Id",
                    config.monerisMerchantId
                )
                .header(
                    "X-Correlation-Id",
                    paymentIntentId
                )
                .POST(
                    HttpRequest.BodyPublishers.ofString(requestBody)
                )
                .build(),
            HttpResponse.BodyHandlers.ofString()
        )

    } catch (_: Exception) {
        throw ConflictException(
            "Moneris payment could not be processed"
        )
    }

    private fun parseJson(value: String): JsonObject = try {
        Json.parseToJsonElement(value).jsonObject
    } catch (_: Exception) {
        buildJsonObject { }
    }

    private fun JsonObject.string(name: String): String? =
        (this[name] as? JsonPrimitive)
            ?.content
            ?.takeUnless { it == "null" }

    private fun JsonObject.objectValue(name: String): JsonObject? =
        this[name] as? JsonObject

   private fun buildFailureCode(
    paymentStatus: String?,
    responseCode: String?,
    isoResponseCode: String?
): String =
    listOfNotNull(
        paymentStatus,
        responseCode?.let { "RESP_$it" },
        isoResponseCode?.let { "ISO_$it" }
    ).joinToString("|")

    private fun buildNotApprovedMessage(
        httpStatus: Int,
        paymentStatus: String?,
        responseCode: String?,
        isoResponseCode: String?,
        providerMessage: String?
    ): String {
        val details = listOfNotNull(
            paymentStatus?.let { "status=$it" },
            responseCode?.let { "responseCode=$it" },
            isoResponseCode?.let {
                "isoResponseCode=$it"
            },
            providerMessage?.takeIf {
                it.isNotBlank()
            }?.let {
                "message=$it"
            }
        ).joinToString(", ")

        return if (details.isBlank()) {
            "Moneris payment was not approved " +
                "(HTTP $httpStatus)"
        } else {
            "Moneris payment was not approved: $details"
        }
    }

    private fun amountMinor(amount: Double): Long = try {
        BigDecimal
            .valueOf(amount)
            .movePointRight(2)
            .setScale(
                0,
                RoundingMode.UNNECESSARY
            )
            .longValueExact()
    } catch (_: ArithmeticException) {
        throw BadRequestException(
            "Payment amount is invalid"
        )
    }

    private fun requireAvailable() {
        if (!isAvailable) {
            throw BadRequestException(
                "Moneris payment provider is not configured"
            )
        }
    }

    private data class CachedAccessToken(
        val value: String,
        val expiresAt: Instant
    )
}