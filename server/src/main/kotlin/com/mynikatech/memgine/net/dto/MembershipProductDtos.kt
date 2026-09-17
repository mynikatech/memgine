package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class MembershipProductRowDto(
    val id: String, val organizationId: String, val membershipProductCode: String,
    val membershipProductName: String, val displayName: String? = null,
    val productCategoryId: String, val productTypeId: String,
    val tier: String? = null, val tierSequence: Int? = null,
    val description: String? = null, val productStatusId: String,
    val effectiveDate: String, val expiryDate: String? = null,
    val createdAt: String, val createdBy: String, val updatedAt: String,
    val updatedBy: String, val isDeleted: Boolean, val versionNo: Int
)

@Serializable
data class SubscriptionPlanDto(
    val id: String, val membershipProductId: String,
    val subscriptionPlanCode: String, val subscriptionPlanName: String,
    val description: String? = null, val subscriptionPeriod: Int,
    val subscriptionPeriodUnit: String, val price: Double,
    val currencyId: String, val currencyCode: String,
    val subscriptionPlanStatusId: String, val effectiveDate: String,
    val expiryDate: String? = null, val createdAt: String, val createdBy: String,
    val updatedAt: String, val updatedBy: String, val isDeleted: Boolean,
    val versionNo: Int
)

@Serializable
data class MembershipProductDto(
    val id: String, val organizationId: String, val membershipProductCode: String,
    val membershipProductName: String, val displayName: String? = null,
    val productCategoryId: String, val productTypeId: String,
    val tier: String? = null, val tierSequence: Int? = null,
    val description: String? = null, val productStatusId: String,
    val effectiveDate: String, val expiryDate: String? = null,
    val benefitIds: List<String>, val plans: List<SubscriptionPlanDto>,
    val createdAt: String, val createdBy: String, val updatedAt: String,
    val updatedBy: String, val isDeleted: Boolean, val versionNo: Int
)

@Serializable
data class SubscriptionPlanWriteDto(
    val id: String, val subscriptionPlanCode: String,
    val subscriptionPlanName: String, val description: String? = null,
    val subscriptionPeriod: Int, val subscriptionPeriodUnit: String,
    val price: Double, val currencyId: String,
    val subscriptionPlanStatusId: String, val effectiveDate: String,
    val expiryDate: String? = null, val versionNo: Int = 1
)

@Serializable
data class MembershipProductWriteDto(
    val id: String, val membershipProductCode: String,
    val membershipProductName: String, val displayName: String? = null,
    val productCategoryId: String, val productTypeId: String,
    val tier: String? = null, val tierSequence: Int? = null,
    val description: String? = null, val productStatusId: String,
    val effectiveDate: String, val expiryDate: String? = null,
    val versionNo: Int = 1, val benefitIds: List<String>,
    val plans: List<SubscriptionPlanWriteDto>
)

@Serializable
data class DeleteMembershipProductDto(val membershipProductId: String, val deleted: Boolean)
