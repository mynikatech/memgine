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
    val existingUserId: String? = null,
    val firstName: String,
    val lastName: String? = null,
    val primaryEmail: String? = null,
    val primaryPhone: String,
    val roleCode: String,
    val effectiveFrom: String? = null,
    val effectiveTo: String? = null
)

@Serializable
data class ExistingUserOrganizationAssociationDto(
    val organizationId: String,
    val organizationName: String,
    val roles: List<String>
)

@Serializable
data class ExistingOrganizationUserLookupDto(
    val userId: String,
    val firstName: String,
    val lastName: String? = null,
    val displayName: String,
    val primaryEmail: String? = null,
    val primaryPhone: String,
    val alreadyInTargetOrganization: Boolean,
    val organizations: List<ExistingUserOrganizationAssociationDto>
)
