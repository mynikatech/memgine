package com.mynikatech.memgine.component.redemption

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.net.dto.OrgAdminRedemptionDto
import com.mynikatech.memgine.net.dto.CreateRedemptionTransactionRequest
import com.mynikatech.memgine.net.dto.CustomerCreateRedemptionTransactionRequest
import com.mynikatech.memgine.net.dto.RedemptionTransactionDto
import com.mynikatech.memgine.net.dto.RedemptionTransactionValidationDto

class RedemptionService(private val sql: RedemptionSql) {
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

    fun validateTransaction(organizationId: String, transactionId: String, storeId: String, staffId: String, actorUserId: String): List<RedemptionTransactionValidationDto> {
        requireId(organizationId, "organization id")
        requireId(transactionId, "redemption transaction id")
        requireId(storeId, "store id")
        requireId(staffId, "staff id")
        return sql.validateTransaction(transactionId, organizationId, storeId, staffId, actorUserId)
    }

    fun executeTransaction(organizationId: String, transactionId: String, storeId: String, staffId: String, actorUserId: String): RedemptionTransactionDto {
        requireId(organizationId, "organization id")
        requireId(transactionId, "redemption transaction id")
        requireId(storeId, "store id")
        requireId(staffId, "staff id")
        return sql.executeTransaction(transactionId, organizationId, storeId, staffId, actorUserId)
            ?: throw BadRequestException("Unable to execute redemption transaction")
    }

    private fun requireId(value: String, name: String) {
        if (value.isBlank() || value.length > 64) throw BadRequestException("Invalid $name")
    }

    private fun validateSelection(benefitIds: List<String>, offerIds: List<String>, method: String) {
        if ((benefitIds.isEmpty() && offerIds.isEmpty()) ||
            (benefitIds + offerIds).any { it.isBlank() || it.length > 64 } ||
            benefitIds.distinct().size != benefitIds.size || offerIds.distinct().size != offerIds.size ||
            method.isBlank() || method.length > 64) throw BadRequestException("Invalid redemption transaction selection")
    }
}
