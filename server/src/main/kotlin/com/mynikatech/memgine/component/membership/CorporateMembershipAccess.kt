package com.mynikatech.memgine.component.membership

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import org.jdbi.v3.core.Handle
import org.jdbi.v3.core.Jdbi
import java.security.SecureRandom
import javax.crypto.Mac
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import com.mynikatech.memgine.exception.ApiException
import io.ktor.http.HttpStatusCode
import org.postgresql.util.PSQLException

/** Corporate code handling is deliberately kept outside public membership DTOs. */
class CorporateMembershipAccess(private val jdbi: Jdbi) {
    private val random = SecureRandom()

    private val encryptionKey: SecretKeySpec by lazy {
        val encoded = System.getenv("MEMGINE_CORPORATE_ACCESS_KEY_B64")
            ?: error("MEMGINE_CORPORATE_ACCESS_KEY_B64 must be configured to use Corporate codes")
        val bytes = Base64.getDecoder().decode(encoded)
        require(bytes.size == 32) { "Corporate code encryption key must contain exactly 32 bytes" }
        SecretKeySpec(bytes, "AES")
    }

    /**
     * Derive an independent HMAC key from the configured 256-bit master key.
     * The database only receives the resulting verifier, not the six-digit code.
     */
    private val verifierKey: ByteArray by lazy {
        val master = Mac.getInstance("HmacSHA256")
        master.init(SecretKeySpec(encryptionKey.encoded, "HmacSHA256"))
        master.doFinal("memgine/corporate-code/verifier/v1".toByteArray(Charsets.UTF_8))
    }

    private fun verifier(org: String, product: String, code: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(verifierKey, "HmacSHA256"))
        val payload = "memgine/corporate-code/v1:$org:$product:$code"
        return mac.doFinal(payload.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }

    private fun encrypt(code: String): String {
        val iv = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey, GCMParameterSpec(128, iv))
        return Base64.getEncoder().encodeToString(iv + cipher.doFinal(code.toByteArray(Charsets.UTF_8)))
    }

    private fun decrypt(value: String): String {
        val payload = Base64.getDecoder().decode(value)
        require(payload.size >= 29) { "Invalid Corporate code ciphertext" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey, GCMParameterSpec(128, payload.copyOfRange(0, 12)))
        return String(cipher.doFinal(payload.copyOfRange(12, payload.size)), Charsets.UTF_8)
    }

    fun generate(organizationId: String, adminUserId: String): String {
        val allowed = jdbi.withHandle<Boolean, Exception> { handle ->
            handle.createQuery("SELECT can_administer_organization(:org, :actor)")
                .bind("org", organizationId).bind("actor", adminUserId)
                .mapTo(Boolean::class.java).one()
        }
        if (!allowed) throw ForbiddenException("Not authorized to administer membership")
        return random.nextInt(1_000_000).toString().padStart(6, '0')
    }

    fun view(organizationId: String, productId: String, adminUserId: String): String? {
        val encrypted = jdbi.withHandle<String?, Exception> { handle ->
            handle.createQuery("SELECT corporate_membership_admin_code(:org, :product, :actor)")
                .bind("org", organizationId).bind("product", productId)
                .bind("actor", adminUserId).mapTo(String::class.java).findOne().orElse(null)
        }
        return encrypted?.let(::decrypt)
    }

    /** Call only inside the same JDBI transaction that persists the product. */
    fun saveOnProductTransaction(handle: Handle, org: String, product: String, actor: String, code: String) {
        if (!Regex("^[0-9]{6}$").matches(code)) {
            throw BadRequestException("Corporate access code must contain exactly six digits")
        }
        handle.createQuery("SELECT corporate_membership_set_code(:org, :product, :actor, :code, :encrypted)")
            .bind("org", org).bind("product", product).bind("actor", actor)
            .bind("code", verifier(org, product, code)).bind("encrypted", encrypt(code))
            .mapTo(Boolean::class.java).one()
    }

    fun hasCode(org: String, productId: String): Boolean =
        jdbi.withHandle<Boolean, Exception> { handle ->
            handle.createQuery("SELECT corporate_membership_has_code(:org, :product)")
                .bind("org", org).bind("product", productId)
                .mapTo(Boolean::class.java).one()
        }

    /**
     * Explicit preflight for all NEW payment starts. Existing payment recovery
     * must be resolved before invoking this check.
     *
     * For atomic enforcement, the same SQL function must also be invoked
     * INSIDE each authoritative payment-start SQL function before new intent creation.
     */
    fun requirePaymentAccess(org: String, planId: String, customerUserId: String) {
        jdbi.withHandle<Boolean, Exception> { handle ->
            handle.createQuery(
                "SELECT corporate_membership_require_access(:org, :plan, :customer)"
            ).bind("org", org)
                .bind("plan", planId)
                .bind("customer", customerUserId)
                .mapTo(Boolean::class.java)
                .one()
        }
    }

    fun isCorporateType(typeId: String): Boolean =
        jdbi.withHandle<Boolean, Exception> { handle ->
            handle.createQuery("SELECT EXISTS(SELECT 1 FROM product_types WHERE product_type_id=:type AND product_type_code='CORPORATE')")
                .bind("type", typeId).mapTo(Boolean::class.java).one()
        }

    /** Customer identity must come from the authenticated principal or validated counter context. */

    /** Verify a Corporate code with a clear response when rate limited. */
    fun verify(
        org: String,
        product: String,
        customerUserId: String,
        code: String
    ): Boolean {
        if (!Regex("^[0-9]{6}$").matches(code)) {
            return false
        }

        try {
            return jdbi.withHandle<Boolean, Exception> { handle ->
                handle.createQuery(
                    "SELECT corporate_membership_verify_code(:org,:product,:customer,:code)"
                )
                    .bind("org", org)
                    .bind("product", product)
                    .bind("customer", customerUserId)
                    .bind("code", verifier(org, product, code))
                    .mapTo(Boolean::class.java)
                    .one()
            }
        } catch (error: Exception) {
            // JDBI can wrap a PostgreSQL exception. Inspect the cause
            // chain, but recognize ONLY this explicit SQL lockout.
            val rateLimited = generateSequence(
                error as Throwable?
            ) { it.cause }
                .filterIsInstance<PSQLException>()
                .any { sqlError ->
                    sqlError.sqlState == "42501" &&
                        sqlError.serverErrorMessage?.message ==
                            "Too many Corporate code attempts"
                }

            if (rateLimited) {
                throw ApiException(
                    HttpStatusCode.TooManyRequests,
                    "CORPORATE_CODE_RATE_LIMITED",
                    "Too many incorrect Corporate access code attempts. " +
                        "Please try again when the 15-minute verification window expires."
                )
            }

            // Preserve all other existing exception behavior.
            throw error
        }
    }

}
