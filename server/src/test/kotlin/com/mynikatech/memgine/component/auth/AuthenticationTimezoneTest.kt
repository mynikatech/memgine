package com.mynikatech.memgine.component.auth

import com.mynikatech.memgine.component.notification.ExternalNotificationPublisher
import com.mynikatech.memgine.component.notification.NotificationDispatchService
import com.mynikatech.memgine.component.notification.NotificationDispatchSql
import com.mynikatech.memgine.component.notification.NotificationEvent
import com.mynikatech.memgine.component.notification.NotificationService
import com.mynikatech.memgine.component.notification.NotificationSql
import com.mynikatech.memgine.component.otp.DevOtpProvider
import com.mynikatech.memgine.component.otp.OtpProviderRouter
import com.mynikatech.memgine.component.otp.OtpService
import com.mynikatech.memgine.config.AuthenticationConfig
import com.mynikatech.memgine.config.OtpConfig
import com.mynikatech.memgine.net.dto.PasswordLoginRequest
import com.mynikatech.memgine.security.PhoneNormalizer
import de.mkammerer.argon2.Argon2Factory
import java.time.Clock
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * UTC-002 unit coverage. PostgreSQL timezone-specific behaviour is covered by
 * [com.mynikatech.memgine.component.role.RbacTimezoneIntegrationTest] when its
 * explicitly guarded DEV integration environment is supplied.
 */
class AuthenticationTimezoneTest {
    @Test
    fun `UTC-002 session creation uses the supplied UTC clock at winter summer and DST instants`() {
        listOf(
            Instant.parse("2027-01-15T15:00:00Z"),
            Instant.parse("2027-07-15T15:00:00Z"),
            Instant.parse("2027-03-14T07:00:00Z"),
            Instant.parse("2027-11-07T06:00:00Z")
        ).forEach { instant ->
            val sql = FakeAuthenticationSql()
            val service = service(sql, Clock.fixed(instant, ZoneOffset.UTC))

            service.passwordLogin(
                PasswordLoginRequest(phone = "+14165552671", regionCode = "CA", password = "ValidPassword1"),
                clientIp = null,
                userAgent = null
            )

            assertEquals(
                LocalDateTime.ofInstant(instant, ZoneOffset.UTC).plusMinutes(30).toString(),
                sql.createdExpiry,
                "session expiry must be derived from the same absolute instant in UTC"
            )
        }
    }

    @Test
    fun `UTC-002 expiry boundary is exclusive and therefore valid only before its exact instant`() {
        val expiry = LocalDateTime.parse("2027-03-14T07:00:00")
        assertTrue(expiry.isAfter(LocalDateTime.parse("2027-03-14T06:59:59")))
        assertFalse(expiry.isAfter(expiry))
        assertFalse(expiry.isAfter(LocalDateTime.parse("2027-03-14T07:00:01")))
    }

    @Test
    fun `UTC-002 password lock expires at its exact fixed clock instant`() {
        val lockedUntil = "2027-11-07T06:00:00"
        val atBoundary = FakeAuthenticationSql(lockedUntil = lockedUntil)
        val beforeBoundary = FakeAuthenticationSql(lockedUntil = lockedUntil)

        assertFailsWith<com.mynikatech.memgine.exception.UnauthorizedException> {
            service(beforeBoundary, Clock.fixed(Instant.parse("2027-11-07T05:59:59Z"), ZoneOffset.UTC))
                .passwordLogin(loginRequest(), null, null)
        }

        service(atBoundary, Clock.fixed(Instant.parse("2027-11-07T06:00:00Z"), ZoneOffset.UTC))
            .passwordLogin(loginRequest(), null, null)
        assertEquals("2027-11-07T06:30", atBoundary.createdExpiry)
    }

    @Test
    fun `UTC-002 SQL contract records the session expiry comparison for PostgreSQL integration verification`() {
        val sql = java.nio.file.Files.readString(
            java.nio.file.Path.of("..", "DB", "liquibase", "sql", "061-core-authentication-otp.sql")
        )

        assertTrue(sql.contains("CREATE OR REPLACE FUNCTION \"\${schemaName}\".auth_resolve_session"))
        assertTrue(sql.contains("s.expires_at > CURRENT_TIMESTAMP"))
        assertTrue(sql.contains("s.revoked_at IS NULL"))
        assertTrue(sql.contains("CREATE OR REPLACE FUNCTION \"\${schemaName}\".auth_revoke_session"))
        assertTrue(sql.contains("SET revoked_at = CURRENT_TIMESTAMP"))
    }

    private fun loginRequest() = PasswordLoginRequest(
        phone = "+14165552671", regionCode = "CA", password = "ValidPassword1"
    )

    private fun service(sql: FakeAuthenticationSql, clock: Clock): AuthenticationService =
        AuthenticationService(
            sql = sql,
            otpService = unusedOtpService(),
            phoneNormalizer = PhoneNormalizer(),
            config = AuthenticationConfig(
                sessionDurationMinutes = 30,
                customerSessionDurationDays = 30,
                posDeviceCookieName = "pos",
                posDeviceCookieDays = 30,
                posPinMaxAttempts = 5,
                posPinLockMinutes = 15,
                cookieName = "session",
                secureCookie = false,
                passwordMinimumLength = 8,
                environment = "test"
            ),
            clock = clock
        )

    private fun unusedOtpService(): OtpService {
        val config = OtpConfig(
            environment = "dev", provider = "DEV", pepper = "test-pepper",
            ttlSeconds = 300, cooldownSeconds = 30, maxAttempts = 5,
            allowedRegions = setOf("CA"), awsRegion = "ca-central-1",
            awsConfigurationSet = "", awsCanadaOriginationIdentity = "",
            allowLiveSms = false, notificationEventsTopicArn = "",
            whatsappTemplateName = "", whatsappTemplateLanguage = "en"
        )
        return OtpService(
            sql = object : com.mynikatech.memgine.component.otp.OtpSql {
                override fun create(challengeId: String, destination: String, destinationRegion: String?, purpose: String, channel: String, provider: String, otpHash: String, otpSalt: String, contextJson: String?, expiresAt: String, maxAttempts: Int, cooldownSeconds: Int): String = error("unused")
                override fun get(challengeId: String) = null
                override fun recordFailure(challengeId: String) = 0
                override fun consume(challengeId: String, purpose: String) = false
                override fun markDeliveryFailed(challengeId: String) = false
                override fun organizationChannel(organizationId: String) = "SMS"
                override fun recipient(destination: String) = null
                override fun userDeliveryMode(userId: String) = "MOCK"
            },
            phoneNormalizer = PhoneNormalizer(),
            providerRouter = OtpProviderRouter(config, DevOtpProvider("dev"), null),
            config = config,
            notificationDispatch = NotificationDispatchService(
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
        )
    }

    private class FakeAuthenticationSql(lockedUntil: String? = null) : AuthenticationSql {
        private val passwordHash = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2id)
            .hash(3, 65_536, 1, "ValidPassword1".toCharArray())
        var createdExpiry: String? = null
        private val identity = AuthIdentityRow(
            userId = "tz-auth-user", displayName = "Timezone User", passwordHash = passwordHash,
            passwordEnabled = true, lockedUntil = lockedUntil, userActive = true
        )
        override fun identity(phone: String) = identity
        override fun recordPasswordFailure(userId: String) = true
        override fun recordPasswordSuccess(userId: String) = true
        override fun setPassword(userId: String, passwordHash: String, actorUserId: String) = true
        override fun createSession(sessionId: String, userId: String, tokenHash: String, expiresAt: String, clientIp: String?, userAgent: String?): Boolean {
            createdExpiry = expiresAt
            return true
        }
        override fun resolveSession(tokenHash: String) = null
        override fun revokeSession(tokenHash: String, userId: String) = true
        override fun deleteCustomerAccount(userId: String) = false
        override fun customerAccountDeletionPreview(userId: String) = CustomerAccountDeletionPreviewRow()
        override fun customerAccountDeletionActiveSubscriptions(userId: String) = emptyList<CustomerAccountDeletionActiveSubscriptionRow>()
        override fun access(userId: String) = listOf(AuthAccessRow(roleCode = "ORG_ADMIN", capabilityCode = "ORG_ADMIN_ACCESS"))
        override fun passwordConfigured(userId: String) = true
        override fun posContext(sessionId: String) = null
        override fun registerCustomerUser(phone: String, firstName: String, lastName: String, primaryEmail: String?) = null
        override fun debugConnection() = "test"
    }
}
