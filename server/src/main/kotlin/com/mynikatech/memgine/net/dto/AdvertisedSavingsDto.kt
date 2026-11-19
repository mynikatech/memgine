package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class AdvertisedSavingsMoneyDto(val amountMinor: Long, val currency: String, val decimalPlaces: Int = 2)

@Serializable
data class AdvertisedSavingsDto(
    val calculated: AdvertisedSavingsMoneyDto? = null,
    val override: AdvertisedSavingsMoneyDto? = null,
    val effective: AdvertisedSavingsMoneyDto? = null,
    val source: String? = null,
    val basis: String? = null,
)

@Serializable
data class MembershipPotentialSavingsDto(
    // Effective display amount. Calculation metadata is retained for overrides.
    val amountMinor: Long,
    val currency: String,
    val decimalPlaces: Int,
    val period: Int,
    val periodUnit: String,
    val complete: Boolean,
    val assumptions: String,
    val breakdown: List<MembershipBenefitValueDto>,
    val calculatedAmountMinor: Long? = null,
    val overrideAmountMinor: Long? = null,
    val source: String? = null,
)

@Serializable
data class MembershipBenefitValueDto(val benefitId: String, val uses: Long?, val amountMinor: Long?)
