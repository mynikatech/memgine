package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class CounterPurchaseRequest(
    val storeId: String, val staffId: String, val planId: String,
    val customerUserId: String? = null, val firstName: String? = null,
    val lastName: String? = null, val primaryEmail: String? = null,
    val primaryPhone: String? = null
)

@Serializable
data class CounterSubscriptionDto(
    val id: String, val subscriptionNumber: String, val organizationUserId: String,
    val customerName: String, val customerEmail: String? = null,
    val customerPhone: String, val subscriptionPlanName: String,
    val subscriptionPlanCode: String, val membershipProductName: String,
    val subscriptionDate: String, val startDate: String, val endDate: String,
    val subscriptionStatusId: String, val statusCode: String, val statusName: String,
    val totalAmount: Double, val currencyCode: String, val createdAt: String,
    val userId: String, val subscriptionPlanId: String, val membershipProductId: String
)

@Serializable
data class CounterPurchaseResult(
    val subscriptionId: String, val organizationUserId: String, val userId: String,
    val subscriptionNumber: String, val subscriptionPlanId: String,
    val subscriptionDate: String, val startDate: String, val endDate: String,
    val subscriptionStatusId: String, val totalAmount: Double, val currencyCode: String
)

@Serializable
data class CounterRedeemRequest(
    val storeId: String, val staffId: String, val subscriptionId: String,
    val benefitIds: List<String>
)

@Serializable
data class CounterRedemptionResult(
    val redemptionId: String, val benefitId: String, val redemptionNumber: String
)

@Serializable
data class CounterEligibilityDto(val benefitId: String, val reason: String? = null)

@Serializable
data class CounterCustomerLookupRequest(
    val phone: String,
    val regionCode: String? = null
)

@Serializable
data class CounterCustomerLookupDto(
    val userId: String,
    val displayName: String,
    val primaryPhone: String
)

@Serializable
data class CounterQrDto(
    val token: String, val qrCodeTypeId: String, val subscriptionId: String,
    val customerUserId: String, val customerName: String
)

@Serializable
data class CounterQrRedeemRequest(
    val storeId: String, val staffId: String, val token: String
)

/**
 * Request one business-bound Counter OTP. Exactly one of purchase/redemption
 * must be supplied. The server selects the canonical phone for existing users.
 */
@Serializable
data class CounterBusinessOtpRequest(
    val phone: String? = null,
    val regionCode: String? = null,
    val purchase: CounterPurchaseRequest? = null,
    val redemption: CounterRedeemRequest? = null
)

/** Verify the OTP only. This does not execute a Counter purchase. */
@Serializable
data class CounterBusinessOtpCompleteRequest(
    val challengeId: String,
    val otp: String
)

/** Finalize a purchase after its OTP has already been verified and payment succeeded. */
@Serializable
data class CounterBusinessOtpFinalizeRequest(
    val challengeId: String
)
