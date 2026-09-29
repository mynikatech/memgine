package com.mynikatech.memgine.component.redemption

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.net.dto.OrgAdminRedemptionDto
import com.mynikatech.memgine.net.dto.CreateRedemptionTransactionRequest
import com.mynikatech.memgine.net.dto.CustomerCreateRedemptionTransactionRequest
import com.mynikatech.memgine.net.dto.RedemptionTransactionDto
import com.mynikatech.memgine.net.dto.RedemptionTransactionValidationDto
import com.mynikatech.memgine.net.dto.RedemptionTransactionQrDto
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import org.postgresql.util.PSQLException

class RedemptionService(private val sql: RedemptionSql) {
    private val qrRandom = SecureRandom()
    // Current Org Admin components use the development actor until request auth is wired.
    fun listForOrganization(organizationId: String, actorUserId: String): List<OrgAdminRedemptionDto> {
        if (organizationId.isBlank() || organizationId.length > 40) {
            throw BadRequestException("Invalid organization id")
        }
        if (!sql.canAdminister(organizationId, actorUserId)) {
            throw ForbiddenException("Organization administration is not permitted")
        }
        return sql.listForOrganization(organizationId, actorUserId)
    }

    fun createCounterTransaction(
        organizationId: String,
        request: CreateRedemptionTransactionRequest,
        actorUserId: String
    ): RedemptionTransactionDto {
        requireId(organizationId, "organization id")
        requireId(request.storeId, "store id")
        requireId(request.staffId, "staff id")
        requireId(request.subscriptionId, "subscription id")
        if (request.benefitIds.isEmpty() && request.offerIds.isEmpty()) {
            throw BadRequestException("Select one or more benefits or offers")
        }
        if ((request.benefitIds + request.offerIds).any { it.isBlank() || it.length > 64 } ||
            request.benefitIds.distinct().size != request.benefitIds.size ||
            request.offerIds.distinct().size != request.offerIds.size ||
            request.redemptionMethod.isBlank() || request.redemptionMethod.length > 64) {
            throw BadRequestException("Invalid redemption transaction selection")
        }
        return sql.createCounterTransaction(organizationId, request.storeId, request.staffId, request.subscriptionId,
            request.benefitIds.toTypedArray(), request.offerIds.toTypedArray(), request.redemptionMethod.trim(), actorUserId)
            ?: throw BadRequestException("Unable to create redemption transaction")
    }

    fun createCustomerTransaction(
        organizationId: String,
        request: CustomerCreateRedemptionTransactionRequest,
        actorUserId: String
    ): RedemptionTransactionDto {
        requireId(organizationId, "organization id")
        requireId(request.subscriptionId, "subscription id")
        validateSelection(request.benefitIds, request.offerIds, request.redemptionMethod)
        return sql.createCustomerTransaction(organizationId, request.subscriptionId, request.benefitIds.toTypedArray(),
            request.offerIds.toTypedArray(), request.redemptionMethod.trim(), actorUserId)
            ?: throw BadRequestException("Unable to create redemption transaction")
    }

    fun issueCustomerTransactionQr(
        organizationId: String,
        transactionId: String,
        actorUserId: String
    ): RedemptionTransactionQrDto {
        requireId(organizationId, "organization id")
        requireId(transactionId, "redemption transaction id")
        val rawReference = ByteArray(32).also(qrRandom::nextBytes)
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        val row = translateQr {
            sql.issueCustomerTransactionQr(
                organizationId,
                transactionId,
                sha256Hex(rawReference),
                actorUserId
            ) ?: throw BadRequestException("Unable to issue redemption QR")
        }
        return RedemptionTransactionQrDto(rawReference, row.transactionNumber, row.expiresAt)
    }

    fun resolveCounterTransactionQr(
        organizationId: String,
        storeId: String,
        staffId: String,
        qrReference: String,
        actorUserId: String
    ): RedemptionTransactionDto {
        requireId(organizationId, "organization id")
        requireId(storeId, "store id")
        requireId(staffId, "staff id")
        if (qrReference.isBlank() || qrReference.length > 128) {
            throw BadRequestException("Invalid redemption QR reference")
        }
        return translateQr {
            sql.resolveCounterTransactionQr(
                organizationId,
                storeId,
                staffId,
                sha256Hex(qrReference),
                actorUserId
            ) ?: throw BadRequestException("Invalid redemption QR reference", "REDEMPTION_QR_INVALID")
        }
    }

    fun validateTransaction(organizationId: String, transactionId: String, storeId: String, staffId: String, actorUserId: String): List<RedemptionTransactionValidationDto> {
        requireId(organizationId, "organization id")
        requireId(transactionId, "redemption transaction id")
        requireId(storeId, "store id")
        requireId(staffId, "staff id")
        return translateCounterTransaction {
            sql.validateTransaction(transactionId, organizationId, storeId, staffId, actorUserId)
        }
    }

    fun executeTransaction(organizationId: String, transactionId: String, storeId: String, staffId: String, actorUserId: String): RedemptionTransactionDto {
        requireId(organizationId, "organization id")
        requireId(transactionId, "redemption transaction id")
        requireId(storeId, "store id")
        requireId(staffId, "staff id")
        return translateCounterTransaction {
            sql.executeTransaction(transactionId, organizationId, storeId, staffId, actorUserId)
                ?: throw BadRequestException("Unable to execute redemption transaction")
        }
    }

    private fun requireId(value: String, name: String) {
        if (value.isBlank() || value.length > 64) throw BadRequestException("Invalid $name")
    }

    private fun sha256Hex(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }

    private fun <T> translateQr(block: () -> T): T = try {
        block()
    } catch (error: Exception) {
        val postgres = generateSequence<Throwable>(error) { it.cause }
            .filterIsInstance<PSQLException>()
            .firstOrNull()
        when (postgres?.sqlState) {
            "42501" -> throw ForbiddenException(
                "Redemption transaction is not available",
                "REDEMPTION_QR_NOT_AUTHORIZED"
            )
            "P0002" -> throw BadRequestException(
                "Invalid redemption QR reference",
                "REDEMPTION_QR_INVALID"
            )
            "23505" -> throw ConflictException(
                "Redemption QR is no longer available",
                "REDEMPTION_QR_ALREADY_USED"
            )
            else -> throw error
        }
    }

    private fun <T> translateCounterTransaction(block: () -> T): T = try {
        block()
    } catch (error: Exception) {
        val postgres = generateSequence<Throwable>(error) { it.cause }
            .filterIsInstance<PSQLException>()
            .firstOrNull()
        when (postgres?.sqlState) {
            "42501" -> throw ForbiddenException(
                "Counter store or staff context is not permitted",
                "REDEMPTION_COUNTER_NOT_AUTHORIZED"
            )
            "P0002" -> throw BadRequestException(
                "Redemption transaction is unavailable",
                "REDEMPTION_TRANSACTION_INVALID"
            )
            "23505" -> throw ConflictException(
                "Redemption transaction cannot be completed",
                "REDEMPTION_TRANSACTION_NOT_EXECUTABLE"
            )
            else -> throw error
        }
    }

    private fun validateSelection(benefitIds: List<String>, offerIds: List<String>, method: String) {
        if ((benefitIds.isEmpty() && offerIds.isEmpty()) ||
            (benefitIds + offerIds).any { it.isBlank() || it.length > 64 } ||
            benefitIds.distinct().size != benefitIds.size || offerIds.distinct().size != offerIds.size ||
            method.isBlank() || method.length > 64) throw BadRequestException("Invalid redemption transaction selection")
    }
}
