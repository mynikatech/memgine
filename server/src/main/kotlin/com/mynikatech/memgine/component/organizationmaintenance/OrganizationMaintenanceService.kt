package com.mynikatech.memgine.component.organizationmaintenance

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.OrganizationAdministrativeUserDto
import com.mynikatech.memgine.net.dto.SaveOrganizationAdministrativeUserRequest
import java.time.LocalDateTime
import org.postgresql.util.PSQLException
import com.mynikatech.memgine.security.PhoneNormalizer

class OrganizationMaintenanceService(
    private val sql: OrganizationMaintenanceSql,
    private val phoneNormalizer: PhoneNormalizer = PhoneNormalizer()
) {
    fun list(organizationId: String, actorUserId: String): List<OrganizationAdministrativeUserDto> =
        read { sql.list(requiredId(organizationId), requiredId(actorUserId)).map(::toDto) }

    fun create(
        organizationId: String,
        request: SaveOrganizationAdministrativeUserRequest, actorUserId: String
    ): OrganizationAdministrativeUserDto = save(organizationId, null, request, actorUserId)

    fun update(
        organizationId: String,
        userId: String,
        request: SaveOrganizationAdministrativeUserRequest, actorUserId: String
    ): OrganizationAdministrativeUserDto = save(organizationId, requiredId(userId), request, actorUserId)

    private fun save(
        organizationId: String,
        userId: String?,
        request: SaveOrganizationAdministrativeUserRequest,
        actorUserId: String
    ): OrganizationAdministrativeUserDto {
        val firstName = request.firstName.trim()
        val lastName = request.lastName?.trim()?.takeIf(String::isNotEmpty)
        val email = request.primaryEmail?.trim()?.lowercase()?.takeIf(String::isNotEmpty)
        val phone = phoneNormalizer.normalize(request.primaryPhone, null).e164
        val role = request.roleCode.trim().uppercase()

        if (firstName.isEmpty() || firstName.length > 100 || (lastName?.length ?: 0) > 100) {
            throw BadRequestException("A valid first name and last name are required")
        }
        if (email != null && (email.length > 254 || !email.matches(EMAIL))) {
            throw BadRequestException("Email address is invalid")
        }
        if (role !in ADMINISTRATIVE_ROLES) {
            throw BadRequestException("Role must be BUSINESS_OWNER or ORG_ADMIN")
        }
        validateDates(request.effectiveFrom, request.effectiveTo)

        return write {
            toDto(
                sql.save(
                    requiredId(organizationId), userId, firstName, lastName, email,
                    phone, role, request.effectiveFrom, request.effectiveTo,
                    requiredId(actorUserId)
                )
            )
        }
    }

    private fun validateDates(from: String?, to: String?) {
        try {
            val start = from?.takeIf(String::isNotBlank)?.let(LocalDateTime::parse)
            val end = to?.takeIf(String::isNotBlank)?.let(LocalDateTime::parse)
            if (start != null && end != null && !end.isAfter(start)) {
                throw BadRequestException("Effective end must be after effective start")
            }
        } catch (_: java.time.format.DateTimeParseException) {
            throw BadRequestException("Effective dates must use ISO local date-time format")
        }
    }

    private fun <T> read(action: () -> T): T = try {
        action()
    } catch (error: Exception) {
        mapDatabaseError(error)
    }

    private fun <T> write(action: () -> T): T = try {
        action()
    } catch (error: Exception) {
        mapDatabaseError(error)
    }

    private fun mapDatabaseError(error: Exception): Nothing {
        val postgres = generateSequence<Throwable>(error) { it.cause }
            .filterIsInstance<PSQLException>()
            .firstOrNull()
        when (postgres?.sqlState) {
            "42501" -> throw ForbiddenException("Platform organization maintenance is not permitted")
            "P0002" -> throw NotFoundException("Organization or administrative user was not found")
            "22023", "23503" -> throw BadRequestException("Administrative user details are invalid")
            "23505" -> throw ConflictException("An administrative user with this identity already exists")
            else -> throw error
        }
    }

    private fun requiredId(value: String): String =
        value.trim().takeIf { it.isNotEmpty() && it.length <= 64 }
            ?: throw BadRequestException("Identifier is required and must be at most 64 characters")

    private fun toDto(row: OrganizationAdministrativeUserRow) =
        OrganizationAdministrativeUserDto(
            row.assignmentId, row.organizationUserId, row.organizationId,
            row.userId, row.firstName, row.lastName, row.displayName,
            row.primaryEmail, row.primaryPhone, row.roleCode,
            row.assignmentStatusId, row.effectiveFrom, row.effectiveTo
        )

    private companion object {
        val ADMINISTRATIVE_ROLES = setOf("BUSINESS_OWNER", "ORG_ADMIN")
        val EMAIL = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
    }
}
