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
data class RedemptionTransactionValidationDto(
    val itemId: String,
    val itemType: String,
    val benefitId: String? = null,
    val offerId: String? = null,
    val eligible: Boolean,
    val rejectionReason: String? = null
)

@Serializable
data class ExecuteRedemptionTransactionRequest(val storeId: String, val staffId: String)
