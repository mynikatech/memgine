package com.mynikatech.memgine.component.customer

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.net.dto.CreateProspectiveCustomerDto
import com.mynikatech.memgine.net.dto.OrgAdminCustomerDto
import com.mynikatech.memgine.net.dto.ProspectiveCustomerCreatedDto
import org.postgresql.util.PSQLException

class CustomerService(private val sql: CustomerSql) {
    // Existing Org Admin components use this development actor until request auth is wired.
    private val actorUserId = "user-org-admin"

    fun list(organizationId: String): List<OrgAdminCustomerDto> {
        authorize(organizationId)
        return sql.list(organizationId, actorUserId)
    }

    fun createProspect(organizationId: String, request: CreateProspectiveCustomerDto): ProspectiveCustomerCreatedDto {
        authorize(organizationId)
        val firstName = request.firstName.trim()
        val lastName = request.lastName.trim()
        val phone = request.primaryPhone.trim()
        if (firstName.isEmpty() || firstName.length > 100 ||
            lastName.isEmpty() || lastName.length > 100 ||
            phone.isEmpty() || phone.length > 20 ||
            (request.middleName?.length ?: 0) > 100 ||
            (request.displayName?.length ?: 0) > 150 ||
            (request.primaryEmail?.length ?: 0) > 254) {
            throw BadRequestException("Invalid prospective customer fields")
        }
        return try {
            ProspectiveCustomerCreatedDto(sql.createProspect(
                organizationId, firstName, request.middleName?.trim(), lastName,
                request.displayName?.trim(), request.primaryEmail?.trim(), phone, actorUserId
            ))
        } catch (error: Exception) {
            val postgres = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<PSQLException>().firstOrNull()
            when (postgres?.sqlState) {
                "23505" -> throw ConflictException(postgres.serverErrorMessage?.message
                    ?: "A user already has this phone or email; resolve identity before linking")
                "22023" -> throw BadRequestException("Invalid prospective customer fields")
                "42501" -> throw ForbiddenException("Organization administration is not permitted")
                else -> throw error
            }
        }
    }

    private fun authorize(organizationId: String) {
        if (organizationId.isBlank() || organizationId.length > 40) {
            throw BadRequestException("Invalid organization id")
        }
        if (!sql.canAdminister(organizationId, actorUserId)) {
            throw ForbiddenException("Organization administration is not permitted")
        }
    }
}
