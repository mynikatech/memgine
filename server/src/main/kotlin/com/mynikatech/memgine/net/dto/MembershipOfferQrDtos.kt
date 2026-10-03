package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class CustomerMembershipPurchaseOfferDto(
    val offerId: String,
    val displayName: String
)

@Serializable
data class CustomerMembershipPurchaseOfferQrDto(
    val qrReference: String,
    val offerId: String,
    val displayName: String,
    val expiresAt: String
)

data class CustomerMembershipPurchaseOfferQrIssueRow(
    var offerId: String = "",
    var displayName: String = "",
    var expiresAt: String = ""
)
