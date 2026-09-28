package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class CustomerChoiceDto(val userId: String, val displayName: String)

@Serializable
data class CustomerDiscoverableOrganizationDto(
    val organizationId: String,
    val name: String,
    val displayName: String? = null,
    val logoUrl: String? = null,
    val tagline: String? = null
)

/** Sanitized published experience for an unaffiliated customer. */
@Serializable
data class CustomerDiscoveryDetailDto(
    val organization: CustomerDiscoveryOrganizationDetailDto,
    val publishedExperience: CustomerDiscoveryPublishedExperienceDto,
    val membershipProducts: List<CustomerDiscoveryMembershipProductDto>,
    val benefits: List<CustomerDiscoveryBenefitDto>,
    val benefitUsageRules: List<CustomerDiscoveryUsageRuleDto>,
    val offers: List<CustomerDiscoveryOfferDto>,
    val offerUsageRules: List<CustomerDiscoveryUsageRuleDto>,
    val stores: List<CustomerDiscoveryStoreDto>,
)

@Serializable
data class CustomerDiscoveryOrganizationDetailDto(
    val id: String,
    val name: String,
    val displayName: String? = null,
    val website: String? = null,
    val primaryEmail: String? = null,
    val primaryPhone: JsonObject? = null,
)

@Serializable
data class CustomerDiscoveryPublishedExperienceDto(
    val configuration: JsonObject,
    val template: JsonObject,
    val definition: JsonObject,
    val organizationBranding: JsonObject? = null,
    val organizationDetails: JsonObject? = null,
)

@Serializable
data class CustomerDiscoveryMembershipProductDto(
    val id: String,
    val membershipProductName: String,
    val displayName: String? = null,
    val tier: String? = null,
    val tierSequence: Int? = null,
    val description: String? = null,
    val benefitIds: List<String> = emptyList(),
    val plans: List<CustomerDiscoverySubscriptionPlanDto> = emptyList(),
)

@Serializable
data class CustomerDiscoverySubscriptionPlanDto(
    val id: String,
    val subscriptionPlanName: String,
    val subscriptionPlanCode: String? = null,
    val description: String? = null,
    val subscriptionPeriod: Int,
    val subscriptionPeriodUnit: String,
    val price: JsonObject,
)

@Serializable
data class CustomerDiscoveryBenefitDto(
    val id: String,
    val benefitName: String,
    val displayName: String? = null,
    val description: String? = null,
    val benefitTypeId: String,
)

@Serializable
data class CustomerDiscoveryOfferDto(
    val id: String,
    val offerName: String,
    val description: String? = null,
    val promotionImageUrl: String? = null,
    val badgeText: String? = null,
    val availabilityText: String? = null,
    val membershipProductId: String? = null,
    val discountPercentage: Double? = null,
    val ctaLabel: String? = null,
)

@Serializable
data class CustomerDiscoveryStoreDto(
    val id: String,
    val name: String,
    val address: JsonObject,
)

@Serializable
data class CustomerDiscoveryUsageRuleDto(
    val id: String,
    val ruleName: String,
    val frequencyType: String,
    val frequencyInterval: Int,
    val usageLimit: Int,
    val windowStartTime: String? = null,
    val windowEndTime: String? = null,
    val applicableDays: List<String> = emptyList(),
    val timeZone: String? = null,
    val benefitId: String? = null,
    val offerId: String? = null,
)

@Serializable
data class CustomerRelationshipDto(
    val organizationUserId: String, val organizationId: String, val organizationName: String,
    val userId: String, val userCode: String, val firstName: String,
    val middleName: String? = null, val lastName: String? = null,
    val displayName: String? = null, val primaryEmail: String? = null,
    val primaryPhone: String, val userStatusId: String, val userStatusName: String,
    val organizationUserTypeId: String, val organizationUserStatusId: String,
    val relationshipStatusName: String, val joiningDate: String,
    val subscriptionCount: Int, val membershipName: String? = null
)

@Serializable
data class CustomerPurchaseRequestDto(
    val planId: String,
    val customerUserId: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val primaryEmail: String? = null,
    val primaryPhone: String? = null
)

@Serializable
data class CustomerPurchaseOtpRequestDto(val phone: String? = null, val regionCode: String? = null, val purchase: CustomerPurchaseRequestDto)

@Serializable
data class CustomerPurchaseOtpCompleteDto(val challengeId: String, val otp: String)

@Serializable
data class CustomerPreferenceValueDto(val value: String? = null)
