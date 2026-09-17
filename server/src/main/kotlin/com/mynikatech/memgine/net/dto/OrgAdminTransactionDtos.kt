package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class OrgAdminSubscriptionDto(
    val id: String, val subscriptionNumber: String, val organizationUserId: String,
    val customerName: String, val customerEmail: String? = null,
    val customerPhone: String, val subscriptionPlanName: String,
    val subscriptionPlanCode: String, val membershipProductName: String,
    val subscriptionDate: String, val startDate: String, val endDate: String,
    val subscriptionStatusId: String, val statusCode: String, val statusName: String,
    val totalAmount: Double, val currencyCode: String, val createdAt: String
)

@Serializable
data class OrgAdminRedemptionDto(
    val id: String, val redemptionNumber: String, val subscriptionId: String,
    val subscriptionNumber: String, val customerName: String,
    val customerEmail: String? = null, val customerPhone: String,
    val benefitId: String, val benefitName: String, val benefitCode: String,
    val storeId: String, val storeName: String, val storeCode: String,
    val staffId: String? = null, val staffName: String? = null,
    val staffCode: String? = null, val redemptionDateTime: String,
    val quantity: Int, val redemptionStatusId: String,
    val statusCode: String, val statusName: String, val remarks: String? = null,
    val createdAt: String, val createdBy: String, val updatedAt: String,
    val updatedBy: String, val versionNo: Int
)
