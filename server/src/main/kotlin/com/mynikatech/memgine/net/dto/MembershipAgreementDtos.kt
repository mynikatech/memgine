package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class MembershipAgreementPreviewDto(
    val organizationId: String,
    val membershipProductId: String,
    val planId: String,
    val agreementText: String,
    val agreementSha256: String
)

@Serializable
data class AcceptMembershipAgreementDto(
    val planId: String,
    val idempotencyKey: String,
    val agreementSha256: String,
    val explicitOfferId: String? = null,
    val acceptanceChannel: String
)

@Serializable
data class MembershipAgreementAcceptedDto(
    val acceptanceId: String,
    val organizationId: String,
    val customerUserId: String,
    val membershipProductId: String,
    val purchaseReference: String,
    val acceptanceChannel: String,
    val agreementText: String,
    val agreementSha256: String,
    val acceptedAt: String,
    val subscriptionId: String? = null
)
