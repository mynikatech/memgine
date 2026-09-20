package com.mynikatech.memgine.component.customer

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.net.dto.CreateProspectiveCustomerDto
import com.mynikatech.memgine.net.dto.CounterSubscriptionDto
import com.mynikatech.memgine.net.dto.CounterPurchaseResult
import com.mynikatech.memgine.net.dto.CustomerPurchaseRequestDto
import com.mynikatech.memgine.net.dto.OrgAdminCustomerDto
import com.mynikatech.memgine.net.dto.ProspectiveCustomerCreatedDto
import com.mynikatech.memgine.net.dto.CustomerChoiceDto
import com.mynikatech.memgine.net.dto.CustomerRelationshipDto
import com.mynikatech.memgine.net.dto.OrgAdminRedemptionDto
import com.mynikatech.memgine.net.dto.OfferDto
import com.mynikatech.memgine.net.dto.MembershipProductDto
import com.mynikatech.memgine.net.dto.BenefitDto
import com.mynikatech.memgine.net.dto.BenefitUsageRuleDto
import com.mynikatech.memgine.net.dto.StoreDto
import com.mynikatech.memgine.component.membership.MembershipProductService
import com.mynikatech.memgine.component.benefit.BenefitService
import com.mynikatech.memgine.component.store.StoreService
import com.mynikatech.memgine.component.otp.BusinessOtpService
import com.mynikatech.memgine.component.otp.OtpPurpose
import com.mynikatech.memgine.component.otp.OtpRequestResult
import com.mynikatech.memgine.net.dto.CustomerPurchaseOtpCompleteDto
import com.mynikatech.memgine.net.dto.CustomerPurchaseOtpRequestDto
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.postgresql.util.PSQLException

class CustomerService(
    private val sql: CustomerSql,
    private val memberships: MembershipProductService,
    private val benefits: BenefitService,
    private val stores: StoreService,
    private val devIdentityEnabled: Boolean,
    private val businessOtp: BusinessOtpService
) {
    // Existing Org Admin components use this development actor until request auth is wired.
    fun list(organizationId: String, actorUserId: String): List<OrgAdminCustomerDto> {
        authorize(organizationId, actorUserId)
        return sql.list(organizationId, actorUserId)
    }

    // Temporary Local/Dev seam. Authentication can replace this selected ID
    // with principal.userId without changing routes below or CustomerSql.
    fun resolveCustomerIdentity(selectedUserId: String?): String {
        requireDevIdentity()
        val userId = selectedUserId?.trim()
        if (userId.isNullOrEmpty() || userId.length > 40) {
            throw BadRequestException("Select a customer")
        }
        return userId
    }

    fun choices(): List<CustomerChoiceDto> {
        requireDevIdentity()
        return sql.choices()
    }

    fun relationships(userId: String): List<CustomerRelationshipDto> {
        validateUserId(userId)
        return sql.relationships(userId)
    }

    fun subscriptions(organizationId: String, userId: String): List<CounterSubscriptionDto> {
        authorizeCustomer(organizationId, userId)
        return sql.subscriptions(organizationId, userId)
    }

    fun redemptions(organizationId: String, userId: String): List<OrgAdminRedemptionDto> {
        authorizeCustomer(organizationId, userId)
        return sql.redemptions(organizationId, userId)
    }

    fun offers(organizationId: String, userId: String): List<OfferDto> {
        authorizeCustomer(organizationId, userId)
        return sql.offers(organizationId, userId)
    }

    fun memberships(organizationId: String, userId: String?): List<MembershipProductDto> {
        if (userId != null) authorizeCustomer(organizationId, userId)
        else if (organizationId.isBlank() || organizationId.length > 40)
            throw BadRequestException("Invalid organization id")
        val rows = memberships.list(organizationId)
        if (userId != null) return rows
        val ids = sql.joinMembershipIds(organizationId).toSet()
        val planIds = sql.joinPlanIds(organizationId).toSet()
        return rows.filter { it.id in ids }.map { product ->
            product.copy(plans = product.plans.filter { it.id in planIds })
        }
    }

    fun benefits(organizationId: String, userId: String?): List<BenefitDto> {
        if (userId != null) authorizeCustomer(organizationId, userId)
        else if (organizationId.isBlank() || organizationId.length > 40)
            throw BadRequestException("Invalid organization id")
        val rows = benefits.list(organizationId)
        if (userId != null) return rows.map { it.copy(cost = null) }
        val ids = sql.joinBenefitIds(organizationId).toSet()
        return rows.filter { it.id in ids }.map { it.copy(cost = null) }
    }

    fun benefitRules(organizationId: String, userId: String,
                     benefitId: String): List<BenefitUsageRuleDto> {
        authorizeCustomer(organizationId, userId)
        return benefits.rules(organizationId, benefitId)
    }

    fun stores(organizationId: String, userId: String): List<StoreDto> {
        authorizeCustomer(organizationId, userId)
        val ids = sql.visibleStoreIds(organizationId).toSet()
        return stores.list(organizationId).filter { it.id in ids }
    }

    fun purchase(organizationId: String, selectedUserId: String?,
                 request: CustomerPurchaseRequestDto): CounterPurchaseResult {
        requireDevIdentity()
        if (organizationId.isBlank() || organizationId.length > 40) throw BadRequestException("Invalid organization id")
        if (request.customerUserId != null) {
            val userId = resolveCustomerIdentity(selectedUserId)
            if (request.customerUserId != userId) throw ForbiddenException("Selected customer does not match purchase")
            authorizeCustomer(organizationId, userId)
        } else if (selectedUserId != null) {
            throw BadRequestException("New customer purchase must not specify a selected customer")
        }
        if (request.planId.isBlank() || request.planId.length > 40 ||
            (request.customerUserId?.length ?: 0) > 40 ||
            (request.customerUserId == null && (request.firstName.isNullOrBlank() ||
                request.lastName.isNullOrBlank() || request.primaryPhone.isNullOrBlank()))) {
            throw BadRequestException("Valid membership plan and customer details are required")
        }
        return try {
            sql.purchase(organizationId, request.planId, request.customerUserId,
                request.firstName, request.lastName, request.primaryEmail,
                request.primaryPhone, request.customerUserId)
                ?: throw ConflictException("Membership purchase was not created")
        } catch (error: Exception) {
            val postgres = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<PSQLException>().firstOrNull()
            when (postgres?.sqlState) {
                "42501" -> throw ForbiddenException("Organization purchase is not permitted")
                "22023" -> throw BadRequestException("Membership or customer is unavailable")
                "23505" -> throw ConflictException("Customer already has an active membership or identity conflict")
                else -> throw error
            }
        }
    }

    fun purchaseAuthenticated(
        organizationId: String, customerUserId: String, request: CustomerPurchaseRequestDto
    ): CounterPurchaseResult {
        if (request.customerUserId != null) {
            throw BadRequestException("Customer identity is determined by the authenticated session")
        }
        if (organizationId.isBlank() || organizationId.length > 40 ||
            request.planId.isBlank() || request.planId.length > 40) {
            throw BadRequestException("Valid membership plan is required")
        }
        return try {
            sql.purchaseAuthenticated(organizationId, request.planId, customerUserId)
                ?: throw ConflictException("Membership purchase was not created")
        } catch (error: Exception) {
            val postgres = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<PSQLException>().firstOrNull()
            when (postgres?.sqlState) {
                "42501" -> throw ForbiddenException("Customer purchase is not permitted")
                "22023", "P0002" -> throw BadRequestException("Membership or customer is unavailable")
                "23505" -> throw ConflictException("Customer already has an active membership")
                else -> throw error
            }
        }
    }

    fun requestPurchaseOtp(organizationId: String, input: CustomerPurchaseOtpRequestDto, authenticatedUserId: String?): OtpRequestResult {
        val request = input.purchase
        if (request.planId.isBlank() || request.planId.length > 40) throw BadRequestException("Valid membership plan is required")
        if (authenticatedUserId != null && sql.hasActiveRelationship(organizationId, authenticatedUserId)) throw BadRequestException("An active customer relationship does not require purchase verification")
        val phone = if (authenticatedUserId != null) {
            sql.userPhone(authenticatedUserId)
                ?: throw BadRequestException("Customer phone number is unavailable")
        } else {
            request.primaryPhone
                ?: throw BadRequestException("Phone number is required for purchase verification")
        }

        if (request.customerUserId != null ||
            (authenticatedUserId == null &&
                (request.firstName.isNullOrBlank() ||
                 request.lastName.isNullOrBlank() ||
                 request.primaryPhone.isNullOrBlank()))) {
            throw BadRequestException("Valid new customer purchase details are required")
        }

        return businessOtp.request(
            phone,
            input.regionCode,
            OtpPurpose.APP_MEMBERSHIP_PURCHASE_VERIFY,
            organizationId,
            null,
            request.planId,
            null,
            authenticatedUserId,
            null,
            null,
            Json.encodeToString(request)
        )
    }

    fun completePurchaseOtp(organizationId: String, input: CustomerPurchaseOtpCompleteDto, authenticatedUserId: String?): CounterPurchaseResult {
        val context = businessOtp.verifyAndResolve(
            input.challengeId,
            input.otp,
            OtpPurpose.APP_MEMBERSHIP_PURCHASE_VERIFY
        )
        if (context.organizationId != organizationId || context.userId != authenticatedUserId) {
            throw ForbiddenException("Business verification does not match this purchase")
        }

        val request = Json.decodeFromString<CustomerPurchaseRequestDto>(context.payload)
        if (context.planId != request.planId) {
            throw BadRequestException("Business verification context is invalid")
        }

        if (authenticatedUserId != null) {
            val canonicalPhone = sql.userPhone(authenticatedUserId)
                ?: throw BadRequestException("Customer phone number is unavailable")
            if (context.normalizedPhone != canonicalPhone) {
                throw BadRequestException("Business verification context is invalid")
            }
        }

        val result = if (authenticatedUserId != null) {
            purchaseAuthenticated(organizationId, authenticatedUserId, request)
        } else {
            purchase(organizationId, null, request)
        }

        businessOtp.consume(input.challengeId, OtpPurpose.APP_MEMBERSHIP_PURCHASE_VERIFY)
        return result
    }

    fun hasActiveRelationship(organizationId: String, userId: String): Boolean = sql.hasActiveRelationship(organizationId, userId)

    fun preference(organizationId: String, userId: String, code: String): String? {
        authorizeCustomer(organizationId, userId)
        validatePreferenceCode(code)
        return sql.preference(userId, code)
    }

    fun setPreference(organizationId: String, userId: String, code: String, value: String): String {
        authorizeCustomer(organizationId, userId)
        validatePreferenceCode(code)
        if (value != "true" && value != "false") throw BadRequestException("Preference must be true or false")
        return sql.setPreference(userId, code, value)
    }

    private fun authorizeCustomer(organizationId: String, userId: String) {
        if (organizationId.isBlank() || organizationId.length > 40 ||
            userId.isBlank() || userId.length > 40 ||
            !sql.hasActiveRelationship(organizationId, userId)) {
            throw ForbiddenException("Customer does not belong to this organization")
        }
    }

    private fun validateUserId(userId: String) {
        if (userId.isBlank() || userId.length > 40) {
            throw ForbiddenException("Customer is unavailable")
        }
    }

    private fun requireDevIdentity() {
        if (!devIdentityEnabled) throw ForbiddenException("Customer identity requires authentication")
    }

    private fun validatePreferenceCode(code: String) {
        if (code !in setOf("NOTIFICATIONS", "MARKETING_EMAILS"))
            throw BadRequestException("Unsupported customer preference")
    }

    fun createProspect(organizationId: String, request: CreateProspectiveCustomerDto, actorUserId: String): ProspectiveCustomerCreatedDto {
        authorize(organizationId, actorUserId)
        val firstName = request.firstName.trim()
        val lastName = request.lastName.trim()
        val phone = request.primaryPhone.trim()
        if (firstName.isEmpty() || firstName.length > 100 ||
            lastName.isEmpty() || lastName.length > 100 ||
            phone.isEmpty() || phone.length > 20 ||
            (request.middleName?.length ?: 0) > 100 ||
            (request.displayName?.length ?: 0) > 150 ||
            (request.primaryEmail?.length ?: 0) > 254) {
            throw BadRequestException("Invalid prospective customer fields")
        }
        return try {
            ProspectiveCustomerCreatedDto(sql.createProspect(
                organizationId, firstName, request.middleName?.trim(), lastName,
                request.displayName?.trim(), request.primaryEmail?.trim(), phone, actorUserId
            ))
        } catch (error: Exception) {
            val postgres = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<PSQLException>().firstOrNull()
            when (postgres?.sqlState) {
                "23505" -> throw ConflictException(postgres.serverErrorMessage?.message
                    ?: "A user already has this phone or email; resolve identity before linking")
                "22023" -> throw BadRequestException("Invalid prospective customer fields")
                "42501" -> throw ForbiddenException("Organization administration is not permitted")
                else -> throw error
            }
        }
    }

    private fun authorize(organizationId: String, actorUserId: String) {
        if (organizationId.isBlank() || organizationId.length > 40) {
            throw BadRequestException("Invalid organization id")
        }
        if (!sql.canAdminister(organizationId, actorUserId)) {
            throw ForbiddenException("Organization administration is not permitted")
        }
    }
}