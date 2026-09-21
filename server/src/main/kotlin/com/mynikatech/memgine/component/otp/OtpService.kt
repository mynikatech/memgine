package com.mynikatech.memgine.component.otp

import com.mynikatech.memgine.config.OtpConfig
import com.mynikatech.memgine.component.notification.NotificationChannel
import com.mynikatech.memgine.component.notification.NotificationDestination
import com.mynikatech.memgine.component.notification.NotificationDispatchService
import com.mynikatech.memgine.component.notification.NotificationEvent
import com.mynikatech.memgine.component.notification.NotificationTemplate
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
    private val notificationDispatch: NotificationDispatchService,
    private val clock: Clock = Clock.systemUTC(),
    private val random: SecureRandom = SecureRandom()
) {
    fun request(
        phone: String,
        regionCode: String?,
        purpose: OtpPurpose,
        channel: OtpChannel = OtpChannel.SMS,
        contextJson: String? = null, organizationId: String? = null, recipientUserId: String? = null
    ): OtpRequestResult {
        val canonical = phoneNormalizer.normalize(phone, regionCode)
        val preferredChannel = organizationId?.let { OtpChannel.valueOf(sql.organizationChannel(it)) } ?: OtpChannel.SMS
        val recipient = sql.recipient(canonical.e164)
        val resolvedChannel = when (preferredChannel) {
            OtpChannel.EMAIL -> if (recipient?.email.isNullOrBlank()) OtpChannel.SMS else OtpChannel.EMAIL
            OtpChannel.WHATSAPP -> if (config.whatsappTemplateName.isBlank()) OtpChannel.SMS else OtpChannel.WHATSAPP
            OtpChannel.SMS -> OtpChannel.SMS
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
                channel = resolvedChannel.name, provider = "NOTIFICATION_PIPELINE", otpHash = otpHash,
                otpSalt = salt, contextJson = contextJson, expiresAt = expiresAt.toString(),
                maxAttempts = config.maxAttempts, cooldownSeconds = config.cooldownSeconds
            )
        } catch (error: Exception) {
            val postgres = postgres(error)
            if (postgres?.sqlState == "P0001") throw ConflictException("Please wait before requesting another code")
            throw error
        }

        val delivered = try {
            deliverThroughNotificationPipeline(organizationId, recipientUserId, recipient, canonical.e164, purpose, resolvedChannel, code, challengeId)
        } catch (error: Exception) {
            sql.markDeliveryFailed(challengeId)
            throw ConflictException("Verification code could not be delivered. Please try again later")
        }
        return OtpRequestResult(
            challengeId, expiresAt.toString(), resendAt,
            canonical.e164, delivered.devCode
        )
    }

    private fun deliverThroughNotificationPipeline(organizationId: String?, recipientUserId: String?, recipient: OtpDeliveryRecipient?, phone: String, purpose: OtpPurpose, channel: OtpChannel, code: String, challengeId: String): OtpDeliveryResult {
        val event = NotificationEvent(
            eventType = "OTP_${purpose.name}", organizationId = organizationId,
            recipientUserId = recipientUserId ?: recipient?.userId,
            channels = setOf(NotificationChannel.valueOf(channel.name)),
            title = "Memgine verification code", message = "Your Memgine verification code is $code. It expires shortly.",
            email = if (channel == OtpChannel.EMAIL) recipient?.email?.takeIf { it.isNotBlank() }?.let(::NotificationDestination) ?: throw IllegalStateException("Email OTP delivery requires an email address") else null,
            whatsapp = if (channel == OtpChannel.WHATSAPP) NotificationDestination(phone) else null,
            whatsappTemplate = if (channel == OtpChannel.WHATSAPP) config.whatsappTemplateName.takeIf { it.isNotBlank() }?.let { NotificationTemplate(it, config.whatsappTemplateLanguage, listOf(code)) } ?: throw IllegalStateException("WhatsApp OTP template is not configured") else null,
            sms = if (channel == OtpChannel.SMS) NotificationDestination(phone) else null,
            correlationId = challengeId
        )
        notificationDispatch.dispatch(event, applyOrganizationChannelSettings = false)
        return OtpDeliveryResult("NOTIFICATION_PIPELINE")
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
