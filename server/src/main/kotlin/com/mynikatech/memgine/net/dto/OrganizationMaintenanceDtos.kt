package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class OrganizationAdministrativeUserDto(
    val assignmentId: String,
    val organizationUserId: String,
    val organizationId: String,
    val userId: String,
    val firstName: String,
    val lastName: String? = null,
    val displayName: String,
    val primaryEmail: String? = null,
    val primaryPhone: String,
    val roleCode: String,
    val assignmentStatusId: String,
    val effectiveFrom: String,
    val effectiveTo: String? = null
)

@Serializable
data class SaveOrganizationAdministrativeUserRequest(
    val firstName: String,
    val lastName: String? = null,
    val primaryEmail: String? = null,
    val primaryPhone: String,
    val roleCode: String,
    val effectiveFrom: String? = null,
    val effectiveTo: String? = null
)
