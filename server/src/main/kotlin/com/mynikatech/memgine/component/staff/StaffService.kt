package com.mynikatech.memgine.component.staff

import com.mynikatech.memgine.component.organizationuser.OrganizationUserSql
import com.mynikatech.memgine.component.organizationuser.UpsertOrganizationUserRequest
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.jdbi.v3.core.Jdbi

class StaffService(
    private val jdbi: Jdbi,
    private val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }
) {

    fun list(
        organizationId: String
    ): List<StaffDto> {
        validateId(
            "Organization",
            organizationId
        )

        return jdbi
            .onDemand(StaffSql::class.java)
            .list(organizationId)
    }

    fun get(
        organizationId: String,
        staffId: String
    ): StaffDto {
        validateId(
            "Organization",
            organizationId
        )

        validateId(
            "Staff",
            staffId
        )

        return jdbi
            .onDemand(StaffSql::class.java)
            .get(
                organizationId,
                staffId
            )
            ?: throw BadRequestException(
                "Staff member not found"
            )
    }

    fun create(
        organizationId: String,
        request: CreateStaffTransactionRequestDto
    ): CreateStaffTransactionResponseDto {
        validateId(
            "Organization",
            organizationId
        )

        validateId(
            "Staff",
            request.staff.id
        )

        validateStaff(
            request.staff.staffCode,
            request.staff.roleCode,
            request.staff.joiningDate,
            request.staff.relievingDate,
            request.staff.staffStatusId
        )

        validatePerson(
            request.organizationUser
        )

        request.assignments.forEach {
            validateId(
                "Assignment",
                it.id
            )

            validateId(
                "Store",
                it.storeId
            )

            validateAssignment(
                it.assignmentStatusId,
                it.effectiveDate,
                it.endDate
            )
        }

        return jdbi.inTransaction<
            CreateStaffTransactionResponseDto,
            Exception
        > { handle ->

            val staffSql =
                handle.attach(
                    StaffSql::class.java
                )

            val organizationUserSql =
                handle.attach(
                    OrganizationUserSql::class.java
                )

            val person =
                request.organizationUser

            val organizationUserId =
                if (person != null) {

                    /*
                     * For ADD STAFF, User and
                     * OrganizationUser are created here.
                     *
                     * They are not persisted by the
                     * frontend before this transaction.
                     */
                    val resultJson =
                        organizationUserSql.upsert(
                            organizationId,
                            json.encodeToString(
                                UpsertOrganizationUserRequest.serializer(),
                                UpsertOrganizationUserRequest(
                                    userId =
                                        person.userId,

                                    userCode =
                                        person.userCode,

                                    firstName =
                                        person.firstName,

                                    middleName =
                                        person.middleName,

                                    lastName =
                                        person.lastName,

                                    displayName =
                                        person.displayName,

                                    primaryEmail =
                                        person.primaryEmail,

                                    primaryPhone =
                                        person.primaryPhone,

                                    preferredLanguageId =
                                        person.preferredLanguageId,

                                    userStatusId = null,

                                    organizationUserId =
                                        person.organizationUserId,

                                    organizationUserTypeId =
                                        person.organizationUserTypeId,

                                    organizationUserStatusId =
                                        null,

                                    organizationUserRoleId =
                                        null,

                                    roleId =
                                        null,

                                    joiningDate =
                                        person.joiningDate,

                                    actorUserId =
                                        ORG_ADMIN_USER_ID
                                )
                            ),
                            ORG_ADMIN_USER_ID
                        )

                    val result =
                        json
                            .parseToJsonElement(
                                resultJson
                            )
                            .jsonObject

                    result[
                        "organizationUserId"
                    ]
                        ?.jsonPrimitive
                        ?.content
                        ?.takeIf {
                            it.isNotBlank()
                        }
                        ?: throw BadRequestException(
                            "Organization user was not returned after save"
                        )
                } else {

                    /*
                     * This branch supports an existing
                     * OrganizationUser if needed by
                     * server-side callers.
                     *
                     * Add Staff from the UI always sends
                     * organizationUser.
                     */
                    validateId(
                        "Organization user",
                        request.staff.organizationUserId
                    )

                    request.staff.organizationUserId
                }

            val savedStaff =
                staffSql.create(
                    organizationId,
                    request.staff.id,
                    organizationUserId,
                    request.staff.staffCode,
                    request.staff.roleCode,
                    request.staff.designation,
                    request.staff.storeId,
                    request.staff.joiningDate,
                    request.staff.relievingDate,
                    request.staff.staffStatusId,
                    ORG_ADMIN_USER_ID
                )

            val savedAssignments =
                request.assignments.map {
                    assignment ->

                    staffSql.createAssignment(
                        organizationId,
                        assignment.id,
                        savedStaff.id,
                        assignment.storeId,
                        assignment.assignmentStatusId,
                        assignment.effectiveDate,
                        assignment.endDate,
                        ORG_ADMIN_USER_ID
                    )
                }

            CreateStaffTransactionResponseDto(
                staff =
                    savedStaff,

                assignments =
                    savedAssignments
            )
        }
    }

    fun update(
        organizationId: String,
        staffId: String,
        request: UpdateStaffRequestDto
    ): StaffDto {
        validateId(
            "Organization",
            organizationId
        )

        validateId(
            "Staff",
            staffId
        )

        validateStaff(
            request.staffCode,
            request.roleCode,
            request.joiningDate,
            request.relievingDate,
            request.staffStatusId
        )

        return jdbi
            .onDemand(StaffSql::class.java)
            .update(
                organizationId,
                staffId,
                request.staffCode,
                request.roleCode,
                request.designation,
                request.storeId,
                request.joiningDate,
                request.relievingDate,
                request.staffStatusId,
                ORG_ADMIN_USER_ID
            )
    }

    fun delete(
        organizationId: String,
        staffId: String
    ): DeleteStaffResponseDto {
        validateId(
            "Organization",
            organizationId
        )

        validateId(
            "Staff",
            staffId
        )

        val deleted =
            jdbi
                .onDemand(
                    StaffSql::class.java
                )
                .delete(
                    organizationId,
                    staffId,
                    ORG_ADMIN_USER_ID
                )

        if (!deleted) {
            throw BadRequestException(
                "Staff member not found"
            )
        }

        return DeleteStaffResponseDto(
            staffId,
            true
        )
    }

    fun listAssignments(
        organizationId: String
    ): List<StaffStoreAssignmentDto> {
        validateId(
            "Organization",
            organizationId
        )

        return jdbi
            .onDemand(
                StaffSql::class.java
            )
            .listAssignments(
                organizationId
            )
    }

    fun createAssignment(
        organizationId: String,
        request:
            CreateStaffStoreAssignmentRequestDto
    ): StaffStoreAssignmentDto {
        validateId(
            "Organization",
            organizationId
        )

        validateId(
            "Assignment",
            request.id
        )

        validateId(
            "Staff",
            request.staffId
        )

        validateId(
            "Store",
            request.storeId
        )

        validateAssignment(
            request.assignmentStatusId,
            request.effectiveDate,
            request.endDate
        )

        return jdbi
            .onDemand(
                StaffSql::class.java
            )
            .createAssignment(
                organizationId,
                request.id,
                request.staffId,
                request.storeId,
                request.assignmentStatusId,
                request.effectiveDate,
                request.endDate,
                ORG_ADMIN_USER_ID
            )
    }

    fun updateAssignment(
        organizationId: String,
        assignmentId: String,
        request:
            UpdateStaffStoreAssignmentRequestDto
    ): StaffStoreAssignmentDto {
        validateId(
            "Organization",
            organizationId
        )

        validateId(
            "Assignment",
            assignmentId
        )

        validateId(
            "Store",
            request.storeId
        )

        validateAssignment(
            request.assignmentStatusId,
            request.effectiveDate,
            request.endDate
        )

        return jdbi
            .onDemand(
                StaffSql::class.java
            )
            .updateAssignment(
                organizationId,
                assignmentId,
                request.storeId,
                request.assignmentStatusId,
                request.effectiveDate,
                request.endDate,
                ORG_ADMIN_USER_ID
            )
    }

    fun deleteAssignment(
        organizationId: String,
        assignmentId: String
    ):
        DeleteStaffStoreAssignmentResponseDto {
        validateId(
            "Organization",
            organizationId
        )

        validateId(
            "Assignment",
            assignmentId
        )

        val deleted =
            jdbi
                .onDemand(
                    StaffSql::class.java
                )
                .deleteAssignment(
                    organizationId,
                    assignmentId,
                    ORG_ADMIN_USER_ID
                )

        if (!deleted) {
            throw BadRequestException(
                "Staff store assignment not found"
            )
        }

        return DeleteStaffStoreAssignmentResponseDto(
            assignmentId,
            true
        )
    }

    private fun validatePerson(
        person:
            StaffOrganizationUserRequestDto
    ) {

        validateId(
            "User",
            person.userId
        )

        validateId(
            "Organization user",
            person.organizationUserId
        )

        if (
            person.userCode.isBlank()
        ) {
            throw BadRequestException(
                "User code is required"
            )
        }

        if (
            person.firstName.isBlank()
        ) {
            throw BadRequestException(
                "First name is required"
            )
        }

        if (
            person.lastName.isNullOrBlank()
        ) {
            throw BadRequestException(
                "Last name is required"
            )
        }

        if (
            person.primaryPhone.isBlank()
        ) {
            throw BadRequestException(
                "Primary phone is required"
            )
        }

        if (
            person.organizationUserTypeId
                .isBlank()
        ) {
            throw BadRequestException(
                "Organization user type is required"
            )
        }
    }

    private fun validateStaff(
        staffCode: String,
        roleCode: String,
        joiningDate: String,
        relievingDate: String?,
        staffStatusId: String
    ) {
        if (staffCode.isBlank()) {
            throw BadRequestException(
                "Staff code is required"
            )
        }

        if (roleCode.isBlank()) {
            throw BadRequestException(
                "Staff role is required"
            )
        }

        if (joiningDate.isBlank()) {
            throw BadRequestException(
                "Joining date is required"
            )
        }

        if (staffStatusId.isBlank()) {
            throw BadRequestException(
                "Staff status is required"
            )
        }

        if (
            relievingDate != null &&
            relievingDate < joiningDate
        ) {
            throw BadRequestException(
                "Relieving date cannot be before joining date"
            )
        }
    }

    private fun validateAssignment(
        statusId: String,
        effectiveDate: String,
        endDate: String?
    ) {
        if (statusId.isBlank()) {
            throw BadRequestException(
                "Assignment status is required"
            )
        }

        if (effectiveDate.isBlank()) {
            throw BadRequestException(
                "Effective date is required"
            )
        }

        if (
            endDate != null &&
            endDate < effectiveDate
        ) {
            throw BadRequestException(
                "Assignment end date cannot be before effective date"
            )
        }
    }

    private fun validateId(
        label: String,
        id: String
    ) {
        if (id.isBlank()) {
            throw BadRequestException(
                "$label id is required"
            )
        }

        if (id.length > 64) {
            throw BadRequestException(
                "$label id must not exceed 64 characters"
            )
        }
    }

    private companion object {
        const val ORG_ADMIN_USER_ID =
            "user-org-admin"
    }
}