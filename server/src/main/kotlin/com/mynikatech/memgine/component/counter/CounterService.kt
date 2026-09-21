package com.mynikatech.memgine.component.counter

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.component.otp.BusinessOtpContextRow
import com.mynikatech.memgine.component.otp.BusinessOtpService
import com.mynikatech.memgine.component.otp.OtpPurpose
import com.mynikatech.memgine.component.otp.OtpRequestResult
import com.mynikatech.memgine.net.dto.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import com.mynikatech.memgine.security.AuthenticatedPrincipal
import com.mynikatech.memgine.security.PhoneNormalizer
import org.jdbi.v3.core.Jdbi
import org.postgresql.util.PSQLException

class CounterService(
    private val jdbi: Jdbi,
    private val businessOtp: BusinessOtpService,
    private val phoneNormalizer: PhoneNormalizer = PhoneNormalizer()
) {
    private fun sql(): CounterSql = jdbi.onDemand(CounterSql::class.java)

    private fun id(value: String, name: String) {
        if (value.isBlank() || value.length > 40) throw BadRequestException("Invalid $name")
    }

    private fun authorize(organizationId: String, storeId: String, staffId: String, principal: AuthenticatedPrincipal) {
        id(organizationId, "organization id")
        id(storeId, "store id")
        id(staffId, "staff id")
        principal.posContext?.let { context ->
            if (context.organizationId != organizationId || context.storeId != storeId || context.staffId != staffId) {
                throw ForbiddenException("Fixed POS context does not match this Counter operation")
            }
        }
        if (!sql().canOperate(organizationId, storeId, staffId, principal.userId)) {
            throw ForbiddenException("Staff is not active at this store")
        }
    }

    fun customers(org: String, store: String, staff: String, principal: AuthenticatedPrincipal): List<OrgAdminCustomerDto> {
        authorize(org, store, staff, principal)
        return sql().customers(org, principal.userId)
    }

    fun subscriptions(org: String, store: String, staff: String, principal: AuthenticatedPrincipal): List<CounterSubscriptionDto> {
        authorize(org, store, staff, principal)
        return sql().subscriptions(org, principal.userId)
    }
    
    fun subscriptionBenefits(
        org: String,
        store: String,
        staff: String,
        subscriptionId: String,
        principal: AuthenticatedPrincipal
    ): List<BenefitDto> {
        authorize(org, store, staff, principal)
        id(subscriptionId, "subscription id")

        return sql().subscriptionBenefits(
            org,
            subscriptionId,
            principal.userId
        )
    }

    fun redemptions(org: String, store: String, staff: String, principal: AuthenticatedPrincipal): List<OrgAdminRedemptionDto> {
        authorize(org, store, staff, principal)
        return sql().redemptions(org, principal.userId)
    }

    fun qrSamples(org: String, store: String, staff: String, principal: AuthenticatedPrincipal): List<CounterQrDto> {
        authorize(org, store, staff, principal)
        return sql().qrCodes(org, null)
    }

    fun staffName(org: String, store: String, staff: String, principal: AuthenticatedPrincipal): String? {
        authorize(org, store, staff, principal)
        return sql().staffName(org, staff)
    }

    fun eligibility(org: String, store: String, staff: String,
                    subscriptionId: String, benefitIds: List<String>, principal: AuthenticatedPrincipal): List<CounterEligibilityDto> {
        authorize(org, store, staff, principal)
        id(subscriptionId, "subscription id")
        if (benefitIds.isEmpty() || benefitIds.size > 100) throw BadRequestException("Select benefits")
        benefitIds.forEach { id(it, "benefit id") }
        val lookup = sql()
        return benefitIds.distinct().map { CounterEligibilityDto(it, lookup.rejection(org, subscriptionId, it)) }
    }

    fun purchase(org: String, request: CounterPurchaseRequest, principal: AuthenticatedPrincipal): CounterPurchaseResult {
        authorize(org, request.storeId, request.staffId, principal)
        id(request.planId, "plan id")
        request.customerUserId?.let { id(it, "customer user id") }
        if (request.customerUserId == null && (request.firstName.isNullOrBlank() ||
            request.lastName.isNullOrBlank() || request.primaryPhone.isNullOrBlank())) {
            throw BadRequestException("New customer name and phone are required")
        }
        return translate {
            sql().purchase(org, request.storeId, request.staffId, request.planId,
                request.customerUserId, request.firstName, request.lastName,
                request.primaryEmail, request.primaryPhone, principal.userId)
                ?: throw ConflictException("Purchase was not created")
        }
    }

    fun requestPurchaseOtp(org: String, input: CounterBusinessOtpRequest,
                           principal: AuthenticatedPrincipal): OtpRequestResult {
        val requestedPurchase = input.purchase ?: throw BadRequestException("Purchase details are required")
        if (input.redemption != null) throw BadRequestException("Only one Counter action may be verified")
        validatePurchase(org, requestedPurchase, principal)
        val request = if (requestedPurchase.customerUserId == null) {
            resolveProspectiveCustomer(org, requestedPurchase, input.regionCode, principal)
        } else {
            requestedPurchase
        }
        val customerUserId = request.customerUserId
            ?: throw BadRequestException("Prospective customer could not be resolved")
        val verificationPhone = sql().customers(org, principal.userId)
            .firstOrNull { it.userId == customerUserId }
            ?.primaryPhone
            ?: throw BadRequestException("Customer is not active in this organization")

        return businessOtp.request(
            verificationPhone,
            input.regionCode,
            OtpPurpose.COUNTER_PURCHASE_VERIFY,
            org,
            request.storeId,
            request.planId,
            null,
            request.customerUserId,
            request.staffId,
            null,
            Json.encodeToString(request)
        )
    }

    /**
     * Counter onboarding uses the existing prospective-customer upsert before
     * delivery. That workflow serializes canonical phone identity, preserves an
     * existing user's profile, and creates the CUSTOMER relationship when needed.
     */
    private fun resolveProspectiveCustomer(
        org: String,
        request: CounterPurchaseRequest,
        regionCode: String?,
        principal: AuthenticatedPrincipal
    ): CounterPurchaseRequest {
        val canonicalPhone = phoneNormalizer.normalize(
            request.primaryPhone ?: throw BadRequestException("New customer phone is required"),
            regionCode
        ).e164
        val firstName = request.firstName?.trim().orEmpty()
        val lastName = request.lastName?.trim().orEmpty()
        val email = request.primaryEmail?.trim()?.takeIf { it.isNotEmpty() }

        translate {
            sql().createProspectiveCustomer(
                org, firstName, lastName, email, canonicalPhone, principal.userId
            )
        }

        val customer = sql().customers(org, principal.userId)
            .firstOrNull { it.primaryPhone == canonicalPhone }
            ?: throw BadRequestException("Prospective customer could not be resolved")

        return request.copy(customerUserId = customer.userId, primaryPhone = canonicalPhone)
    }

    /**
     * Verifies the one Counter purchase OTP, but deliberately does NOT create
     * the subscription yet. Payment happens after this succeeds.
     */
    fun verifyPurchaseOtp(org: String, input: CounterBusinessOtpCompleteRequest,
                          principal: AuthenticatedPrincipal): Boolean {
        val context = businessOtp.verifyAndResolve(
            input.challengeId,
            input.otp,
            OtpPurpose.COUNTER_PURCHASE_VERIFY
        )
        validatePurchaseContext(org, context, principal)
        return true
    }

    /**
     * Finalizes a previously verified Counter purchase after payment succeeds.
     * No second OTP is requested or verified here.
     */
    fun finalizePurchaseOtp(org: String, input: CounterBusinessOtpFinalizeRequest,
                            principal: AuthenticatedPrincipal): CounterPurchaseResult {
        val context = businessOtp.resolveVerified(
            input.challengeId,
            OtpPurpose.COUNTER_PURCHASE_VERIFY
        )
        val request = validatePurchaseContext(org, context, principal)
        val result = purchase(org, request, principal)
        businessOtp.consume(input.challengeId, OtpPurpose.COUNTER_PURCHASE_VERIFY)
        return result
    }

    private fun validatePurchaseContext(
        org: String,
        context: BusinessOtpContextRow,
        principal: AuthenticatedPrincipal
    ): CounterPurchaseRequest {
        if (context.organizationId != org) {
            throw ForbiddenException("Business verification does not belong to this organization")
        }

        val request = Json.decodeFromString<CounterPurchaseRequest>(context.payload)
        if (context.storeId != request.storeId ||
            context.planId != request.planId ||
            context.staffId != request.staffId ||
            context.userId != request.customerUserId) {
            throw BadRequestException("Business verification context is invalid")
        }

        validatePurchase(org, request, principal)

        if (request.customerUserId != null) {
            val canonicalPhone = sql().customers(org, principal.userId)
                .firstOrNull { it.userId == request.customerUserId }
                ?.primaryPhone
                ?: throw BadRequestException("Customer is not active in this organization")
            if (context.normalizedPhone != canonicalPhone) {
                throw BadRequestException("Business verification context is invalid")
            }
        }

        return request
    }

    fun redeem(org: String, request: CounterRedeemRequest, principal: AuthenticatedPrincipal): List<CounterRedemptionResult> {
        authorize(org, request.storeId, request.staffId, principal)
        id(request.subscriptionId, "subscription id")
        if (request.benefitIds.isEmpty() || request.benefitIds.size > 100 ||
            request.benefitIds.distinct().size != request.benefitIds.size) {
            throw BadRequestException("Select distinct benefits")
        }
        request.benefitIds.forEach { id(it, "benefit id") }
        return translate {
            sql().redeem(org, request.storeId, request.staffId, request.subscriptionId,
                request.benefitIds.toTypedArray(), principal.userId)
        }
    }

    fun requestRedemptionOtp(org: String, input: CounterBusinessOtpRequest,
                             principal: AuthenticatedPrincipal): OtpRequestResult {
        val request = input.redemption ?: throw BadRequestException("Redemption details are required")
        if (input.purchase != null) throw BadRequestException("Only one Counter action may be verified")
        validateRedemption(org, request, principal)
        val subscription = sql().subscriptions(org, principal.userId)
            .firstOrNull { it.id == request.subscriptionId }
            ?: throw BadRequestException("Subscription is not active in this organization")

        val customerPhone = sql().customers(org, principal.userId)
            .firstOrNull { it.userId == subscription.userId }
            ?.primaryPhone
            ?: throw BadRequestException("Customer is not active in this organization")

        return businessOtp.request(
            customerPhone,
            input.regionCode,
            OtpPurpose.COUNTER_REDEMPTION_VERIFY,
            org,
            request.storeId,
            null,
            request.subscriptionId,
            subscription.userId,
            request.staffId,
            Json.encodeToString(request.benefitIds.sorted()),
            Json.encodeToString(request)
        )
    }

    fun completeRedemptionOtp(org: String, input: CounterBusinessOtpCompleteRequest,
                              principal: AuthenticatedPrincipal): List<CounterRedemptionResult> {
        val context = businessOtp.verifyAndResolve(
            input.challengeId,
            input.otp,
            OtpPurpose.COUNTER_REDEMPTION_VERIFY
        )
        if (context.organizationId != org) {
            throw ForbiddenException("Business verification does not belong to this organization")
        }

        val request = Json.decodeFromString<CounterRedeemRequest>(context.payload)
        val boundBenefitIds =
            Json.decodeFromString<List<String>>(context.benefitIds ?: "[]").sorted()

        if (context.storeId != request.storeId ||
            context.subscriptionId != request.subscriptionId ||
            context.staffId != request.staffId ||
            boundBenefitIds != request.benefitIds.sorted()) {
            throw BadRequestException("Business verification context is invalid")
        }

        val subscription = sql().subscriptions(org, principal.userId)
            .firstOrNull { it.id == request.subscriptionId }
            ?: throw BadRequestException("Subscription is not active in this organization")

        if (context.userId != subscription.userId) {
            throw BadRequestException("Business verification context is invalid")
        }

        val canonicalPhone = sql().customers(org, principal.userId)
            .firstOrNull { it.userId == subscription.userId }
            ?.primaryPhone
            ?: throw BadRequestException("Customer is not active in this organization")

        if (context.normalizedPhone != canonicalPhone) {
            throw BadRequestException("Business verification context is invalid")
        }

        val result = redeem(org, request, principal)
        businessOtp.consume(input.challengeId, OtpPurpose.COUNTER_REDEMPTION_VERIFY)
        return result
    }

    private fun validatePurchase(org: String, request: CounterPurchaseRequest, principal: AuthenticatedPrincipal) {
        authorize(org, request.storeId, request.staffId, principal)
        id(request.planId, "plan id")
        request.customerUserId?.let { id(it, "customer user id") }
        if (request.customerUserId == null && (request.firstName.isNullOrBlank() || request.lastName.isNullOrBlank() || request.primaryPhone.isNullOrBlank()))
            throw BadRequestException("New customer name and phone are required")
    }

    private fun validateRedemption(org: String, request: CounterRedeemRequest, principal: AuthenticatedPrincipal) {
        authorize(org, request.storeId, request.staffId, principal)
        id(request.subscriptionId, "subscription id")
        if (request.benefitIds.isEmpty() || request.benefitIds.size > 100 || request.benefitIds.distinct().size != request.benefitIds.size)
            throw BadRequestException("Select distinct benefits")
        request.benefitIds.forEach { id(it, "benefit id") }
    }

    fun redeemQr(org: String, request: CounterQrRedeemRequest, principal: AuthenticatedPrincipal): List<CounterRedemptionResult> {
        authorize(org, request.storeId, request.staffId, principal)
        if (request.token.isBlank() || request.token.length > 200) throw BadRequestException("Invalid QR token")
        if (sql().qrCodeType(org, request.token) == "QR_OFFER_REDEMPTION") {
            throw BadRequestException("Offer QR redemption is not supported by the server yet")
        }
        val qr = sql().qrCodes(org, request.token).singleOrNull()
            ?: throw NotFoundException("Benefit redemption QR was not found on the server")
        throw BadRequestException("Benefit QR selection is not stored on the server; use phone or staff-assisted redemption")
    }

    private fun <T> translate(block: () -> T): T {
        try { return block() } catch (error: Exception) {
            val postgres = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<PSQLException>().firstOrNull()
            val databaseMessage: String? = postgres?.serverErrorMessage?.message?.toString()
            when (postgres?.sqlState) {
                "42501" -> throw ForbiddenException("Counter operation is not permitted")
                "22023" -> throw BadRequestException(
                    databaseMessage?.takeIf { it in setOf(
                        "Membership plan is unavailable for this organization",
                        "Membership plan has an invalid subscription period",
                        "Customer is not active in this organization",
                        "Customer account is not active"
                    ) } ?: "Invalid membership or customer details")
                "23505" -> throw ConflictException(
                    databaseMessage?.takeIf {
                        it == "Customer already has an active subscription for this membership" ||
                            it.startsWith("Benefit ") || it.startsWith("Subscription ")
                    } ?: "The Counter transaction conflicts with existing data")
                else -> throw error
            }
        }
    }
}
