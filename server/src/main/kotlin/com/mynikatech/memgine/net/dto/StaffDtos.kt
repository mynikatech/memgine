package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class StaffDto(
    val id: String,
    val organizationId: String,
    val organizationUserId: String,
    val staffCode: String,
    val designation: String? = null,
    val storeId: String? = null,
    val joiningDate: String,
    val relievingDate: String? = null,
    val staffStatusId: String,
    val roleCode: String,
    val createdAt: String,
    val createdBy: String,
    val updatedAt: String,
    val updatedBy: String,
    val isDeleted: Boolean,
    val versionNo: Int
)

@Serializable
data class CreateStaffRequestDto(
    val id: String,
    val organizationUserId: String,
    val staffCode: String,
    val designation: String? = null,
    val storeId: String? = null,
    val joiningDate: String,
    val relievingDate: String? = null,
    val staffStatusId: String,
    val roleCode: String
)

@Serializable
data class UpdateStaffRequestDto(
    val staffCode: String,
    val designation: String? = null,
    val storeId: String? = null,
    val joiningDate: String,
    val relievingDate: String? = null,
    val staffStatusId: String,
    val roleCode: String
)

@Serializable
data class DeleteStaffResponseDto(
    val staffId: String,
    val deleted: Boolean
)

@Serializable
data class StaffStoreAssignmentDto(
    val id: String,
    val organizationId: String,
    val staffId: String,
    val storeId: String,
    val assignmentStatusId: String,
    val effectiveDate: String,
    val endDate: String? = null,
    val createdAt: String,
    val createdBy: String,
    val updatedAt: String,
    val updatedBy: String,
    val isDeleted: Boolean,
    val versionNo: Int
)

@Serializable
data class CreateStaffStoreAssignmentRequestDto(
    val id: String,
    val staffId: String,
    val storeId: String,
    val assignmentStatusId: String,
    val effectiveDate: String,
    val endDate: String? = null
)

@Serializable
data class UpdateStaffStoreAssignmentRequestDto(
    val storeId: String,
    val assignmentStatusId: String,
    val effectiveDate: String,
    val endDate: String? = null
)

@Serializable
data class DeleteStaffStoreAssignmentResponseDto(
    val assignmentId: String,
    val deleted: Boolean
)

/*
 * User + OrganizationUser information required when a Staff member
 * is created.
 *
 * The server passes this to the existing
 * upsert_organization_user PostgreSQL function inside the same JDBI
 * transaction that creates Staff and StaffStoreAssignment records.
 */
@Serializable
data class StaffOrganizationUserRequestDto(
    val userId: String,
    val userCode: String,
    val firstName: String,
    val middleName: String? = null,
    val lastName: String? = null,
    val displayName: String? = null,
    val primaryEmail: String? = null,
    val primaryPhone: String,
    val preferredLanguageId: String? = null,

    val organizationUserId: String,

    val organizationUserTypeId: String,

    val joiningDate: String? = null
)


@Serializable
data class StaffPersonRequestDto(
    val userId: String,
    val userCode: String,

    val firstName: String,
    val middleName: String? = null,
    val lastName: String,
    val displayName: String? = null,

    val primaryEmail: String? = null,
    val primaryPhone: String,
    val preferredLanguageId: String? = null,

    val organizationUserId: String,
    val organizationUserTypeId: String,
    val joiningDate: String
)

/*
 * Atomic Staff-create request.
 *
 * organizationUser is optional so that the API can also create Staff
 * for an OrganizationUser that is already persisted on the server.
 */
@Serializable
data class CreateStaffTransactionRequestDto(
    val staff: CreateStaffRequestDto,
    val organizationUser: StaffOrganizationUserRequestDto,
    val assignments: List<CreateStaffStoreAssignmentRequestDto> = emptyList()
)

@Serializable
data class UpdateStaffTransactionRequestDto(
    val staff: UpdateStaffRequestDto,
    val person: StaffPersonRequestDto
)

@Serializable
data class CreateStaffTransactionResponseDto(
    val staff: StaffDto,
    val assignments: List<StaffStoreAssignmentDto>
)