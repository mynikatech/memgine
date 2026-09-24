package com.mynikatech.memgine.component.organizationaccess

import com.mynikatech.memgine.component.pos.PosAuthenticationService
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.NotFoundException
import java.util.UUID
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.postgresql.util.PSQLException

class OrganizationAccessService(
    private val sql: OrganizationAccessSql,
    private val pinSetter: (String, String, String, String) -> Boolean,
    private val json: Json = Json { encodeDefaults = false; explicitNulls = false }
) {
    constructor(sql: OrganizationAccessSql, posAuthenticationService: PosAuthenticationService) :
        this(sql, posAuthenticationService::setPin)

    fun list(org: String, actor: String): JsonElement =
        read { json.parseToJsonElement(sql.list(id(org, "Organization"), id(actor, "Actor"))) }

    fun setOrgAdmin(org: String, organizationUserId: String, enabled: Boolean, actor: String) =
        write { sql.setOrgAdmin(id(org, "Organization"), id(organizationUserId, "Organization user"), enabled, id(actor, "Actor")) }

    fun setMembership(org: String, organizationUserId: String, active: Boolean, actor: String) =
        write { sql.setMembership(id(org, "Organization"), id(organizationUserId, "Organization user"), active, id(actor, "Actor")) }

    fun setCounterOperator(org: String, organizationUserId: String, request: SetCounterOperatorRequest, actor: String): String? {
        request.designation?.let {
            if (it.length > 100) throw BadRequestException("Designation must be at most 100 characters")
        }
        request.primaryStoreId?.let { id(it, "Primary store") }
        val normalized = request.copy(
            designation = request.designation?.trim(),
            primaryStoreId = request.primaryStoreId?.trim()
        )
        val payload = buildJsonObject {
            put("enabled", normalized.enabled)
            normalized.designation?.let { put("designation", it) }
            normalized.primaryStoreId?.let { put("primaryStoreId", it) }
            // New Staff profiles are identified by the server; callers never invent staff IDs.
            put("staffId", UUID.randomUUID().toString())
        }.toString()
        return write { sql.setCounterOperator(id(org, "Organization"), id(organizationUserId, "Organization user"), payload, id(actor, "Actor")) }
    }

    fun setStores(org: String, organizationUserId: String, request: SetStaffStoresRequest, actor: String): Boolean {
        request.primaryStoreId?.let { id(it, "Primary store") }
        request.additionalStoreIds.forEach { id(it, "Additional store") }
        if (request.additionalStoreIds.distinct().size != request.additionalStoreIds.size) {
            throw BadRequestException("Additional stores must be unique")
        }
        if (request.primaryStoreId != null && request.primaryStoreId in request.additionalStoreIds) {
            throw BadRequestException("Primary store cannot also be an additional store")
        }
        return write { sql.setStores(id(org, "Organization"), id(organizationUserId, "Organization user"),
            request.primaryStoreId, json.encodeToString(request.additionalStoreIds), id(actor, "Actor")) }
    }

    fun setPin(org: String, organizationUserId: String, pin: String, actor: String): Boolean = write {
        val safeOrg = id(org, "Organization")
        val safeActor = id(actor, "Actor")
        val staffId = sql.staffId(safeOrg, id(organizationUserId, "Organization user"), safeActor)
        pinSetter(safeOrg, staffId, pin, safeActor)
    }

    private fun <T> read(action: () -> T): T = write(action)

    private fun <T> write(action: () -> T): T = try {
        action()
    } catch (error: Exception) {
        val postgres = generateSequence<Throwable>(error) { it.cause }
            .filterIsInstance<PSQLException>().firstOrNull()
        when (postgres?.sqlState) {
            "42501" -> throw ForbiddenException("Organization access administration is not permitted")
            "P0001" -> throw ConflictException(postgres.serverErrorMessage?.message
                ?: "The last active organization administrator must be retained")
            "P0002" -> throw NotFoundException("Organization user or staff profile was not found")
            "22023" -> throw BadRequestException(postgres.serverErrorMessage?.message ?: "Invalid organization access request")
            "23503" -> throw BadRequestException("The selected organization or store relationship is invalid")
            "23505" -> throw ConflictException("Staff code or access assignment already exists")
            else -> throw error
        }
    }

    private fun id(value: String, label: String): String = value.trim()
        .takeIf { it.isNotEmpty() && it.length <= 64 }
        ?: throw BadRequestException("$label id is required and must be at most 64 characters")
}
