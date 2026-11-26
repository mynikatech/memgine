package com.mynikatech.memgine.component.customer

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.CreateProspectiveCustomerDto
import com.mynikatech.memgine.net.dto.CounterSubscriptionDto
import com.mynikatech.memgine.net.dto.CounterPurchaseResult
import com.mynikatech.memgine.net.dto.CustomerPurchaseRequestDto
import com.mynikatech.memgine.net.dto.OrgAdminCustomerDto
import com.mynikatech.memgine.net.dto.ProspectiveCustomerCreatedDto
import com.mynikatech.memgine.net.dto.CustomerChoiceDto
import com.mynikatech.memgine.net.dto.CustomerDiscoverableOrganizationDto
import com.mynikatech.memgine.net.dto.CustomerDiscoveryDetailDto
import com.mynikatech.memgine.net.dto.CustomerRelationshipDto
import com.mynikatech.memgine.net.dto.OrgAdminRedemptionDto
import com.mynikatech.memgine.net.dto.OfferDto
import com.mynikatech.memgine.net.dto.CustomerCombinedOfferDto
import com.mynikatech.memgine.net.dto.CustomerRedemptionItemStatusDto
import com.mynikatech.memgine.net.dto.CustomerRedemptionTransactionStatusDto
import com.mynikatech.memgine.net.dto.MembershipProductDto
import com.mynikatech.memgine.net.dto.BenefitDto
import com.mynikatech.memgine.net.dto.BenefitUsageRuleDto
import com.mynikatech.memgine.net.dto.StoreDto
import com.mynikatech.memgine.net.dto.CustomerHomeBootstrapDto
import com.mynikatech.memgine.net.dto.CustomerMembershipSummaryDto
import com.mynikatech.memgine.net.dto.OrganizationBrandingDto
import com.mynikatech.memgine.component.membership.MembershipProductService
import com.mynikatech.memgine.component.benefit.BenefitService
import com.mynikatech.memgine.component.store.StoreService
import com.mynikatech.memgine.component.organization.OrganizationService
import com.mynikatech.memgine.component.otp.BusinessOtpService
import com.mynikatech.memgine.component.otp.OtpPurpose
import com.mynikatech.memgine.component.otp.OtpRequestResult
import com.mynikatech.memgine.component.otp.OtpService
import com.mynikatech.memgine.security.PhoneNormalizer
import com.mynikatech.memgine.security.AuthenticatedPrincipal
import com.mynikatech.memgine.config.AuthenticationConfig
import com.mynikatech.memgine.component.payment.PaymentService
import com.mynikatech.memgine.component.customerexperience.CustomerExperienceReleaseSql
import com.mynikatech.memgine.net.dto.CustomerPurchaseOtpCompleteDto
import com.mynikatech.memgine.net.dto.CustomerPurchaseOtpRequestDto
import com.mynikatech.memgine.net.dto.AuthenticatedMembershipPaymentStartDto
import com.mynikatech.memgine.net.dto.CorporateCodeVerifyDto
import com.mynikatech.memgine.net.dto.CorporateCodeVerificationDto
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import com.mynikatech.memgine.net.dto.PaymentStartRequestDto
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import org.postgresql.util.PSQLException
import com.mynikatech.memgine.net.dto.CustomerMembershipPurchaseOfferQrDto
import java.security.MessageDigest
import java.security.SecureRandom
import com.mynikatech.memgine.component.membershipagreement.MembershipAgreementOperations
import com.mynikatech.memgine.net.dto.AcceptMembershipAgreementDto
import java.util.Base64
import kotlinx.serialization.Serializable
import java.time.Clock
import java.time.LocalDateTime

class CustomerService(
    private val sql: CustomerSql,
    private val memberships: MembershipProductService,
    private val benefits: BenefitService,
    private val stores: StoreService,
    private val organizations: OrganizationService,
    private val releases: CustomerExperienceReleaseSql,
    private val devIdentityEnabled: Boolean,
    private val businessOtp: BusinessOtpService,
    private val payments: PaymentService,
    private val otp: OtpService,
    private val phoneNormalizer: PhoneNormalizer,
    private val authenticationConfig: AuthenticationConfig,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val membershipOfferQrRandom = SecureRandom()
    private val agreementOperations = MembershipAgreementOperations(
        sql, memberships, benefits, stores, organizations, payments
    )

    @Serializable
    data class SelfProfileDto(
        val userId: String, val firstName: String, val middleName: String? = null,
        val lastName: String? = null, val displayName: String? = null,
        val primaryEmail: String? = null, val primaryPhone: String, val versionNo: Int
    )
    @Serializable
    data class SaveSelfProfileRequest(
        val firstName: String, val middleName: String? = null, val lastName: String? = null,
        val primaryEmail: String? = null, val versionNo: Int
    )
    
    @Serializable
    data class FreeMembershipActivationRequest(
        val planId: String,
        val idempotencyKey: String,
        val explicitOfferId: String? = null,
    )
    @Serializable data class PhoneChangeStartRequest(val newPhone: String, val regionCode: String? = null)
    @Serializable data class PhoneChangeOldVerifyRequest(val challengeId: String, val otp: String, val newPhone: String, val regionCode: String? = null)
    @Serializable data class PhoneChangeConfirmRequest(val challengeId: String, val otp: String)
    @Serializable data class PhoneChangeChallengeResponse(
        val challengeId: String,
        val expiresAt: String,
        val resendAt: String,
        val devCode: String? = null,
        val requiresCurrentPhoneVerification: Boolean,
    )

    fun selfProfile(userId: String): SelfProfileDto = sql.selfProfile(userId)?.toSelfProfile()
        ?: throw NotFoundException("Customer profile is unavailable")

    fun saveSelfProfile(userId: String, request: SaveSelfProfileRequest): SelfProfileDto = try {
        sql.saveSelfProfile(
            userId, request.firstName.trim(), request.middleName?.trim(), request.lastName?.trim(),
            request.primaryEmail?.trim(), request.versionNo
        )?.toSelfProfile() ?: throw ConflictException("Customer profile was changed elsewhere; refresh and try again")
    } catch (error: PSQLException) {
        when (error.sqlState) {
            "22023" -> throw BadRequestException("Invalid customer profile fields")
            "40001" -> throw ConflictException("Customer profile was changed elsewhere; refresh and try again")
            else -> throw error
        }
    }

    fun beginPhoneChange(
        principal: AuthenticatedPrincipal,
        request: PhoneChangeStartRequest,
    ): PhoneChangeChallengeResponse {
        val sessionId = principal.sessionId
            ?: throw ForbiddenException("Authenticated session is required")

        val profile = selfProfile(principal.userId)

        val replacement = phoneNormalizer.normalize(
            request.newPhone,
            request.regionCode
        ).e164

        if (replacement == profile.primaryPhone) {
            throw BadRequestException("Enter a different mobile number")
        }

        if (sql.phoneAssignedToAnotherUser(replacement, principal.userId)) {
            throw ConflictException(
                "A Memgine account already exists for this mobile number"
            )
        }

        val requiresCurrentPhoneVerification =
            !hasRecentOtpAuthentication(principal)

        val result = if (requiresCurrentPhoneVerification) {
            // Older session: verify existing mobile number first.
            otp.requestCustomerPhoneChange(
                profile.primaryPhone,
                OtpPurpose.CUSTOMER_PHONE_CHANGE_OLD,
                principal.userId,
                sessionId
            )
        } else {
            // Recently OTP-authenticated session:
            // verify only the replacement mobile number.
            otp.requestCustomerPhoneChange(
                replacement,
                OtpPurpose.CUSTOMER_PHONE_CHANGE_NEW,
                principal.userId,
                sessionId,
                profile.primaryPhone
            )
        }

        return PhoneChangeChallengeResponse(
            result.challengeId,
            result.expiresAt,
            result.resendAt,
            result.devCode,
            requiresCurrentPhoneVerification
        )
    }

    fun verifyCurrentPhoneAndRequestReplacement(
        principal: AuthenticatedPrincipal,
        request: PhoneChangeOldVerifyRequest,
    ): PhoneChangeChallengeResponse {
        val userId = principal.userId

        val sessionId = principal.sessionId
            ?: throw ForbiddenException("Authenticated session is required")

        val verified = otp.verifyCustomerPhoneChange(
            request.challengeId,
            request.otp,
            OtpPurpose.CUSTOMER_PHONE_CHANGE_OLD,
            userId,
            sessionId
        )

        val profile = selfProfile(userId)

        if (verified.destination != profile.primaryPhone) {
            throw BadRequestException(
                "Mobile verification is invalid or expired"
            )
        }

        val replacement = phoneNormalizer.normalize(
            request.newPhone,
            request.regionCode
        ).e164

        if (replacement == profile.primaryPhone) {
            throw BadRequestException("Enter a different mobile number")
        }

        if (sql.phoneAssignedToAnotherUser(replacement, userId)) {
            throw ConflictException(
                "A Memgine account already exists for this mobile number"
            )
        }

        val result = otp.requestCustomerPhoneChange(
            replacement,
            OtpPurpose.CUSTOMER_PHONE_CHANGE_NEW,
            userId,
            sessionId,
            profile.primaryPhone
        )

        return PhoneChangeChallengeResponse(
            result.challengeId,
            result.expiresAt,
            result.resendAt,
            result.devCode,
            requiresCurrentPhoneVerification = false
        )
    }
    fun verifyCorporateCode(org: String, user: String, request: CorporateCodeVerifyDto): CorporateCodeVerificationDto =
        CorporateCodeVerificationDto(memberships.verifyCorporateCode(org, request.productId, user, request.code))

    fun confirmReplacementPhone(
        principal: AuthenticatedPrincipal,
        request: PhoneChangeConfirmRequest
    ): SelfProfileDto {
        val userId = principal.userId

        val sessionId = principal.sessionId
            ?: throw ForbiddenException("Authenticated session is required")

        val verified = otp.verifyCustomerPhoneChange(
            request.challengeId,
            request.otp,
            OtpPurpose.CUSTOMER_PHONE_CHANGE_NEW,
            userId,
            sessionId
        )

        return try {
            sql.confirmSelfPhoneChange(
                userId,
                verified.expectedOldPhone
                    ?: throw BadRequestException(
                        "Mobile verification is invalid or expired"
                    ),
                verified.destination
            )?.toSelfProfile()
                ?: throw ConflictException(
                    "Mobile number could not be changed; restart verification"
                )
        } catch (error: PSQLException) {
            when (error.sqlState) {
                "23505" -> throw ConflictException(
                    "A Memgine account already exists for this mobile number"
                )
                "40001" -> throw ConflictException(
                    "Mobile number changed; restart verification"
                )
                else -> throw error
            }
        }
    }

    private fun hasRecentOtpAuthentication(principal: AuthenticatedPrincipal): Boolean {
        if (principal.sessionId.isNullOrBlank()) return false
        val verifiedAt = principal.otpAuthenticatedAt?.let {
            runCatching { LocalDateTime.parse(it.replace(' ', 'T')) }.getOrNull()
        } ?: return false
        val now = LocalDateTime.now(clock)
        val windowMinutes = authenticationConfig.recentOtpAuthenticationMinutes.coerceIn(1, 60)
        return !verifiedAt.isAfter(now) && !verifiedAt.isBefore(now.minusMinutes(windowMinutes))
    }

    private fun CustomerSelfProfileRow.toSelfProfile() = SelfProfileDto(
        userId, firstName, middleName, lastName, displayName, primaryEmail, primaryPhone, versionNo
    )

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
    fun membershipAgreementPreview(org: String, userId: String, planId: String, offerId: String?) =
        agreementOperations.preview(org, userId, planId, offerId)

    fun acceptMembershipAgreement(
        org: String,
        userId: String,
        request: AcceptMembershipAgreementDto,
        counterStoreId: String? = null,
        counterStaffId: String? = null,
        counterActorUserId: String? = null
    ) = agreementOperations.accept(
        org,
        userId,
        request,
        counterStoreId,
        counterStaffId,
        counterActorUserId
    )
    fun requireMembershipAgreement(
        org: String,
        userId: String,
        planId: String,
        key: String,
        offerId: String?
    ) = agreementOperations.requireAccepted(
        org,
        userId,
        planId,
        key,
        offerId
    )
    fun customerMembershipAgreements(org: String, userId: String) =
        agreementOperations.history(org, userId)


    fun discoverableOrganizations(
        userId: String? = null
    ): List<CustomerDiscoverableOrganizationDto> =
        sql.visibleOrganizations(
            userId,
            !devIdentityEnabled
        )

    fun requireCustomerBusinessAccess(
        organizationId: String,
        userId: String?
    ) {
        if (
            !devIdentityEnabled &&
            !sql.customerBusinessAccessAllowed(
                organizationId,
                userId
            )
        ) {
            throw NotFoundException(
                "Business is unavailable"
            )
        }
    }

    fun discoverableOrganization(
        organizationId: String,
        userId: String? = null
    ): CustomerDiscoveryDetailDto {
        if (
            organizationId.isBlank() ||
            organizationId.length > 40
        ) {
            throw NotFoundException(
                "Discoverable organization was not found"
            )
        }

        requireCustomerBusinessAccess(
            organizationId,
            userId
        )

        val row = sql.discoverableOrganization(
            organizationId
        ) ?: throw NotFoundException(
            "Discoverable organization was not found"
        )

        return json.decodeFromString(row.detailJson)
    }

    fun relationships(
        userId: String
    ): List<CustomerRelationshipDto> {
        validateUserId(userId)

        val relationships = sql.relationships(userId)

        return if (devIdentityEnabled) {
            relationships
        } else {
            relationships.filter {
                sql.customerBusinessAccessAllowed(
                    it.organizationId,
                    userId
                )
            }
        }
    }

    fun homeBootstrap(
        userId: String
    ): CustomerHomeBootstrapDto {
        validateUserId(userId)

        return CustomerHomeBootstrapDto(
            discoverableOrganizations =
                discoverableOrganizations(userId),
            relationships = relationships(userId),
            isDemoCustomer = sql.isDemoCustomer(userId),
        )
    }

    fun membershipSummary(organizationId: String, userId: String): CustomerMembershipSummaryDto {
        authorizeCustomer(organizationId, userId)
        val subscriptions = sql.subscriptions(organizationId, userId)
        val membershipProducts = memberships(organizationId, userId)
            .filter { product -> subscriptions.any { it.membershipProductId == product.id } }
        val benefitIds = membershipProducts.flatMap { it.benefitIds }.toSet()
        return CustomerMembershipSummaryDto(
            organizationId = organizationId,
            subscriptions = subscriptions,
            membershipProducts = membershipProducts,
            benefits = benefits(organizationId, userId).filter { it.id in benefitIds },
            branding = publishedBranding(organizationId),
        )
    }

    private fun publishedBranding(organizationId: String): OrganizationBrandingDto? {
        val releasedBranding = releases.getPublished(organizationId)
            ?.let { release ->
                json.parseToJsonElement(release.snapshotJson)
                    .jsonObject["organizationBranding"]
                    ?.let { json.decodeFromJsonElement<OrganizationBrandingDto>(it) }
            }
        if (releasedBranding != null) return releasedBranding
        val legacyBranding = json.decodeFromString<OrganizationBrandingDto>(
            organizations.getBranding(organizationId)
        )
        // Existing organizations without a release retain their legacy branding.
        // Once an administrator saves an explicit draft, customers see no mutable
        // draft branding until the normal Customer Experience release is published.
        return legacyBranding.takeIf { it.draftSavedAt == null }
    }

    fun subscriptions(organizationId: String, userId: String): List<CounterSubscriptionDto> {
        authorizeCustomer(organizationId, userId)
        return sql.subscriptions(organizationId, userId)
    }

    fun redemptions(organizationId: String, userId: String): List<OrgAdminRedemptionDto> {
        authorizeCustomer(organizationId, userId)
        return sql.redemptions(organizationId, userId)
    }

    fun redemptionItemStatuses(
        organizationId: String,
        subscriptionId: String,
        userId: String,
    ): List<CustomerRedemptionItemStatusDto> {
        authorizeCustomer(organizationId, userId)
        if (subscriptionId.isBlank() || subscriptionId.length > 64) {
            throw BadRequestException("Invalid subscription id")
        }
        return sql.redemptionItemStatuses(organizationId, subscriptionId, userId).map {
            CustomerRedemptionItemStatusDto(
                itemId = it.itemId,
                itemType = it.itemType,
                status = it.status,
                displayReason = it.displayReason,
            )
        }
    }

    fun redemptionTransactionStatus(
        organizationId: String,
        transactionId: String,
        userId: String,
    ): CustomerRedemptionTransactionStatusDto {
        authorizeCustomer(organizationId, userId)
        if (transactionId.isBlank() || transactionId.length > 64) {
            throw BadRequestException("Invalid redemption transaction id")
        }
        val row = sql.redemptionTransactionStatus(organizationId, transactionId, userId)
            ?: throw NotFoundException("Redemption transaction was not found")
        return CustomerRedemptionTransactionStatusDto(
            transactionId = row.transactionId,
            status = row.status,
            expiresAt = row.expiresAt,
            completedAt = row.completedAt,
        )
    }

    fun offers(organizationId: String, userId: String): List<OfferDto> {
        authorizeCustomer(organizationId, userId)
        return withOfferProducts(organizationId, sql.offers(organizationId, userId))
    }

    fun combinedOffers(organizationId: String, userId: String): List<CustomerCombinedOfferDto> {
        validateUserId(userId)
        if (organizationId.isBlank() || organizationId.length > 40) {
            throw BadRequestException("Invalid organization id")
        }

        // Regular redemption offers retain their existing relationship requirement.
        val regular = if (sql.hasActiveRelationship(organizationId, userId)) {
            withOfferProducts(organizationId, sql.offers(organizationId, userId)).map { offer ->
                CustomerCombinedOfferDto(
                    offerId = offer.id,
                    offerType = "REGULAR",
                    displayName = offer.offerName,
                    regularOffer = offer,
                )
            }
        } else {
            emptyList()
        }

        // Migration 133 evaluates membership-purchase eligibility for an active
        // global user, including prospective customers without organization_user.
        val membershipPurchase = sql.membershipPurchaseOffers(organizationId, userId)
            .groupBy { it.offerId }
            .map { (offerId, targets) ->
            CustomerCombinedOfferDto(
                offerId = offerId,
                offerType = "MEMBERSHIP_PURCHASE",
                displayName = targets.first().displayName,
                applicableMembershipProductIds = targets.map { it.membershipProductId }.distinct(),
            )
        }
        return regular + membershipPurchase
    }
    
    fun issueMembershipPurchaseOfferQr(
        organizationId: String,
        userId: String,
        offerId: String,
    ): CustomerMembershipPurchaseOfferQrDto {
        validateUserId(userId)

        if (organizationId.isBlank() || organizationId.length > 40) {
            throw BadRequestException("Invalid organization id")
        }
        if (offerId.isBlank() || offerId.length > 64) {
            throw BadRequestException("Invalid Membership Offer id")
        }

        val rawReference = ByteArray(32)
            .also(membershipOfferQrRandom::nextBytes)
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

        val tokenHash = MessageDigest.getInstance("SHA-256")
            .digest(rawReference.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }

        val row = try {
            sql.issueMembershipPurchaseOfferQr(
                organizationId,
                userId,
                offerId,
                tokenHash,
            ) ?: throw BadRequestException("Unable to generate Membership Offer QR")
        } catch (error: Exception) {
            val postgres = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<PSQLException>()
                .firstOrNull()

            when (postgres?.sqlState) {
                "P0002", "22023" ->
                    throw BadRequestException("Membership Offer is unavailable")
                "42501" ->
                    throw ForbiddenException("Membership Offer QR is not permitted")
                else -> throw error
            }
        }

        return CustomerMembershipPurchaseOfferQrDto(
            qrReference = rawReference,
            offerId = row.offerId,
            displayName = row.displayName,
            expiresAt = row.expiresAt,
        )
    }


    private fun publishedSavingsRows(organizationId: String, field: String) =
        releases.getPublished(organizationId)?.let { release ->
            json.parseToJsonElement(release.snapshotJson).jsonObject[field]?.jsonArray.orEmpty()
                .associateBy { json.decodeFromJsonElement<String>(it.jsonObject.getValue("id")) }
        }.orEmpty()

    fun memberships(organizationId: String, userId: String?): List<MembershipProductDto> {
        if (userId != null) authorizeCustomer(organizationId, userId)
        else if (organizationId.isBlank() || organizationId.length > 40)
            throw BadRequestException("Invalid organization id")
        val published = publishedSavingsRows(organizationId, "membershipProducts")
        val rows = memberships.list(organizationId, includeSavings = false).map { product ->
            val plans = published[product.id]?.jsonObject?.get("plans")?.jsonArray.orEmpty()
                .associateBy { it.jsonObject["id"]?.toString() }
            product.copy(plans = product.plans.map { plan ->
                val saved = plans[Json.encodeToString(plan.id)]?.jsonObject?.get("potentialSavings")
                plan.copy(potentialSavings = saved?.let { json.decodeFromJsonElement<com.mynikatech.memgine.net.dto.MembershipPotentialSavingsDto?>(it) })
            })
        }
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
        val published = publishedSavingsRows(organizationId, "benefits")
        val rows = benefits.list(organizationId, includeSavings = false).map { benefit ->
            val saved = published[benefit.id]?.jsonObject?.get("advertisedSavings")
            benefit.copy(advertisedSavings = saved?.let { json.decodeFromJsonElement<com.mynikatech.memgine.net.dto.AdvertisedSavingsDto?>(it) })
        }
        if (userId != null) return rows.map { it.copy(cost = null) }
        val ids = sql.joinBenefitIds(organizationId).toSet()
        return rows.filter { it.id in ids }.map { it.copy(cost = null) }
    }

    private fun withOfferProducts(organizationId: String, rows: List<OfferDto>): List<OfferDto> {
        if (rows.isEmpty()) return rows
        val products = sql.offerProducts(organizationId).groupBy { it.parentId }
        val published = publishedSavingsRows(organizationId, "offers")
        return rows.map { offer ->
            val choices = products[offer.id].orEmpty().map { it.product() }
            val saved = published[offer.id]?.jsonObject?.get("advertisedSavings")
            offer.copy(
                productIds = choices.map { it.productId }, products = choices,
                advertisedSavings = saved?.let { json.decodeFromJsonElement<com.mynikatech.memgine.net.dto.AdvertisedSavingsDto?>(it) },
            )
        }
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
        if (sql.discoverableOrganization(organizationId) == null || request.planId !in sql.joinPlanIds(organizationId)) {
            throw BadRequestException("Membership plan is unavailable")
        }
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

    fun completePurchaseOtp(organizationId: String, input: CustomerPurchaseOtpCompleteDto, authenticatedUserId: String?): Boolean {
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

        return true
    }

    fun startPurchasePayment(
        organizationId: String,
        request: PaymentStartRequestDto,
        authenticatedUserId: String
    ): PaymentIntentDto {

        val challengeId = request.challengeId
            ?.takeIf { it.isNotBlank() }
            ?: throw BadRequestException(
                "Purchase OTP verification is required"
            )

        val context = businessOtp.resolveVerified(
            challengeId,
            OtpPurpose.APP_MEMBERSHIP_PURCHASE_VERIFY
        )

        if (
            context.organizationId != organizationId ||
            context.userId != authenticatedUserId
        ) {
            throw ForbiddenException(
                "Business verification does not match this purchase"
            )
        }

        val agreementPlanId = context.planId
            ?: throw BadRequestException(
                "Verified membership plan is required"
            )

        agreementOperations.requireAccepted(
            organizationId,
            authenticatedUserId,
            agreementPlanId,
            request.idempotencyKey,
            request.explicitOfferId
        )

        return payments.startMembershipPayment(
            organizationId,
            request,
            authenticatedUserId
        )
    }

    fun startAuthenticatedPurchasePayment(
        organizationId: String,
        customerUserId: String,
        request: AuthenticatedMembershipPaymentStartDto
    ): PaymentIntentDto {
        agreementOperations.requireAccepted(organizationId, customerUserId, request.planId, request.idempotencyKey, request.explicitOfferId)
        return payments.startAuthenticatedMembershipPayment(
            organizationId,
            request.planId,
            customerUserId,
            request.idempotencyKey,
            request.returnContext,
            request.explicitOfferId
        )
    }
    
    
    fun activateFreeMembership(
        organizationId: String,
        customerUserId: String,
        request: FreeMembershipActivationRequest
    ): CounterPurchaseResult {
        if (
            request.planId.isBlank() ||
            request.planId.length > 64 ||
            request.idempotencyKey.isBlank() ||
            request.idempotencyKey.length > 128 ||
            (request.explicitOfferId != null &&
                (request.explicitOfferId.isBlank() ||
                    request.explicitOfferId.length > 64))
        ) {
            throw BadRequestException("Invalid membership activation request")
        }

        // The current agreement, plan, offer and idempotency key
        // must match the customer's saved acceptance.
        agreementOperations.requireAccepted(
            organizationId,
            customerUserId,
            request.planId,
            request.idempotencyKey,
            request.explicitOfferId
        )

        // The database transaction independently verifies:
        // zero payable, eligibility, Corporate access and duplicates.
        return sql.activateZeroTotalMembership(
            organizationId = organizationId,
            customerUserId = customerUserId,
            planId = request.planId,
            explicitOfferId = request.explicitOfferId,
            idempotencyKey = request.idempotencyKey,
            actorUserId = customerUserId,
        ) ?: throw ConflictException(
            "Membership could not be activated. Please try again."
        )
    }


    fun purchaseQuote(organizationId: String, customerUserId: String, planId: String, explicitOfferId: String?) =
        payments.quoteCustomerMembership(organizationId, planId, customerUserId, explicitOfferId)

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
        requireCustomerBusinessAccess(
            organizationId,
            userId
        )
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
