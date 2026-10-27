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
    val redemptionMethod: String,
    val productSelections: Map<String, String> = emptyMap()
)
@Serializable
data class RedemptionProductChoiceDto(
    var productId: String = "",
    var productName: String = "",
    var productCode: String? = null,
    var availableStoreIds: List<String>? = null
)

@Serializable
data class CustomerCreateRedemptionTransactionRequest(
    val subscriptionId: String,
    val benefitIds: List<String> = emptyList(),
    val offerIds: List<String> = emptyList(),
    val redemptionMethod: String = "CUSTOMER_QR",
    val productSelections: Map<String, String> = emptyMap()
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
    val staffId: String,
    /** Required for a newly prepared checkout; omitted only for persisted recovery. */
    val reviewHash: String? = null
)

@Serializable
data class CounterRedemptionReviewAllocationDto(
    val redemptionItemId: String,
    val itemType: String,
    val benefitId: String? = null,
    val offerId: String? = null,
    val adjustmentId: String,
    val adjustmentType: String,
    val appliedAmountMinor: Long
)

@Serializable
data class CounterRedemptionReviewLineDto(
    val redemptionItemId: String,
    val productMappingId: String,
    val canonicalProductId: String,
    val productName: String,
    val quantity: Int,
    val unitPriceMinor: Long,
    val lineSubtotalMinor: Long,
    val currencyCode: String,
    val allocations: List<CounterRedemptionReviewAllocationDto>
)

/**
 * Read-only price review. Amounts exclude provider-order-only tax and are
 * explicitly labelled so Counter staff cannot treat them as final Poynt totals.
 */
@Serializable
data class CounterRedemptionCheckoutReviewDto(
    val redemptionTransactionId: String,
    val transactionNumber: String,
    val redemptionVersionNo: Int,
    val expiresAt: String? = null,
    val providerCode: String,
    val currencyCode: String,
    val lines: List<CounterRedemptionReviewLineDto>,
    val subtotalMinor: Long,
    val adjustmentTotalMinor: Long,
    val taxTotalMinor: Long? = null,
    val payableTotalMinor: Long,
    val pricingStatus: String,
    val reviewHash: String
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
    val pricingReconciliationRequired: Boolean = false,
    val pricingReconciliationHash: String? = null,
    val pricingAcknowledged: Boolean = false,
    val pricingDiscrepancies: List<CounterRedemptionPriceDiscrepancyDto> = emptyList(),
    val paymentRequired: Boolean
)

/**
 * A server-authoritative, staff-scoped recovery entry.  It deliberately
 * contains no payment token, terminal credential, or provider payload.
 */
@Serializable
data class CounterPendingTransactionDto(
    val redemptionTransactionId: String,
    val transactionNumber: String,
    val commerceTransactionId: String,
    val organizationId: String,
    val storeId: String,
    val customerUserId: String? = null,
    val customerDisplayName: String? = null,
    val redemptionStatus: String,
    val commerceStatus: String,
    val providerCode: String,
    val amountMinor: Long? = null,
    val currencyCode: String? = null,
    val createdAt: String,
    val lastAttemptAt: String? = null,
    val lastAttemptStatus: String? = null,
    val retryAllowed: Boolean,
    val unresolvedPayment: Boolean,
    val financialExceptionId: String? = null
)

/** Persisted provider-vs-snapshot product price difference for Counter staff review. */
@Serializable
data class CounterRedemptionPriceDiscrepancyDto(
    val lineId: String,
    val productMappingId: String? = null,
    val externalProductId: String? = null,
    val externalVariantId: String? = null,
    val productName: String,
    val storedPriceMinor: Long,
    val storedCurrencyCode: String,
    val poyntPriceMinor: Long,
    val poyntCurrencyCode: String
)

@Serializable
data class CounterRedemptionPricingAcknowledgementRequest(
    val storeId: String,
    val staffId: String,
    val pricingReconciliationHash: String
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
