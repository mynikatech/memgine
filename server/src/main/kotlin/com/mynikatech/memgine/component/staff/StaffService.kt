package com.mynikatech.memgine.component.staff

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.*

class StaffService(
    private val sql: StaffSql
) {
    fun list(organizationId: String): List<StaffDto> {
        validateId("Organization", organizationId)
        return sql.list(organizationId)
    }

    fun get(organizationId: String, staffId: String): StaffDto {
        validateId("Organization", organizationId)
        validateId("Staff", staffId)
        return sql.get(organizationId, staffId)
            ?: throw BadRequestException("Staff member not found")
    }

    fun create(
        organizationId: String,
        request: CreateStaffRequestDto
    ): StaffDto {
        validateId("Organization", organizationId)
        validateId("Staff", request.id)
        validateId("Organization user", request.organizationUserId)
        validateStaff(
            request.staffCode, request.roleCode, request.joiningDate,
            request.relievingDate, request.staffStatusId
        )
        return sql.create(
            organizationId, request.id, request.organizationUserId,
            request.staffCode, request.roleCode, request.designation,
            request.storeId, request.joiningDate, request.relievingDate,
            request.staffStatusId, ORG_ADMIN_USER_ID
        )
    }

    fun update(
        organizationId: String,
        staffId: String,
        request: UpdateStaffRequestDto
    ): StaffDto {
        validateId("Organization", organizationId)
        validateId("Staff", staffId)
        validateStaff(
            request.staffCode, request.roleCode, request.joiningDate,
            request.relievingDate, request.staffStatusId
        )
        return sql.update(
            organizationId, staffId, request.staffCode, request.roleCode,
            request.designation, request.storeId, request.joiningDate,
            request.relievingDate, request.staffStatusId, ORG_ADMIN_USER_ID
        )
    }

    fun delete(organizationId: String, staffId: String): DeleteStaffResponseDto {
        validateId("Organization", organizationId)
        validateId("Staff", staffId)
        val deleted = sql.delete(organizationId, staffId, ORG_ADMIN_USER_ID)
        if (!deleted) throw BadRequestException("Staff member not found")
        return DeleteStaffResponseDto(staffId, true)
    }

    fun listAssignments(organizationId: String): List<StaffStoreAssignmentDto> {
        validateId("Organization", organizationId)
        return sql.listAssignments(organizationId)
    }

    fun createAssignment(
        organizationId: String,
        request: CreateStaffStoreAssignmentRequestDto
    ): StaffStoreAssignmentDto {
        validateId("Organization", organizationId)
        validateId("Assignment", request.id)
        validateId("Staff", request.staffId)
        validateId("Store", request.storeId)
        validateAssignment(
            request.assignmentStatusId, request.effectiveDate, request.endDate
        )
        return sql.createAssignment(
            organizationId, request.id, request.staffId, request.storeId,
            request.assignmentStatusId, request.effectiveDate, request.endDate,
            ORG_ADMIN_USER_ID
        )
    }

    fun updateAssignment(
        organizationId: String,
        assignmentId: String,
        request: UpdateStaffStoreAssignmentRequestDto
    ): StaffStoreAssignmentDto {
        validateId("Organization", organizationId)
        validateId("Assignment", assignmentId)
        validateId("Store", request.storeId)
        validateAssignment(
            request.assignmentStatusId, request.effectiveDate, request.endDate
        )
        return sql.updateAssignment(
            organizationId, assignmentId, request.storeId,
            request.assignmentStatusId, request.effectiveDate, request.endDate,
            ORG_ADMIN_USER_ID
        )
    }

    fun deleteAssignment(
        organizationId: String,
        assignmentId: String
    ): DeleteStaffStoreAssignmentResponseDto {
        validateId("Organization", organizationId)
        validateId("Assignment", assignmentId)
        val deleted = sql.deleteAssignment(
            organizationId, assignmentId, ORG_ADMIN_USER_ID
        )
        if (!deleted) throw BadRequestException("Staff store assignment not found")
        return DeleteStaffStoreAssignmentResponseDto(assignmentId, true)
    }

    private fun validateStaff(
        staffCode: String,
        roleCode: String,
        joiningDate: String,
        relievingDate: String?,
        staffStatusId: String
    ) {
        if (staffCode.isBlank()) throw BadRequestException("Staff code is required")
        if (roleCode.isBlank()) throw BadRequestException("Staff role is required")
        if (joiningDate.isBlank()) throw BadRequestException("Joining date is required")
        if (staffStatusId.isBlank()) throw BadRequestException("Staff status is required")
        if (relievingDate != null && relievingDate < joiningDate) {
            throw BadRequestException("Relieving date cannot be before joining date")
        }
    }

    private fun validateAssignment(
        statusId: String,
        effectiveDate: String,
        endDate: String?
    ) {
        if (statusId.isBlank()) throw BadRequestException("Assignment status is required")
        if (effectiveDate.isBlank()) throw BadRequestException("Effective date is required")
        if (endDate != null && endDate < effectiveDate) {
            throw BadRequestException("Assignment end date cannot be before effective date")
        }
    }

    private fun validateId(label: String, id: String) {
        if (id.isBlank()) throw BadRequestException("$label id is required")
        if (id.length > 64) {
            throw BadRequestException("$label id must not exceed 64 characters")
        }
    }

    private companion object {
        const val ORG_ADMIN_USER_ID = "user-org-admin"
    }
}
