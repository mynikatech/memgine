package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class OrgAdminCustomerDto(
    val organizationUserId: String, val userId: String, val userCode: String,
    val firstName: String, val middleName: String? = null, val lastName: String? = null,
    val displayName: String? = null, val primaryEmail: String? = null,
    val primaryPhone: String, val userStatusId: String, val userStatusName: String,
    val organizationUserTypeId: String, val organizationUserStatusId: String,
    val relationshipStatusName: String, val joiningDate: String,
    val subscriptionCount: Int, val membershipName: String? = null
)

@Serializable
data class CreateProspectiveCustomerDto(
    val firstName: String, val middleName: String? = null,
    val lastName: String, val displayName: String? = null,
    val primaryEmail: String? = null, val primaryPhone: String
)

@Serializable
data class ProspectiveCustomerCreatedDto(val organizationUserId: String)
