package com.mynikatech.memgine.component.counter

import java.security.SecureRandom
import java.util.Base64
import java.time.Instant
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Secret must be identical on every application instance. No fallback and no logging. */
object PickupCodeSecurity {
    private val random = SecureRandom()
    private val secret: ByteArray by lazy {
        val encoded = System.getenv("MEMGINE_PICKUP_CODE_HMAC_KEY")
            ?: error("MEMGINE_PICKUP_CODE_HMAC_KEY is not configured")
        val bytes = Base64.getDecoder().decode(encoded)
        require(bytes.size >= 32) { "Pickup-code HMAC key must be at least 32 bytes" }
        bytes
    }

    fun newCode(): String = random.nextInt(1_000_000).toString().padStart(6, '0')

    /** Hour-bucketed to permit secure code reuse in future hours despite persistent unique token_hash history. */
    /** Stable store-scoped uniqueness digest for active codes; never indexed beyond active credentials. */
    fun scopeDigest(org: String, store: String, code: String): String {
        require(code.matches(Regex("[0-9]{6}"))) { "Expected a six-digit pickup code" }
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret, "HmacSHA256"))
        return mac.doFinal("MEMGINE:PICKUP_CODE_SCOPE:v1:$org:$store:$code".toByteArray(Charsets.US_ASCII))
            .joinToString("") { "%02x".format(it) }
    }

    fun digests(org: String, store: String, code: String): Pair<String, String> {
        val hour = Instant.now().epochSecond / 3600
        return digest(org, store, code, hour) to digest(org, store, code, hour - 1)
    }

    fun digest(org: String, store: String, code: String, utcHour: Long = Instant.now().epochSecond / 3600): String {
        require(code.matches(Regex("[0-9]{6}"))) { "Expected a six-digit pickup code" }
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret, "HmacSHA256"))
        return mac.doFinal("MEMGINE:PICKUP_CODE:v1:$org:$store:$utcHour:$code".toByteArray(Charsets.US_ASCII))
            .joinToString("") { "%02x".format(it) }
    }
}
