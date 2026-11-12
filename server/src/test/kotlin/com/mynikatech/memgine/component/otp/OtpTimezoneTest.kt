package com.mynikatech.memgine.component.otp

import com.mynikatech.memgine.component.notification.ExternalNotificationPublisher
import com.mynikatech.memgine.component.notification.NotificationDispatchService
import com.mynikatech.memgine.component.notification.NotificationDispatchSql
import com.mynikatech.memgine.component.notification.NotificationEvent
import com.mynikatech.memgine.component.notification.NotificationService
import com.mynikatech.memgine.component.notification.NotificationSql
import com.mynikatech.memgine.config.OtpConfig
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.security.PhoneNormalizer
import java.security.SecureRandom
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import org.postgresql.util.PSQLException
import org.postgresql.util.ServerErrorMessage

/** UTC-003 deterministic service coverage; no notification provider is contacted. */
class OtpTimezoneTest {
    @Test
    fun `UTC-003 OTP lifetime is computed from the fixed UTC clock across Toronto DST boundaries`() {
        listOf(
            Instant.parse("2027-01-15T12:00:00Z"),
            Instant.parse("2027-07-15T12:00:00Z"),
            Instant.parse("2027-03-14T07:00:00Z"),
            Instant.parse("2027-11-07T06:00:00Z")
        ).forEach { instant ->
            val sql = FakeOtpSql()
            val requested = service(sql, instant).request("+14165552671", "CA", OtpPurpose.LOGIN)
            assertEquals(instant.plusSeconds(300).atOffset(ZoneOffset.UTC).toLocalDateTime().toString(), requested.expiresAt)
            assertEquals(instant.plusSeconds(30).atOffset(ZoneOffset.UTC).toLocalDateTime().toString(), requested.resendAt)
            assertNotNull(requested.devCode)
        }
    }

    @Test
    fun `UTC-003 OTP verifies before expiry and rejects at the exact expiry instant`() {
        val issuedAt = Instant.parse("2027-03-14T06:59:00Z")
        val sql = FakeOtpSql()
        val issued = service(sql, issuedAt).request("+14165552671", "CA", OtpPurpose.LOGIN)

        val beforeExpiry = service(sql, issuedAt.plusSeconds(299))
        assertEquals("+14165552671", beforeExpiry.verify(issued.challengeId, issued.devCode!!, OtpPurpose.LOGIN).destination)

        val expiredSql = FakeOtpSql()
        val expired = service(expiredSql, issuedAt).request("+14165552671", "CA", OtpPurpose.LOGIN)
        assertFailsWith<BadRequestException> {
            service(expiredSql, issuedAt.plusSeconds(300))
                .verify(expired.challengeId, expired.devCode!!, OtpPurpose.LOGIN)
        }
    }

    @Test
    fun `UTC-003 cooldown is surfaced and resend succeeds after the database permits it`() {
        val sql = FakeOtpSql().apply { cooldownActive = true }
        assertFailsWith<ConflictException> {
            service(sql, Instant.parse("2027-07-15T12:00:00Z"))
                .request("+14165552671", "CA", OtpPurpose.LOGIN)
        }

        sql.cooldownActive = false
        val retried = service(sql, Instant.parse("2027-07-15T12:00:30Z"))
            .request("+14165552671", "CA", OtpPurpose.LOGIN)
        assertNotNull(retried.devCode)
    }

    @Test
    fun `UTC-003 already consumed or expired OTP cannot be verified again`() {
        val issuedAt = Instant.parse("2027-01-15T12:00:00Z")
        val sql = FakeOtpSql()
        val issued = service(sql, issuedAt).request("+14165552671", "CA", OtpPurpose.LOGIN)
        sql.consumeResult = false
        assertFailsWith<BadRequestException> {
            service(sql, issuedAt.plusSeconds(1)).verify(issued.challengeId, issued.devCode!!, OtpPurpose.LOGIN)
        }
    }

    @Test
    fun `UTC-003 maximum failures lock a pending OTP without any external delivery`() {
        val issuedAt = Instant.parse("2027-01-15T12:00:00Z")
        val sql = FakeOtpSql().apply { failedAttempts = 3 }
        val issued = service(sql, issuedAt).request("+14165552671", "CA", OtpPurpose.LOGIN)

        assertFailsWith<ForbiddenException> {
            service(sql, issuedAt.plusSeconds(1)).verify(issued.challengeId, "000000", OtpPurpose.LOGIN)
        }
    }

    @Test
    fun `UTC-003 latest SQL defines UTC-local comparisons for creation cooldown and consumption`() {
        val creationSql = java.nio.file.Files.readString(
            java.nio.file.Path.of("..", "DB", "liquibase", "sql", "071-otp-consumed-cooldown-fix.sql")
        )
        val consumptionSql = java.nio.file.Files.readString(
            java.nio.file.Path.of("..", "DB", "liquibase", "sql", "062-otp-utc-timestamps.sql")
        )
        assertTrue(creationSql.contains("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'"))
        assertTrue(creationSql.contains("make_interval(secs => p_cooldown_seconds)"))
        assertTrue(consumptionSql.contains("c.expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')"))
    }

    private fun service(sql: FakeOtpSql, instant: Instant): OtpService {
        val config = OtpConfig(
            environment = "dev", provider = "DEV", pepper = "timezone-test-pepper",
            ttlSeconds = 300, cooldownSeconds = 30, maxAttempts = 3,
            allowedRegions = setOf("CA"), awsRegion = "ca-central-1",
            awsConfigurationSet = "", awsCanadaOriginationIdentity = "",
            allowLiveSms = false, notificationEventsTopicArn = "",
            whatsappTemplateName = "", whatsappTemplateLanguage = "en"
        )
        return OtpService(
            sql = sql,
            phoneNormalizer = PhoneNormalizer(),
            providerRouter = OtpProviderRouter(config, object : OtpProvider {
                override val providerCode = "TEST"
                override fun supports(regionCode: String, channel: OtpChannel) = regionCode == "CA" && channel == OtpChannel.SMS
                override fun send(delivery: OtpDelivery) = OtpDeliveryResult(providerCode, delivery.code)
            }, null),
            config = config,
            notificationDispatch = noNotifications(),
            clock = Clock.fixed(instant, ZoneOffset.UTC),
            random = SecureRandom()
        )
    }

    private fun noNotifications() = NotificationDispatchService(
        sql = object : NotificationDispatchSql { override fun settings(organizationId: String) = null },
        notifications = NotificationService(object : NotificationSql {
            override fun create(id: String, organizationId: String?, recipientId: String, eventType: String, title: String, message: String, context: String?) = true
            override fun list(recipientId: String, limit: Int, offset: Int) = emptyList<com.mynikatech.memgine.net.dto.NotificationDto>()
            override fun unread(recipientId: String) = 0
            override fun markRead(id: String, recipientId: String) = false
            override fun markAllRead(recipientId: String) = 0
        }),
        externalPublisher = object : ExternalNotificationPublisher {
            override fun publish(event: NotificationEvent, channels: Set<com.mynikatech.memgine.component.notification.NotificationChannel>) = Unit
        }
    )

    private class FakeOtpSql : OtpSql {
        private var row: OtpChallengeRow? = null
        var cooldownActive = false
        var consumeResult = true
        var failedAttempts = 1

        override fun create(challengeId: String, destination: String, destinationRegion: String?, purpose: String, channel: String, provider: String, otpHash: String, otpSalt: String, contextJson: String?, expiresAt: String, maxAttempts: Int, cooldownSeconds: Int): String {
            if (cooldownActive) {
                throw PSQLException(
                    ServerErrorMessage("SERROR\u0000CP0001\u0000MOTP request cooldown is active\u0000\u0000")
                )
            }
            row = OtpChallengeRow(
                challengeId = challengeId, destination = destination, purpose = purpose,
                channel = channel, providerCode = provider, otpHash = otpHash, otpSalt = otpSalt,
                status = "PENDING", failedAttemptCount = 0, maxAttemptCount = maxAttempts,
                expiresAt = expiresAt
            )
            return java.time.LocalDateTime.parse(expiresAt)
                .minusSeconds((300 - cooldownSeconds).toLong())
                .toString()
        }
        override fun get(challengeId: String) = row?.takeIf { it.challengeId == challengeId }
        override fun recordFailure(challengeId: String) = failedAttempts
        override fun consume(challengeId: String, purpose: String) = consumeResult
        override fun markDeliveryFailed(challengeId: String) = false
        override fun organizationChannel(organizationId: String) = "SMS"
        override fun recipient(destination: String) = null
        override fun userDeliveryMode(userId: String) = "MOCK"
    }
}
