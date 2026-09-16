package com.mynikatech.memgine.component.organization

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.net.dto.CreateOrganizationRequestDto
import com.mynikatech.memgine.net.dto.CreateOrganizationResponseDto
import com.mynikatech.memgine.net.dto.OrganizationLifecycleResponseDto
import com.mynikatech.memgine.net.dto.UpdateOrganizationRequestDto
import com.mynikatech.memgine.net.dto.UpdateOrganizationResponseDto
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class OrganizationService(
    private val sql: OrganizationSql,
    private val json: Json = Json { encodeDefaults = true; explicitNulls = true }
) {
    fun create(request: CreateOrganizationRequestDto): CreateOrganizationResponseDto {
        validateCreate(request)
        return sql.createOrganization(
            json.encodeToString(request.organization),
            json.encodeToString(request.details),
            json.encodeToString(request.branding),
            PLATFORM_ADMIN_USER_ID
        )
    }

    fun update(organizationId: String, request: UpdateOrganizationRequestDto): UpdateOrganizationResponseDto {
        validateUpdate(organizationId, request)
        sql.updateOrganization(
            organizationId,
            request.organization?.let { json.encodeToString(it) },
            request.details?.let { json.encodeToString(it) },
            request.branding?.let { json.encodeToString(it) },
            PLATFORM_ADMIN_USER_ID
        )
        return UpdateOrganizationResponseDto(organizationId)
    }

    fun activate(organizationId: String): OrganizationLifecycleResponseDto {
        validateOrganizationId(organizationId)
        val statusId = sql.setOrganizationLifecycleStatus(organizationId, "ACTIVE", PLATFORM_ADMIN_USER_ID)
        return OrganizationLifecycleResponseDto(organizationId, statusId)
    }

    fun deactivate(organizationId: String): OrganizationLifecycleResponseDto {
        validateOrganizationId(organizationId)
        val statusId = sql.setOrganizationLifecycleStatus(organizationId, "INACTIVE", PLATFORM_ADMIN_USER_ID)
        return OrganizationLifecycleResponseDto(organizationId, statusId)
    }

    fun get(organizationId: String): String {
        validateOrganizationId(organizationId)
        return sql.getOrganization(organizationId) ?: throw BadRequestException("Organization not found")
    }

    fun list(): String = sql.getOrganizations()

    fun getDetails(organizationId: String): String {
        validateOrganizationId(organizationId)
        return sql.getOrganizationDetails(organizationId)
            ?: throw BadRequestException("Organization details not found")
    }

    fun getBranding(organizationId: String): String {
        validateOrganizationId(organizationId)
        return sql.getOrganizationBranding(organizationId)
            ?: throw BadRequestException("Organization branding not found")
    }

    fun getAggregate(organizationId: String): String {
        validateOrganizationId(organizationId)
        return sql.getOrganizationAggregate(organizationId)
            ?: throw BadRequestException("Organization not found")
    }

    private fun validateCreate(request: CreateOrganizationRequestDto) {
        validateOrganization(request.organization)
        val organization = request.organization
        val details = request.details
        val branding = request.branding
        if (details.id.isBlank()) throw BadRequestException("Organization details id is required")
        if (details.id.length > 64) throw BadRequestException("Organization details id must not exceed 64 characters")
        if (details.organizationId != organization.id) throw BadRequestException("Organization details organizationId does not match organization id")
        if (branding.id.isBlank()) throw BadRequestException("Organization branding id is required")
        if (branding.id.length > 64) throw BadRequestException("Organization branding id must not exceed 64 characters")
        if (branding.organizationId != organization.id) throw BadRequestException("Organization branding organizationId does not match organization id")
        validateBranding(branding)
    }

    private fun validateUpdate(organizationId: String, request: UpdateOrganizationRequestDto) {
        validateOrganizationId(organizationId)
        if (request.organization == null && request.details == null && request.branding == null) {
            throw BadRequestException("At least one organization section must be supplied for update")
        }
        request.organization?.let {
            if (it.id != organizationId) throw BadRequestException("Organization id does not match path organization id")
            validateOrganization(it)
        }
        request.details?.let {
            if (it.id.isBlank()) throw BadRequestException("Organization details id is required")
            if (it.id.length > 64) throw BadRequestException("Organization details id must not exceed 64 characters")
            if (it.organizationId != organizationId) throw BadRequestException("Organization details organizationId does not match path organization id")
        }
        request.branding?.let {
            if (it.id.isBlank()) throw BadRequestException("Organization branding id is required")
            if (it.id.length > 64) throw BadRequestException("Organization branding id must not exceed 64 characters")
            if (it.organizationId != organizationId) throw BadRequestException("Organization branding organizationId does not match path organization id")
            validateBranding(it)
        }
    }

    private fun validateOrganization(organization: com.mynikatech.memgine.net.dto.OrganizationDto) {
        validateOrganizationId(organization.id)
        if (organization.code.isBlank()) throw BadRequestException("Organization code is required")
        if (organization.code.length > 20) throw BadRequestException("Organization code must not exceed 20 characters")
        if (organization.name.isBlank()) throw BadRequestException("Organization name is required")
        if (organization.name.length > 200) throw BadRequestException("Organization name must not exceed 200 characters")
        if (organization.organizationTypeId.isBlank()) throw BadRequestException("Organization type is required")
        if (organization.organizationStatusId.isBlank()) throw BadRequestException("Organization status is required")
        if (organization.primaryEmail.isBlank()) throw BadRequestException("Primary email is required")
        if (organization.primaryPhone.countryId.isBlank()) throw BadRequestException("Primary phone country is required")
        if (organization.primaryPhone.callingCode.isBlank() || organization.primaryPhone.number.isBlank()) throw BadRequestException("Primary phone is required")
        if (organization.primaryPhone.number.length > 20) throw BadRequestException("Primary phone number must not exceed 20 characters")
    }

    private fun validateBranding(branding: com.mynikatech.memgine.net.dto.OrganizationBrandingDto) {
        if (branding.brandingName.isBlank()) throw BadRequestException("Branding name is required")
        if (branding.themeTemplateId.isBlank()) throw BadRequestException("Theme template id is required")
        if (branding.brandingStatusId.isBlank()) throw BadRequestException("Branding status is required")
    }

    private fun validateOrganizationId(organizationId: String) {
        if (organizationId.isBlank()) throw BadRequestException("Organization id is required")
        if (organizationId.length > 64) throw BadRequestException("Organization id must not exceed 64 characters")
    }

    private companion object { const val PLATFORM_ADMIN_USER_ID = "user-platform-admin" }
}
