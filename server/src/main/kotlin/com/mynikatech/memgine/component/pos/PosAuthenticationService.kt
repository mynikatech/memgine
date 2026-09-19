package com.mynikatech.memgine.component.pos

import com.mynikatech.memgine.component.auth.AuthenticationService
import com.mynikatech.memgine.config.AuthenticationConfig
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.UnauthorizedException
import com.mynikatech.memgine.net.dto.AuthSessionDto
import com.mynikatech.memgine.net.dto.PosContextDto
import com.mynikatech.memgine.net.dto.PosDeviceDto
import com.mynikatech.memgine.net.dto.PosUnlockRequest
import com.mynikatech.memgine.net.dto.RegisterPosDeviceRequest
import com.mynikatech.memgine.net.dto.PosStaffDto
import de.mkammerer.argon2.Argon2Factory
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Clock
import java.time.LocalDateTime
import java.util.Base64
import java.util.HexFormat
import java.util.UUID

data class PosUnlockedSession(
    val dto: AuthSessionDto,
    val token: String
)

class PosAuthenticationService(
    private val sql: PosAuthenticationSql,
    private val auth: AuthenticationService,
    private val config: AuthenticationConfig,
    private val clock: Clock = Clock.systemUTC(),
    private val random: SecureRandom = SecureRandom()
) {
    private val argon2 =
        Argon2Factory.create(
            Argon2Factory.Argon2Types.ARGON2id
        )

    private fun hash(value: String): String =
        HexFormat.of().formatHex(
            MessageDigest
                .getInstance("SHA-256")
                .digest(value.toByteArray(Charsets.UTF_8))
        )

    private fun validId(value: String): Boolean =
        value.isNotBlank() && value.length <= 64

    fun register(
        org: String,
        request: RegisterPosDeviceRequest,
        actor: String
    ): Pair<PosDeviceDto, String> {
        if (
            !validId(org) ||
            !validId(request.storeId) ||
            request.deviceName.trim().isEmpty() ||
            request.deviceName.length > 150
        ) {
            throw BadRequestException("Invalid POS device")
        }

        val token =
            Base64
                .getUrlEncoder()
                .withoutPadding()
                .encodeToString(
                    ByteArray(32).also(random::nextBytes)
                )

       val row =
            sql.register(
                UUID.randomUUID().toString(),
                org,
                request.storeId,
                request.deviceName.trim(),
                hash(token),
                actor
            )

        val device = PosDeviceDto(
            deviceId = row.deviceId,
            organizationId = row.organizationId,
            storeId = row.storeId,
            storeName = row.storeName,
            deviceName = row.deviceName,
            revokedAt = row.revokedAt,
            lastSeenAt = row.lastSeenAt
            )

        return device to token
    }

    fun list(
        org: String,
        actor: String
    ): List<PosDeviceDto> =
        sql.list(org, actor).map { row ->
            PosDeviceDto(
                deviceId = row.deviceId,
                organizationId = row.organizationId,
                storeId = row.storeId,
                storeName = row.storeName,
                deviceName = row.deviceName,
                revokedAt = row.revokedAt,
                lastSeenAt = row.lastSeenAt
            )
    }
    fun revoke(
        org: String,
        deviceId: String,
        actor: String
    ): Boolean =
        sql.revoke(org, deviceId, actor)

    fun setPin(
        org: String,
        staff: String,
        pin: String,
        actor: String
    ): Boolean {
        if (!pin.matches(Regex("^[0-9]{4}$"))) {
            throw BadRequestException(
                "PIN must be exactly 4 digits"
            )
        }

        val chars = pin.toCharArray()

        return try {
            val pinHash =
                argon2.hash(
                    3,
                    65_536,
                    1,
                    chars
                )

            sql.setPin(
                org,
                staff,
                pinHash,
                actor
            )
        } finally {
            argon2.wipeArray(chars)
        }
    }

    fun context(
        deviceToken: String?
    ): PosContextDto {
        val deviceHash =
            deviceToken
                ?.takeIf(String::isNotBlank)
                ?.let(::hash)
                ?: throw UnauthorizedException(
                    "This device is not registered as a fixed POS."
                )

        val context =
            sql.device(deviceHash)
                ?: throw UnauthorizedException(
                    "This device is not registered as a fixed POS."
                )

        sql.touchDevice(deviceHash)

        val staff =
    sql.eligibleStaff(deviceHash).map { row ->
        PosStaffDto(
            staffId = row.staffId,
            displayName = row.displayName,
            staffCode = row.staffCode,
            designation = row.designation,
            pinConfigured = row.pinConfigured
        )
    }

return PosContextDto(
    context.organizationId,
    context.organizationName,
    context.storeId,
    context.storeName,
    context.deviceId,
    context.deviceName,
    staff
)
    }

    fun unlock(
        deviceToken: String?,
        request: PosUnlockRequest,
        ip: String?,
        agent: String?
    ): PosUnlockedSession {
        if (
            !validId(request.staffId) ||
            !request.pin.matches(Regex("^[0-9]{4}$"))
        ) {
            throw UnauthorizedException(
                "PIN is incorrect or unavailable"
            )
        }

        val deviceHash =
            deviceToken
                ?.takeIf(String::isNotBlank)
                ?.let(::hash)
                ?: throw UnauthorizedException(
                    "PIN is incorrect or unavailable"
                )

        val row =
            sql.candidate(
                deviceHash,
                request.staffId
            )
                ?: throw UnauthorizedException(
                    "PIN is incorrect or unavailable"
                )

        /*
         * Do not perform Argon2 verification and do not increment the
         * failure counter while the credential is already locked.
         */
        if (isLocked(row.lockedUntil)) {
            throw UnauthorizedException(
                "PIN is incorrect or unavailable"
            )
        }

        val chars = request.pin.toCharArray()

        val valid =
            try {
                argon2.verify(
                    row.pinHash,
                    chars
                )
            } catch (_: Exception) {
                false
            } finally {
                argon2.wipeArray(chars)
            }

        if (!valid) {
            sql.failure(
                row.staffId,
                config.posPinMaxAttempts,
                config.posPinLockMinutes.toInt()
            )

            throw UnauthorizedException(
                "PIN is incorrect or unavailable"
            )
        }

        /*
         * Reset failures only after successful Argon2 verification.
         */
        if (!sql.success(row.staffId)) {
            throw UnauthorizedException(
                "PIN is incorrect or unavailable"
            )
        }

        /*
         * Mark the fixed terminal as recently used.
         */
        sql.touchDevice(deviceHash)

        val token =
            Base64
                .getUrlEncoder()
                .withoutPadding()
                .encodeToString(
                    ByteArray(32).also(random::nextBytes)
                )

        val expiresAt =
            LocalDateTime
                .now(clock)
                .plusMinutes(
                    config.sessionDurationMinutes
                )

        /*
         * pos_create_session revalidates device/org/store/staff and
         * credential lock state before creating both rows.
         */
        sql.createSession(
            UUID.randomUUID().toString(),
            row.userId,
            hash(token),
            expiresAt.toString(),
            ip?.take(64),
            agent?.take(500),
            deviceHash,
            row.deviceId,
            row.organizationId,
            row.storeId,
            row.staffId
        )

        val principal =
            auth.resolve(token)
                ?: throw ForbiddenException(
                    "POS session could not be created"
                )

        return PosUnlockedSession(
            auth.toDto(principal),
            token
        )
    }

    private fun isLocked(
        lockedUntil: String?
    ): Boolean {
        if (lockedUntil.isNullOrBlank()) {
            return false
        }

        return try {
            LocalDateTime
                .parse(
                    lockedUntil.replace(' ', 'T')
                )
                .isAfter(
                    LocalDateTime.now(clock)
                )
        } catch (_: Exception) {
            /*
             * Fail closed if a persisted lock timestamp cannot be
             * interpreted.
             */
            true
        }
    }
}