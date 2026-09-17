package com.mynikatech.memgine.component.integrationconfiguration

import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.*
import org.jdbi.v3.core.Jdbi
import org.postgresql.util.PSQLException

class IntegrationConfigurationService(private val jdbi: Jdbi) {
    private val actorUserId = "user-org-admin"

    fun list(organizationId: String): List<IntegrationConfigurationDto> {
        requireAdmin(organizationId)
        return jdbi.onDemand(IntegrationConfigurationSql::class.java).list(organizationId, actorUserId)
    }

    fun get(organizationId: String, id: String): IntegrationConfigurationDto {
        validateId(id)
        return list(organizationId).find { it.id == id }
            ?: throw NotFoundException("Integration Configuration not found")
    }

    fun save(organizationId: String, request: IntegrationConfigurationWriteDto,
             create: Boolean): IntegrationConfigurationDto {
        requireAdmin(organizationId)
        validateId(request.id)
        if (request.integrationName.isBlank() || request.integrationName.length > 100 ||
            request.provider.isBlank() || request.provider.length > 100 ||
            request.integrationTypeId.isBlank() || request.integrationStatusId.isBlank() ||
            request.versionNo < 1) {
            throw BadRequestException("Invalid Integration Configuration fields")
        }
        val sql = jdbi.onDemand(IntegrationConfigurationSql::class.java)
        val existing = list(organizationId).find { it.id == request.id }
        if (create && existing != null) throw ConflictException("Integration Configuration already exists")
        if (!create && existing == null) throw NotFoundException("Integration Configuration not found")
        try {
            sql.save(IntegrationConfigurationSqlParams(
                organizationId, request.id, request.integrationName.trim(),
                request.integrationTypeId, request.provider.trim(),
                request.integrationStatusId, request.versionNo, actorUserId, create
            ))
        } catch (error: Exception) {
            translate(error)
        }
        return get(organizationId, request.id)
    }

    fun delete(organizationId: String, id: String): DeleteIntegrationConfigurationDto {
        val current = get(organizationId, id)
        try {
            jdbi.onDemand(IntegrationConfigurationSql::class.java)
                .delete(organizationId, id, current.versionNo, actorUserId)
        } catch (error: Exception) {
            translate(error)
        }
        return DeleteIntegrationConfigurationDto(id, true)
    }

    private fun requireAdmin(organizationId: String) {
        validateId(organizationId)
        if (!jdbi.onDemand(IntegrationConfigurationSql::class.java)
                .canAdminister(organizationId, actorUserId)) {
            throw ForbiddenException("Organization access denied")
        }
    }

    private fun validateId(id: String) {
        if (id.isBlank() || id.length > 40) throw BadRequestException("Invalid id")
    }

    private fun translate(error: Exception): Nothing {
        if (error is ApiException) throw error
        var cause: Throwable? = error
        while (cause != null) {
            if (cause is PSQLException) {
                when (cause.sqlState) {
                    "23505", "40001" -> throw ConflictException("Integration Configuration name already exists or changed since load")
                    "22001", "22023", "23502", "23503", "23514" ->
                        throw BadRequestException("Invalid Integration Configuration")
                    "42501" -> throw ForbiddenException("Organization access denied")
                }
            }
            cause = cause.cause
        }
        throw error
    }
}
