package com.mynikatech.memgine.component.counter

import kotlinx.serialization.Serializable

@Serializable
data class CounterAgreementReviewDto(
    val organizationId: String,
    val membershipProductId: String,
    val planId: String,
    val agreementText: String,
    val agreementSha256: String,
    val purchaseQuote:
        com.mynikatech.memgine.net.dto.CounterMembershipPurchaseQuoteDto
)

@Serializable
data class CounterAgreementAcceptanceRequest(
    val storeId: String,
    val staffId: String,
    val challengeId: String,
    val planId: String,
    val idempotencyKey: String,
    val agreementSha256: String,
    val explicitOfferId: String? = null,
    val acceptanceChannel: String
)