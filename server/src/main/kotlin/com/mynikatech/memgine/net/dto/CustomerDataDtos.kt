package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class CustomerChoiceDto(val userId: String, val displayName: String)

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
data class CustomerPreferenceValueDto(val value: String? = null)
