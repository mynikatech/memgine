package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class BenefitDto(
    val id: String,
    val organizationId: String,
    val benefitCode: String,
    val benefitName: String,
    val displayName: String? = null,
    val benefitCategoryId: String,
    val benefitTypeId: String,
    val description: String? = null,
    val benefitStatusId: String,
    val productId: String? = null,
    val retailPrice: Double? = null,
    val cost: Double? = null,
    val effectiveDate: String,
    val expiryDate: String? = null,
    val createdAt: String,
    val createdBy: String,
    val updatedAt: String,
    val updatedBy: String,
    val isDeleted: Boolean,
    val versionNo: Int
)

@Serializable
data class BenefitUsageRuleDto(
    val id: String,
    val benefitId: String,
    val ruleName: String,
    val frequencyType: String,
    val frequencyInterval: Int,
    val usageLimit: Int,
    val windowStartTime: String? = null,
    val windowEndTime: String? = null,
    val applicableDays: String? = null,
    val timeZone: String? = null,
    val effectiveDate: String,
    val expiryDate: String? = null,
    val benefitUsageRuleStatusId: String,
    val createdAt: String,
    val createdBy: String,
    val updatedAt: String,
    val updatedBy: String,
    val isDeleted: Boolean,
    val versionNo: Int
)

@Serializable
data class CatalogProductDto(
    val id: String,
    val organizationId: String,
    val productCode: String,
    val productName: String,
    val description: String? = null,
    val statusId: String,
    val createdAt: String,
    val createdBy: String,
    val updatedAt: String,
    val updatedBy: String,
    val isDeleted: Boolean,
    val versionNo: Int
)

@Serializable
data class BenefitWriteDto(
    val id: String,
    val benefitCode: String,
    val benefitName: String,
    val displayName: String? = null,
    val benefitCategoryId: String,
    val benefitTypeId: String,
    val description: String? = null,
    val benefitStatusId: String,
    val productId: String? = null,
    val retailPrice: Double? = null,
    val cost: Double? = null,
    val effectiveDate: String,
    val expiryDate: String? = null,
    val rules: List<BenefitUsageRuleWriteDto> = emptyList()
)

@Serializable
data class BenefitUsageRuleWriteDto(
    val id: String,
    val ruleName: String,
    val frequencyType: String,
    val frequencyInterval: Int,
    val usageLimit: Int,
    val windowStartTime: String? = null,
    val windowEndTime: String? = null,
    val applicableDays: String? = null,
    val timeZone: String? = null,
    val effectiveDate: String,
    val expiryDate: String? = null,
    val benefitUsageRuleStatusId: String
)

@Serializable
data class BenefitBundleDto(
    val benefit: BenefitDto,
    val rules: List<BenefitUsageRuleDto>
)

@Serializable
data class DeleteBenefitDto(val benefitId: String, val deleted: Boolean)
