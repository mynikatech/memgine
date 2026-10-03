package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

/** Server-side basket contracts. */
@Serializable
data class CreateRedemptionTransactionRequest(
    val storeId: String,
    val staffId: String,
    val subscriptionId: String,
    val benefitIds: List<String> = emptyList(),
    val offerIds: List<String> = emptyList(),
    val redemptionMethod: String
)

@Serializable
data class CustomerCreateRedemptionTransactionRequest(
    val subscriptionId: String,
    val benefitIds: List<String> = emptyList(),
    val offerIds: List<String> = emptyList(),
    val redemptionMethod: String = "CUSTOMER_QR"
)

@Serializable
data class RedemptionTransactionDto(
    val transactionId: String,
    val transactionNumber: String,
    val status: String,
    val expiresAt: String? = null,
    val completedAt: String? = null
)

@Serializable
data class CustomerRedemptionTransactionStatusDto(
    val transactionId: String,
    val status: String,
    val expiresAt: String? = null,
    val completedAt: String? = null,
)

/** Opaque, short-lived reference rendered by the customer as a redemption QR. */
@Serializable
data class RedemptionTransactionQrDto(
    val qrReference: String,
    val transactionNumber: String,
    val expiresAt: String
)

/** Customer-safe, server-derived availability for one item in a subscription redemption basket. */
@Serializable
data class CustomerRedemptionItemStatusDto(
    val itemId: String,
    val itemType: String,
    val status: String,
    val displayReason: String? = null
)

/** Counter-safe presentation of the existing server-derived redemption status. */
@Serializable
data class CounterRedemptionSelectionItemDto(
    val id: String,
    val itemType: String,
    val displayName: String,
    val description: String? = null,
    val status: String,
    val displayReason: String? = null,
    val badgeText: String? = null,
    val discountPercentage: Double? = null,
    val promotionImageUrl: String? = null,
    val disclaimerText: String? = null
)

@Serializable
data class CounterRedemptionSelectionDto(
    val benefits: List<CounterRedemptionSelectionItemDto>,
    val offers: List<CounterRedemptionSelectionItemDto>
)

/** Internal JDBI result. The raw QR reference is never persisted. */
data class RedemptionTransactionQrIssueRow(
    var qrId: String = "",
    var transactionNumber: String = "",
    var expiresAt: String = ""
)

@Serializable
data class RedemptionTransactionValidationDto(
    val itemId: String,
    val itemType: String,
    val benefitId: String? = null,
    val offerId: String? = null,
    val displayName: String? = null,
    val description: String? = null,
    val eligible: Boolean,
    val rejectionReason: String? = null
)

@Serializable
data class ExecuteRedemptionTransactionRequest(
    val storeId: String,
    val staffId: String
)

/**
 * Store/staff context for the shared Counter redemption Commerce checkout.
 *
 * No amount, provider ID, provider order ID, or terminal identity is accepted
 * from the client.
 */
@Serializable
data class CounterRedemptionCheckoutRequest(
    val storeId: String,
    val staffId: String
)

/**
 * Server-authoritative state for a Counter Benefit/Offer redemption checkout.
 * Monetary values are always minor units and come from persisted Commerce state.
 */
@Serializable
data class CounterRedemptionCheckoutDto(
    val redemptionTransactionId: String,
    val transactionNumber: String,
    val redemptionStatus: String,
    val redemptionCompletedAt: String? = null,
    val commerceTransactionId: String,
    val providerCode: String,
    val commerceStatus: String,
    val subtotalMinor: Long? = null,
    val adjustmentTotalMinor: Long? = null,
    val taxTotalMinor: Long? = null,
    val totalMinor: Long? = null,
    val currencyCode: String? = null,
    val providerOrderId: String? = null,
    val providerTransactionId: String? = null,
    val failureCode: String? = null,
    val failureMessage: String? = null,
    val paymentRequired: Boolean
)

/**
 * LOCAL/DEV-only TEST-provider result.
 *
 * Amount/currency/provider transaction identity remain server-generated.
 */
@Serializable
data class CounterRedemptionTestPaymentRequest(
    val storeId: String,
    val staffId: String,
    val status: String = "SUCCEEDED",
    val failureCode: String? = null,
    val failureMessage: String? = null
)
