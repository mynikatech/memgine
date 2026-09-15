package com.mynikatech.memgine.component.organization

import kotlinx.serialization.Serializable

@Serializable
data class PhoneRequest(
    val countryId: String,
    val callingCode: String,
    val number: String
)

@Serializable
data class OrganizationRequest(
    val id: String,
    val code: String,
    val name: String,
    val displayName: String? = null,
    val organizationTypeId: String,
    val primaryEmail: String,
    val primaryPhone: PhoneRequest,
    val website: String? = null
)

@Serializable
data class OrganizationBrandingRequest(
    val id: String,
    val brandingName: String,
    val themeTemplateId: String,
    val primaryColor: String? = null,
    val secondaryColor: String? = null,
    val accentColor: String? = null,
    val logoUrl: String? = null,
    val darkThemeLogoUrl: String? = null,
    val faviconUrl: String? = null,
    val splashScreenImageUrl: String? = null,
    val tagline: String? = null,
    val heroImageUrl: String? = null
)

@Serializable
data class CreateOrganizationRequest(
    val organization: OrganizationRequest,
    val branding: OrganizationBrandingRequest
)

@Serializable
data class CreateOrganizationResponse(
    val organizationId: String,
    val organizationBrandingId: String
)

internal data class CreateOrganizationDbResult(
    val organizationId: String,
    val organizationBrandingId: String
)
