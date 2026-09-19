package com.mynikatech.memgine.component.role

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.*
import java.time.LocalDateTime
import org.postgresql.util.PSQLException

class RbacService(private val sql: RbacSql) {
    fun roles() = sql.roles().map { RbacRoleDto(it.roleId, it.roleCode, it.roleName, it.description) }
    fun capabilities() = sql.capabilities().map { RbacCapabilityDto(it.capabilityCode, it.capabilityName, it.description) }
    fun assignments(userId: String) = sql.assignments(required(userId, "User")).map {
        RbacAssignmentDto(it.assignmentId, it.organizationId, it.roleCode, it.assignmentStatusId,
            it.effectiveFrom, it.effectiveTo, it.assignmentReason)
    }
    fun effectiveRoles(userId: String, organizationId: String?) =
        sql.effectiveRoles(required(userId, "User"), organizationId).map {
            RbacEffectiveRoleDto(it.roleId, it.roleCode, it.organizationId)
        }
    fun effectiveCapabilities(userId: String, organizationId: String?) =
        sql.effectiveCapabilities(required(userId, "User"), organizationId).map {
            RbacEffectiveCapabilityDto(it.capabilityCode, it.organizationId)
        }
    fun hasCapability(userId: String, organizationId: String?, capabilityCode: String) =
        RbacCheckResultDto(sql.hasCapability(required(userId, "User"), organizationId,
            required(capabilityCode, "Capability")))

    fun assignOrganizationRole(organizationId: String, request: RbacAssignOrganizationRoleRequest): RbacAssignmentResultDto {
        validateDates(request.effectiveFrom, request.effectiveTo)
        return RbacAssignmentResultDto(write { sql.assignOrganizationRole(required(organizationId, "Organization"),
            required(request.userId, "User"), required(request.roleCode, "Role"),
            request.effectiveFrom, request.effectiveTo, request.reason, required(request.actorUserId, "Actor")) })
    }
    fun revokeOrganizationRole(organizationId: String, assignmentId: String, request: RbacRevokeRoleRequest) =
        RbacRevocationResultDto(write { sql.revokeOrganizationRole(required(organizationId, "Organization"),
            required(assignmentId, "Assignment"), required(request.actorUserId, "Actor")) })
    fun assignPlatformRole(request: RbacAssignPlatformRoleRequest): RbacAssignmentResultDto {
        validateDates(request.effectiveFrom, request.effectiveTo)
        return RbacAssignmentResultDto(write { sql.assignPlatformRole(required(request.userId, "User"),
            request.effectiveFrom, request.effectiveTo, request.reason, required(request.actorUserId, "Actor")) })
    }
    fun revokePlatformRole(assignmentId: String, request: RbacRevokeRoleRequest) =
        RbacRevocationResultDto(write { sql.revokePlatformRole(required(assignmentId, "Assignment"),
            required(request.actorUserId, "Actor")) })

    private fun <T> write(action: () -> T): T = try {
        action()
    } catch (error: Exception) {
        val postgres = generateSequence<Throwable>(error) { it.cause }.filterIsInstance<PSQLException>().firstOrNull()
        when (postgres?.sqlState) {
            "42501" -> throw ForbiddenException("Role assignment is not permitted")
            "P0002" -> throw NotFoundException("User or organization relationship was not found")
            "22023" -> throw BadRequestException("Invalid role or effective date range")
            "23503" -> throw BadRequestException("Referenced user, role, or organization was not found")
            "23505" -> throw ConflictException("Role assignment already exists")
            else -> throw error
        }
    }

    private fun required(value: String, label: String) =
        value.trim().takeIf { it.isNotEmpty() && it.length <= 64 } ?: throw BadRequestException("$label id is required and must be at most 64 characters")

    private fun validateDates(from: String?, to: String?) {
        try {
            val start = from?.let(LocalDateTime::parse)
            val end = to?.let(LocalDateTime::parse)
            if (start != null && end != null && !end.isAfter(start)) throw BadRequestException("Effective end must be after effective start")
        } catch (e: java.time.format.DateTimeParseException) {
            throw BadRequestException("Effective dates must use ISO local date-time format")
        }
    }
}
