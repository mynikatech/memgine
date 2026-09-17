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
