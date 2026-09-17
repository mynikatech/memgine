package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class OfferDto(
    val id: String, val organizationId: String, val offerCode: String,
    val offerName: String, val description: String? = null,
    val membershipProductId: String? = null, val storeId: String? = null,
    val promotionImageUrl: String, val badgeText: String? = null,
    val availabilityText: String? = null, val ctaLabel: String,
    val ctaType: String, val ctaTarget: String? = null,
    val discountPercentage: Double? = null, val effectiveDate: String,
    val expiryDate: String? = null, val statusId: String,
    val createdAt: String, val createdBy: String, val updatedAt: String,
    val updatedBy: String, val isDeleted: Boolean, val versionNo: Int
)

@Serializable
data class OfferUsageRuleDto(
    val id: String, val offerId: String, val ruleName: String,
    val frequencyType: String, val frequencyInterval: Int, val usageLimit: Int,
    val windowStartTime: String? = null, val windowEndTime: String? = null,
    val applicableDays: String? = null, val timeZone: String? = null,
    val effectiveDate: String, val expiryDate: String? = null,
    val offerUsageRuleStatusId: String, val createdAt: String,
    val createdBy: String, val updatedAt: String, val updatedBy: String,
    val isDeleted: Boolean, val versionNo: Int
)

@Serializable
data class OfferWriteDto(
    val id: String, val offerCode: String, val offerName: String,
    val description: String? = null, val membershipProductId: String? = null,
    val storeId: String? = null, val promotionImageUrl: String,
    val badgeText: String? = null, val availabilityText: String? = null,
    val ctaLabel: String, val ctaType: String, val ctaTarget: String? = null,
    val discountPercentage: Double? = null, val effectiveDate: String,
    val expiryDate: String? = null, val statusId: String, val versionNo: Int = 1,
    val rules: List<OfferUsageRuleWriteDto> = emptyList()
)

@Serializable
data class OfferUsageRuleWriteDto(
    val id: String, val ruleName: String, val frequencyType: String,
    val frequencyInterval: Int, val usageLimit: Int,
    val windowStartTime: String? = null, val windowEndTime: String? = null,
    val applicableDays: String? = null, val timeZone: String? = null,
    val effectiveDate: String, val expiryDate: String? = null,
    val offerUsageRuleStatusId: String, val versionNo: Int = 1
)

@Serializable
data class OfferBundleDto(val offer: OfferDto, val rules: List<OfferUsageRuleDto>)

@Serializable
data class DeleteOfferDto(val offerId: String, val deleted: Boolean)
