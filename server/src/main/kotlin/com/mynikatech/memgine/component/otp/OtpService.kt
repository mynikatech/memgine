package com.mynikatech.memgine.component.otp

import com.mynikatech.memgine.config.OtpConfig
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.security.PhoneNormalizer
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Clock
import java.time.LocalDateTime
import java.util.HexFormat
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import org.postgresql.util.PSQLException

class OtpService(
    private val sql: OtpSql,
    private val phoneNormalizer: PhoneNormalizer,
    private val providerRouter: OtpProviderRouter,
    private val config: OtpConfig,
    private val clock: Clock = Clock.systemUTC(),
    private val random: SecureRandom = SecureRandom()
) {
    fun request(
        phone: String,
        regionCode: String?,
        purpose: OtpPurpose,
        channel: OtpChannel = OtpChannel.SMS,
        contextJson: String? = null
    ): OtpRequestResult {
        if (channel != OtpChannel.SMS) throw BadRequestException("OTP delivery channel is unavailable")
        val canonical = phoneNormalizer.normalize(phone, regionCode)
        val provider = try {
            providerRouter.resolve(canonical.regionCode, channel)
        } catch (_: IllegalArgumentException) {
            throw BadRequestException("OTP delivery is unavailable for this country")
        }
        val challengeId = UUID.randomUUID().toString()
        val code = (random.nextInt(900_000) + 100_000).toString()
        val salt = randomBytes(24)
        val expiresAt = LocalDateTime.now(clock).plusSeconds(config.ttlSeconds)
        val otpHash = hash(challengeId, canonical.e164, purpose, code, salt)
        val resendAt = try {
            sql.create(
                challengeId = challengeId, destination = canonical.e164,
                destinationRegion = canonical.regionCode, purpose = purpose.name,
                channel = channel.name, provider = provider.providerCode, otpHash = otpHash,
                otpSalt = salt, contextJson = contextJson, expiresAt = expiresAt.toString(),
                maxAttempts = config.maxAttempts, cooldownSeconds = config.cooldownSeconds
            )
        } catch (error: Exception) {
            val postgres = postgres(error)
            if (postgres?.sqlState == "P0001") throw ConflictException("Please wait before requesting another code")
            throw error
        }

        val delivered = try {
            provider.send(OtpDelivery(canonical.e164, canonical.regionCode, purpose, channel, code))
        } catch (_: Exception) {
            sql.markDeliveryFailed(challengeId)
            throw ConflictException("Verification code could not be delivered. Please try again later")
        }
        return OtpRequestResult(
            challengeId, expiresAt.toString(), resendAt,
            canonical.e164, delivered.devCode
        )
    }

    fun verify(challengeId: String, otp: String, purpose: OtpPurpose): OtpVerificationResult {
        if (challengeId.isBlank() || challengeId.length > 64 || !otp.matches(Regex("^[0-9]{6}$"))) {
            throw BadRequestException("Verification code is invalid")
        }
        val row = sql.get(challengeId) ?: throw BadRequestException("Verification code is invalid or expired")
        if (row.purpose != purpose.name || row.status != "PENDING" ||
            row.failedAttemptCount >= row.maxAttemptCount ||
            !LocalDateTime.parse(row.expiresAt.replace(' ', 'T')).isAfter(LocalDateTime.now(clock))) {
            throw BadRequestException("Verification code is invalid or expired")
        }
        val candidate = hash(challengeId, row.destination, purpose, otp, row.otpSalt)
        if (!MessageDigest.isEqual(candidate.toByteArray(), row.otpHash.toByteArray())) {
            val attempts = sql.recordFailure(challengeId)
            if (attempts >= row.maxAttemptCount) throw ForbiddenException("Verification attempts exhausted")
            throw BadRequestException("Verification code is incorrect")
        }
        if (!sql.consume(challengeId, purpose.name)) {
            throw BadRequestException("Verification code is invalid or expired")
        }
        return OtpVerificationResult(row.destination)
    }

    private fun hash(
        challengeId: String, destination: String, purpose: OtpPurpose,
        code: String, saltHex: String
    ): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(config.pepper.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return HexFormat.of().formatHex(
            mac.doFinal("$challengeId|$destination|${purpose.name}|$saltHex|$code".toByteArray())
        )
    }

    private fun randomBytes(count: Int): String =
        ByteArray(count).also(random::nextBytes).let(HexFormat.of()::formatHex)

    private fun postgres(error: Throwable): PSQLException? =
        generateSequence(error) { it.cause }.filterIsInstance<PSQLException>().firstOrNull()
}
