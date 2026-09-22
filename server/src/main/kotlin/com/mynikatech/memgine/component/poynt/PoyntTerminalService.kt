package com.mynikatech.memgine.component.poynt

import com.mynikatech.memgine.component.pos.PosAuthenticationService
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.UnauthorizedException
import com.mynikatech.memgine.net.dto.*
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Clock
import java.util.Base64
import java.util.HexFormat
import java.util.UUID

class PoyntTerminalService(
    private val sql: PoyntTerminalSql,
    private val posAuthentication: PosAuthenticationService,
    private val clock: Clock = Clock.systemUTC(),
    private val random: SecureRandom = SecureRandom()
) {
    fun createPairingCode(
        organizationId: String,
        request: PoyntCreatePairingCodeRequest,
        actorUserId: String
    ): PoyntPairingCodeDto {
        validId(organizationId, "organization id")
        validId(request.storeId, "store id")

        val code = pairingCode()
        val expiresAt = clock.instant().plusSeconds(10 * 60)

        val row = sql.createPairing(
            UUID.randomUUID().toString(),
            organizationId,
            request.storeId,
            hash(code),
            expiresAt.toString(),
            actorUserId
        )

        return PoyntPairingCodeDto(
            row.pairingId,
            code,
            row.organizationId,
            row.storeId,
            row.expiresAt
        )
    }

    fun completePairing(
        request: PoyntCompletePairingRequest
    ): PoyntTerminalPairingDto {
        val pairingCode = request.pairingCode.trim().uppercase()

        if (!pairingCode.matches(Regex("^[A-Z0-9]{10}$"))) {
            throw BadRequestException("Invalid pairing code")
        }

        validExternalId(
            request.poyntBusinessId,
            "Poynt business id"
        )
        validExternalId(
            request.poyntStoreId,
            "Poynt store id"
        )
        validExternalId(
            request.poyntTerminalId,
            "Poynt terminal id"
        )

        val deviceName = request.deviceName.trim()

        if (deviceName.isEmpty() || deviceName.length > 150) {
            throw BadRequestException("Invalid terminal name")
        }

        val terminalCredential = randomToken()

        val row = sql.completePairing(
            hash(pairingCode),
            request.poyntBusinessId.trim(),
            request.poyntStoreId.trim(),
            request.poyntTerminalId.trim(),
            UUID.randomUUID().toString(),
            deviceName,
            hash(terminalCredential),
            UUID.randomUUID().toString()
        )

        return PoyntTerminalPairingDto(
            terminalCredential,
            row.deviceId,
            row.organizationId,
            row.organizationName,
            row.storeId,
            row.storeName,
            row.deviceName
        )
    }

    fun context(
        terminalCredential: String?
    ): PosContextDto =
        posAuthentication.context(
            requiredTerminalCredential(terminalCredential)
        )

    fun unlock(
        terminalCredential: String?,
        request: PoyntTerminalUnlockRequest,
        clientIp: String?,
        userAgent: String?
    ): AuthSessionDto {
        val unlocked = posAuthentication.unlock(
            requiredTerminalCredential(terminalCredential),
            PosUnlockRequest(
                request.staffId,
                request.pin
            ),
            clientIp,
            userAgent
        )

        return unlocked.dto.copy(
            sessionToken = unlocked.token
        )
    }

    private fun requiredTerminalCredential(
        value: String?
    ): String =
        value?.takeIf(String::isNotBlank)
            ?: throw UnauthorizedException(
                "Terminal authentication is required"
            )

    private fun validId(
        value: String,
        field: String
    ) {
        if (value.isBlank() || value.length > 64) {
            throw BadRequestException("Invalid $field")
        }
    }

    private fun validExternalId(
        value: String,
        field: String
    ) {
        if (value.isBlank() || value.length > 128) {
            throw BadRequestException("Invalid $field")
        }
    }

    private fun pairingCode(): String =
        buildString(10) {
            repeat(10) {
                append(
                    PAIRING_ALPHABET[
                        random.nextInt(PAIRING_ALPHABET.length)
                    ]
                )
            }
        }

    private fun randomToken(): String =
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(
                ByteArray(32).also(random::nextBytes)
            )

    private fun hash(
        value: String
    ): String =
        HexFormat.of().formatHex(
            MessageDigest.getInstance("SHA-256")
                .digest(
                    value.toByteArray(Charsets.UTF_8)
                )
        )

    private companion object {
        const val PAIRING_ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    }
}