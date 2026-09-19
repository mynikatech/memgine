package com.mynikatech.memgine.component.auth

import com.mynikatech.memgine.component.otp.OtpPurpose
import com.mynikatech.memgine.component.otp.OtpService
import com.mynikatech.memgine.config.AuthenticationConfig
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.UnauthorizedException
import com.mynikatech.memgine.net.dto.*
import com.mynikatech.memgine.security.AuthenticatedPrincipal
import com.mynikatech.memgine.security.PhoneNormalizer
import de.mkammerer.argon2.Argon2Factory
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Clock
import java.time.LocalDateTime
import java.util.Base64
import java.util.HexFormat
import java.util.UUID

data class CreatedAuthenticationSession(
    val token: String,
    val principal: AuthenticatedPrincipal
)

class AuthenticationService(
    private val sql: AuthenticationSql,
    private val otpService: OtpService,
    private val phoneNormalizer: PhoneNormalizer,
    private val config: AuthenticationConfig,
    private val clock: Clock = Clock.systemUTC(),
    private val random: SecureRandom = SecureRandom()
) {
    private val argon2 = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2id)
    private val dummyPasswordHash = run {
        val chars = "MemgineTimingOnly1".toCharArray()
        try { argon2.hash(3, 65_536, 1, chars) } finally { argon2.wipeArray(chars) }
    }

    fun passwordLogin(
        request: PasswordLoginRequest, clientIp: String?, userAgent: String?
    ): CreatedAuthenticationSession {
        val canonical = phoneNormalizer.normalize(request.phone, request.regionCode)
        val identity = sql.identity(canonical.e164)
        val passwordMatches = verifyPassword(identity?.passwordHash ?: dummyPasswordHash, request.password)
        val valid = identity?.passwordEnabled == true && identity.userActive &&
            identity.passwordHash != null && !isLocked(identity) &&
            passwordMatches
        if (!valid) {
            identity?.takeIf { it.userActive }?.let { sql.recordPasswordFailure(it.userId) }
            throw UnauthorizedException("Invalid phone number or password", "INVALID_CREDENTIALS")
        }
        sql.recordPasswordSuccess(identity.userId)
        val access = access(identity.userId)
        if (access.none { context -> context.capabilities.any { it in WEB_CAPABILITIES } }) {
            throw ForbiddenException("No active web workspace is available")
        }
        return createSession(identity.userId, identity.displayName, clientIp, userAgent, access)
    }

    fun requestLoginOtp(request: OtpLoginRequest): OtpChallengeResponse {
        val result = otpService.request(request.phone, request.regionCode, OtpPurpose.LOGIN)
        return OtpChallengeResponse(result.challengeId, result.expiresAt, result.resendAt, result.devCode)
    }

    fun verifyLoginOtp(
        request: OtpVerifyLoginRequest, clientIp: String?, userAgent: String?
    ): CreatedAuthenticationSession {
        val verification = otpService.verify(request.challengeId, request.otp, OtpPurpose.LOGIN)
        val identity = sql.identity(verification.destination)
        if (identity == null || !identity.userActive) {
            throw UnauthorizedException("Login could not be completed", "INVALID_LOGIN")
        }
        val access = access(identity.userId)
        if (access.none { context -> context.capabilities.any { it in WEB_CAPABILITIES } }) {
            throw ForbiddenException("No active web workspace is available")
        }
        return createSession(identity.userId, identity.displayName, clientIp, userAgent, access)
    }

    fun resolve(token: String?): AuthenticatedPrincipal? {
        if (token.isNullOrBlank()) return null
        val session = sql.resolveSession(hashToken(token)) ?: return null
        return AuthenticatedPrincipal(session.userId, session.displayName, session.expiresAt, access(session.userId))
    }

    fun logout(token: String?, principal: AuthenticatedPrincipal): Boolean =
        !token.isNullOrBlank() && sql.revokeSession(hashToken(token), principal.userId)

    fun setPassword(principal: AuthenticatedPrincipal, request: SetPasswordRequest): Boolean {
        validatePassword(request.password)
        val chars = request.password.toCharArray()
        return try {
            val hash = argon2.hash(3, 65_536, 1, chars)
            sql.setPassword(principal.userId, hash, principal.userId)
        } finally {
            argon2.wipeArray(chars)
        }
    }

    fun toDto(principal: AuthenticatedPrincipal) = AuthSessionDto(
        principal.userId, principal.displayName, principal.expiresAt, principal.access,     sql.passwordConfigured(principal.userId)
    )

    private fun createSession(
        userId: String, displayName: String, clientIp: String?, userAgent: String?,
        resolvedAccess: List<AuthAccessContextDto> = access(userId)
    ): CreatedAuthenticationSession {
        val tokenBytes = ByteArray(32).also(random::nextBytes)
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes)
        val expiresAt = LocalDateTime.now(clock).plusMinutes(config.sessionDurationMinutes)
        sql.createSession(
            UUID.randomUUID().toString(), userId, hashToken(token), expiresAt.toString(),
            clientIp?.take(64), userAgent?.take(500)
        )
        return CreatedAuthenticationSession(
            token,
            AuthenticatedPrincipal(userId, displayName, expiresAt.toString(), resolvedAccess)
        )
    }

    private fun access(userId: String): List<AuthAccessContextDto> =
        sql.access(userId).groupBy { it.organizationId }.map { (organizationId, rows) ->
            AuthAccessContextDto(
                organizationId,
                rows.firstNotNullOfOrNull { it.organizationName },
                rows.map { it.roleCode }.distinct(),
                rows.map { it.capabilityCode }.distinct()
            )
        }

    private fun isLocked(identity: AuthIdentityRow): Boolean = identity.lockedUntil?.let {
        LocalDateTime.parse(it.replace(' ', 'T')).isAfter(LocalDateTime.now(clock))
    } ?: false

    private fun verifyPassword(hash: String, password: String): Boolean {
        if (password.isEmpty() || password.length > 256) return false
        val chars = password.toCharArray()
        return try { argon2.verify(hash, chars) } catch (_: Exception) { false }
        finally { argon2.wipeArray(chars) }
    }

    private fun validatePassword(password: String) {
        if (password.length < config.passwordMinimumLength || password.length > 128 ||
            !password.any(Char::isUpperCase) || !password.any(Char::isLowerCase) ||
            !password.any(Char::isDigit)) {
            throw BadRequestException(
                "Password must be at least ${config.passwordMinimumLength} characters and include upper-case, lower-case and numeric characters"
            )
        }
    }

    private fun hashToken(token: String): String = HexFormat.of().formatHex(
        MessageDigest.getInstance("SHA-256").digest(token.toByteArray(Charsets.UTF_8))
    )

    private companion object {
        val WEB_CAPABILITIES = setOf("PLATFORM_ADMIN_ACCESS", "BUSINESS_OWNER_ACCESS", "ORG_ADMIN_ACCESS", "COUNTER_ACCESS")
    }
}
