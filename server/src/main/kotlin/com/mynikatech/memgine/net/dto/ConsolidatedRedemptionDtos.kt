package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

/** Server-side basket contracts. Counter and QR clients will be wired in a later phase. */
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
data class ExecuteRedemptionTransactionRequest(val storeId: String, val staffId: String)
