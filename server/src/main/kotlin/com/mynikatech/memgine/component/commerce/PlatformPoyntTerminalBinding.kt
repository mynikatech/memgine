package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.net.dto.PlatformPoyntTerminalBindingDto
import com.mynikatech.memgine.net.dto.PlatformPoyntTerminalBindingWriteDto
import com.mynikatech.memgine.net.dto.OrganizationPoyntTerminalBindingWriteDto
import org.jdbi.v3.sqlobject.config.RegisterBeanMapper
import org.jdbi.v3.sqlobject.customizer.Bind
import org.jdbi.v3.sqlobject.statement.SqlQuery
import org.postgresql.util.PSQLException

data class PlatformPoyntTerminalBindingRow(
    var bindingId: String = "",
    var posDeviceId: String = "",
    var organizationId: String = "",
    var storeId: String = "",
    var storeName: String = "",
    var deviceName: String = "",
    var poyntBusinessId: String = "",
    var poyntStoreId: String = "",
    var poyntTerminalId: String = "",
    var active: Boolean = false,
    var createdAt: String = ""
)

interface PlatformPoyntTerminalBindingSql {
    @SqlQuery("SELECT * FROM platform_list_poynt_terminal_bindings(:integrationId, :actorUserId)")
    @RegisterBeanMapper(PlatformPoyntTerminalBindingRow::class)
    fun list(
        @Bind("integrationId") integrationId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<PlatformPoyntTerminalBindingRow>

    @SqlQuery("""SELECT platform_save_poynt_terminal_binding(
        :integrationId, :bindingId, :storeId, :deviceName, :businessId,
        :poyntStoreId, :terminalId, :active, :actorUserId, :create)""")
    fun save(
        @Bind("integrationId") integrationId: String,
        @Bind("bindingId") bindingId: String?,
        @Bind("storeId") storeId: String,
        @Bind("deviceName") deviceName: String,
        @Bind("businessId") businessId: String,
        @Bind("poyntStoreId") poyntStoreId: String,
        @Bind("terminalId") terminalId: String,
        @Bind("active") active: Boolean,
        @Bind("actorUserId") actorUserId: String,
        @Bind("create") create: Boolean
    ): String

    @SqlQuery("SELECT platform_deactivate_poynt_terminal_binding(:integrationId, :bindingId, :actorUserId)")
    fun deactivate(
        @Bind("integrationId") integrationId: String,
        @Bind("bindingId") bindingId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean
}

class PlatformPoyntTerminalBindingService(
    private val sql: PlatformPoyntTerminalBindingSql
) {
    fun list(integrationId: String, actorUserId: String): List<PlatformPoyntTerminalBindingDto> =
        translate { sql.list(validId(integrationId), actorUserId).map(::dto) }

    fun save(
        integrationId: String,
        bindingId: String?,
        request: PlatformPoyntTerminalBindingWriteDto,
        create: Boolean,
        actorUserId: String
    ): PlatformPoyntTerminalBindingDto = translate {
        val integration = validId(integrationId)
        val binding = if (create) null else validId(bindingId)
        validate(request)
        val savedId = sql.save(
            integration,
            binding,
            request.storeId.trim(),
            request.deviceName.trim(),
            request.poyntBusinessId.trim(),
            request.poyntStoreId.trim(),
            request.poyntTerminalId.trim(),
            request.active,
            actorUserId,
            create
        )
        sql.list(integration, actorUserId).firstOrNull { it.bindingId == savedId }?.let(::dto)
            ?: throw NotFoundException("Poynt terminal binding was not found after save")
    }

    fun deactivate(integrationId: String, bindingId: String, actorUserId: String): PlatformPoyntTerminalBindingDto =
        translate {
            val integration = validId(integrationId)
            val binding = validId(bindingId)
            sql.deactivate(integration, binding, actorUserId)
            sql.list(integration, actorUserId).firstOrNull { it.bindingId == binding }?.let(::dto)
                ?: throw NotFoundException("Poynt terminal binding was not found after deactivation")
        }

    private fun validate(request: PlatformPoyntTerminalBindingWriteDto) {
        if (request.storeId.isBlank() || request.storeId.length > 64 ||
            request.deviceName.isBlank() || request.deviceName.length > 150 ||
            request.poyntBusinessId.isBlank() || request.poyntBusinessId.length > 128 ||
            request.poyntStoreId.isBlank() || request.poyntStoreId.length > 128 ||
            request.poyntTerminalId.isBlank() || request.poyntTerminalId.length > 128) {
            throw BadRequestException("Invalid Poynt terminal binding")
        }
    }

    private fun validId(value: String?): String =
        value?.trim()?.takeIf { it.isNotEmpty() && it.length <= 64 }
            ?: throw BadRequestException("Invalid id")

    private fun dto(row: PlatformPoyntTerminalBindingRow) = PlatformPoyntTerminalBindingDto(
        row.bindingId,
        row.posDeviceId,
        row.organizationId,
        row.storeId,
        row.storeName,
        row.deviceName,
        row.poyntBusinessId,
        row.poyntStoreId,
        row.poyntTerminalId,
        row.active,
        row.createdAt
    )

    private fun <T> translate(block: () -> T): T = try {
        block()
    } catch (error: Exception) {
        if (error is ApiException) throw error
        var cause: Throwable? = error
        while (cause != null) {
            if (cause is PSQLException) {
                when (cause.sqlState) {
                    "42501" -> throw ForbiddenException("Platform terminal binding management is not permitted")
                    "23505", "40001" -> throw ConflictException("Poynt terminal binding conflicts with current configuration")
                    "P0002" -> throw NotFoundException("Poynt terminal binding was not found")
                    "22001", "22023", "23502", "23503", "23514" ->
                        throw BadRequestException("Invalid Poynt terminal binding configuration")
                }
            }
            cause = cause.cause
        }
        throw error
    }
}

interface OrganizationPoyntTerminalBindingSql {
    @SqlQuery("SELECT * FROM organization_list_poynt_terminal_bindings(:organizationId, :integrationId, :actorUserId)")
    @RegisterBeanMapper(PlatformPoyntTerminalBindingRow::class)
    fun list(
        @Bind("organizationId") organizationId: String,
        @Bind("integrationId") integrationId: String,
        @Bind("actorUserId") actorUserId: String
    ): List<PlatformPoyntTerminalBindingRow>

    @SqlQuery("""SELECT organization_save_poynt_terminal_binding(
        :organizationId, :integrationId, :bindingId, :storeId, :deviceName,
        :poyntStoreId, :terminalId, :active, :actorUserId, :create)""")
    fun save(
        @Bind("organizationId") organizationId: String,
        @Bind("integrationId") integrationId: String,
        @Bind("bindingId") bindingId: String?,
        @Bind("storeId") storeId: String,
        @Bind("deviceName") deviceName: String,
        @Bind("poyntStoreId") poyntStoreId: String?,
        @Bind("terminalId") terminalId: String,
        @Bind("active") active: Boolean,
        @Bind("actorUserId") actorUserId: String,
        @Bind("create") create: Boolean
    ): String

    @SqlQuery("SELECT organization_deactivate_poynt_terminal_binding(:organizationId, :integrationId, :bindingId, :actorUserId)")
    fun deactivate(
        @Bind("organizationId") organizationId: String,
        @Bind("integrationId") integrationId: String,
        @Bind("bindingId") bindingId: String,
        @Bind("actorUserId") actorUserId: String
    ): Boolean
}

class OrganizationPoyntTerminalBindingService(
    private val sql: OrganizationPoyntTerminalBindingSql
) {
    fun list(organizationId: String, integrationId: String, actorUserId: String): List<PlatformPoyntTerminalBindingDto> =
        translate { sql.list(validId(organizationId), validId(integrationId), actorUserId).map(::dto) }

    fun save(
        organizationId: String,
        integrationId: String,
        bindingId: String?,
        request: OrganizationPoyntTerminalBindingWriteDto,
        create: Boolean,
        actorUserId: String
    ): PlatformPoyntTerminalBindingDto = translate {
        validate(request)
        val organization = validId(organizationId)
        val integration = validId(integrationId)
        val binding = if (create) null else validId(bindingId)
        val savedId = sql.save(
            organization, integration, binding, request.storeId.trim(), request.deviceName.trim(),
            request.poyntStoreId?.trim()?.takeIf { it.isNotEmpty() }, request.poyntTerminalId.trim(),
            request.active, actorUserId, create
        )
        sql.list(organization, integration, actorUserId).firstOrNull { it.bindingId == savedId }?.let(::dto)
            ?: throw NotFoundException("Poynt terminal binding was not found after save")
    }

    fun deactivate(organizationId: String, integrationId: String, bindingId: String, actorUserId: String): PlatformPoyntTerminalBindingDto =
        translate {
            val organization = validId(organizationId)
            val integration = validId(integrationId)
            val binding = validId(bindingId)
            sql.deactivate(organization, integration, binding, actorUserId)
            sql.list(organization, integration, actorUserId).firstOrNull { it.bindingId == binding }?.let(::dto)
                ?: throw NotFoundException("Poynt terminal binding was not found after deactivation")
        }

    private fun validate(request: OrganizationPoyntTerminalBindingWriteDto) {
        if (request.storeId.isBlank() || request.storeId.length > 64 ||
            request.deviceName.isBlank() || request.deviceName.length > 150 ||
            request.poyntStoreId?.length ?: 0 > 128 ||
            request.poyntTerminalId.isBlank() || request.poyntTerminalId.length > 128) {
            throw BadRequestException("Invalid Poynt terminal binding")
        }
    }

    private fun validId(value: String?): String =
        value?.trim()?.takeIf { it.isNotEmpty() && it.length <= 64 }
            ?: throw BadRequestException("Invalid id")

    private fun dto(row: PlatformPoyntTerminalBindingRow) = PlatformPoyntTerminalBindingDto(
        row.bindingId, row.posDeviceId, row.organizationId, row.storeId, row.storeName,
        row.deviceName, row.poyntBusinessId, row.poyntStoreId, row.poyntTerminalId,
        row.active, row.createdAt
    )

    private fun <T> translate(block: () -> T): T = try {
        block()
    } catch (error: Exception) {
        if (error is ApiException) throw error
        var cause: Throwable? = error
        while (cause != null) {
            if (cause is PSQLException) when (cause.sqlState) {
                "42501" -> throw ForbiddenException("Poynt terminal binding management is not permitted")
                "23505", "40001" -> throw ConflictException("Poynt terminal binding conflicts with current configuration")
                "P0002" -> throw NotFoundException("Poynt terminal binding was not found")
                "22001", "22023", "23502", "23503", "23514" ->
                    throw BadRequestException("Invalid Poynt terminal binding configuration: ${cause.message}")
            }
            cause = cause.cause
        }
        throw error
    }
}
