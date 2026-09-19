package com.mynikatech.memgine.net.dto

import kotlinx.serialization.Serializable

@Serializable
data class PhoneDto(
    val countryId: String,
    val callingCode: String,
    val number: String
)

@Serializable
data class AddressDto(
    val line1: String,
    val line2: String = "",
    val city: String,
    val region: String,
    val postalCode: String,
    val countryCode: String
)

@Serializable
data class OrganizationDto(
    val id: String,
    val code: String,
    val name: String,
    val displayName: String? = null,
    val organizationTypeId: String,
    val organizationStatusId: String,
    val primaryEmail: String,
    val primaryPhone: PhoneDto,
    val website: String? = null
)

@Serializable
data class OrganizationDetailsDto(
    val id: String,
    val organizationId: String,
    val registrationNumber: String = "",
    val gstNumber: String = "",
    val supportEmail: String = "",
    val supportPhone: PhoneDto,
    val aboutOrganization: String = "",
    val address: AddressDto
)

@Serializable
data class OrganizationBrandingDto(
    val id: String,
    val organizationId: String,
    val brandingName: String,
    val themeTemplateId: String,
    val brandingStatusId: String,
    val logoUrl: String? = null,
    val darkThemeLogoUrl: String? = null,
    val faviconUrl: String? = null,
    val splashScreenImageUrl: String? = null,
    val primaryColor: String? = null,
    val secondaryColor: String? = null,
    val accentColor: String? = null,
    val tagline: String? = null,
    val heroImageUrl: String? = null
)

@Serializable
data class BusinessOwnerIdentityDto(
    val firstName: String,
    val lastName: String? = null,
    val email: String? = null,
    val phone: PhoneDto
)

@Serializable
data class CreateOrganizationRequestDto(
    val organization: OrganizationDto,
    val details: OrganizationDetailsDto,
    val branding: OrganizationBrandingDto,
    val owner: BusinessOwnerIdentityDto
)

@Serializable
data class CreateOrganizationResponseDto(
    val organizationId: String,
    val organizationDetailsId: String,
    val organizationBrandingId: String,
    val ownerUserId: String,
    val ownerOrganizationUserId: String,
    val ownerRoleAssignmentId: String
)

@Serializable
data class UpdateOrganizationRequestDto(
    val organization: OrganizationDto? = null,
    val details: OrganizationDetailsDto? = null,
    val branding: OrganizationBrandingDto? = null
)

@Serializable
data class UpdateOrganizationResponseDto(
    val organizationId: String
)

@Serializable
data class OrganizationLifecycleResponseDto(
    val organizationId: String,
    val organizationStatusId: String
)
