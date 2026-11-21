package com.mynikatech.memgine.component.counter

import kotlinx.serialization.Serializable
import java.security.MessageDigest
import java.util.Base64

@Serializable
class CounterPickupQrRequest(val credential: String)

@Serializable
class CounterPickupReferenceRequest(val reference: String)

@Serializable
data class CounterPickupLookupResult(val code: String, val orderId: String? = null)

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
