package com.mynikatech.memgine.component.counter

import kotlinx.serialization.Serializable

import java.security.MessageDigest
import java.util.Base64

@Serializable
data class CounterCollectionExtensionRequest(val version: Int, val action: String, val requestId: String? = null, val localTime: String? = null, val reason: String? = null)

@Serializable
class CounterPickupQrRequest(val credential: String)

@Serializable
class CounterPickupCodeRequest(val code: String, val expectedOrderId: String? = null)

@Serializable
class CounterPickupReferenceRequest(val reference: String)

@Serializable
data class CounterPickupLookupResult(
    val code: String,
    val orderId: String? = null,
    val transactionId: String? = null,
    val transactionNumber: String? = null,
    val status: String? = null,
    val expiresAt: String? = null
)

@Serializable
class CounterOrderNoShowRequest(val version: Int, val reason: String)

@Serializable
class CounterOrderCancellationRequest(val version: Int, val reason: String)

@Serializable
class CounterOrderTransitionRequest(val version: Int)

@Serializable
class CounterOrderCollectionRequest(val version: Int, val credential: String? = null)

@Serializable
data class CounterOrderActionResult(val code: String)

@Serializable
class CounterOrderPickupOtpRequest(val version: Int, val challengeId: String, val otp: String)

@Serializable
data class CounterOrderPickupChallenge(val challengeId: String)

@Serializable
class CounterOrderTerminalRecoveryRequest(val version: Int, val paymentAttemptId: String, val confirmedNoSuccessfulPayment: Boolean)

enum class CounterOrderCommand {
    START_PREPARING, MARK_READY, COMPLETE_COLLECTION, AUTHORIZE_PICKUP_QR, AUTHORIZE_PICKUP_OTP, AUTHORIZE_PICKUP_ASSISTED,
    START_CASH, CONFIRM_CASH, LINK_SUPPORT, REQUEST_CANCELLATION, REPORT_NO_SHOW
}

private val pickupPayload = Regex("^MEMGINE_PICKUP:([A-Za-z0-9_-]{43})$")
private val orderReference = Regex("^[A-Za-z0-9_-]{1,64}$")

internal fun counterPickupDigest(value: String): String? {
    val token = pickupPayload.matchEntire(value.trim())?.groupValues?.get(1) ?: return null
    val bytes = Base64.getUrlDecoder().decode(token)
    if (bytes.size != 32 || Base64.getUrlEncoder().withoutPadding().encodeToString(bytes) != token) return null
    return MessageDigest.getInstance("SHA-256").digest(token.toByteArray(Charsets.US_ASCII)).joinToString("") { "%02x".format(it) }
}

internal fun counterPickupOrderReference(value: String): String? =
    value.trim().removePrefix("#").takeIf(orderReference::matches)
