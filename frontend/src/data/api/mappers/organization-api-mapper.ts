import type {
  Organization,
  OrganizationBranding,
  OrganizationDetails,
} from "@/src/core";

import type { CreateOrganizationRepositoryInput } from "@/src/data/repositories/organization/organization-repository";

export type OrganizationApiDto = {
  id: string;
  code: string;
  name: string;
  displayName?: string | null;
  organizationTypeId: string;
  organizationStatusId: string;
  primaryEmail: string;
  primaryPhone: {
    countryId: string;
    callingCode: string;
    number: string;
  };
  website?: string | null;
};

export type OrganizationDetailsApiDto = {
  id: string;
  organizationId: string;
  registrationNumber: string;
  gstNumber: string;
  supportEmail: string;
  supportPhone: {
    countryId: string;
    callingCode: string;
    number: string;
  };
  aboutOrganization: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    countryCode: string;
  };
};

export type OrganizationBrandingApiDto = {
  id: string;
  organizationId: string;
  brandingName: string;
  themeTemplateId: string;
  brandingStatusId: string;
  logoUrl?: string | null;
  darkThemeLogoUrl?: string | null;
  faviconUrl?: string | null;
  splashScreenImageUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  tagline?: string | null;
  heroImageUrl?: string | null;
};

export type CreateOrganizationApiRequest = {
  organization: OrganizationApiDto;
  details: OrganizationDetailsApiDto;
  branding: OrganizationBrandingApiDto;
  owner: BusinessOwnerIdentityApiDto;
};

export type BusinessOwnerIdentityApiDto = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone: {
    countryId: string;
    callingCode: string;
    number: string;
  };
};

export type UpdateOrganizationApiRequest = {
  organization?: OrganizationApiDto;
  details?: OrganizationDetailsApiDto;
  branding?: OrganizationBrandingApiDto;
};

function toOrganizationDto(organization: Organization): OrganizationApiDto {
  return {
    id: organization.id,
    code: organization.code,
    name: organization.name,
    displayName: organization.displayName ?? null,
    organizationTypeId: organization.organizationTypeId,
    organizationStatusId: organization.organizationStatusId,
    primaryEmail: organization.primaryEmail,
    primaryPhone: {
      countryId: organization.primaryPhone.countryId,
      callingCode: organization.primaryPhone.callingCode,
      number: organization.primaryPhone.number,
    },
    website: organization.website ?? null,
  };
}

function toOrganizationDetailsDto(
  details: OrganizationDetails,
): OrganizationDetailsApiDto {
  return {
    id: details.id,
    organizationId: details.organizationId,
    registrationNumber: details.registrationNumber ?? "",
    gstNumber: details.gstNumber ?? "",
    supportEmail: details.supportEmail ?? "",
    supportPhone: {
      countryId: details.supportPhone?.countryId ?? "",
      callingCode: details.supportPhone?.callingCode ?? "",
      number: details.supportPhone?.number ?? "",
    },
    aboutOrganization: details.aboutOrganization ?? "",
    address: {
      line1: details.address.line1,
      line2: details.address.line2 ?? "",
      city: details.address.city,
      region: details.address.region ?? "",
      postalCode: details.address.postalCode ?? "",
      countryCode: details.address.countryCode,
    },
  };
}

function toOrganizationBrandingDto(
  branding: OrganizationBranding,
): OrganizationBrandingApiDto {
  return {
    id: branding.id,
    organizationId: branding.organizationId,
    brandingName: branding.brandingName,
    themeTemplateId: branding.themeTemplateId,
    brandingStatusId: branding.brandingStatusId,
    logoUrl: branding.logoUrl ?? null,
    darkThemeLogoUrl: branding.darkThemeLogoUrl ?? null,
    faviconUrl: branding.faviconUrl ?? null,
    splashScreenImageUrl: branding.splashScreenImageUrl ?? null,
    primaryColor: branding.primaryColor ?? null,
    secondaryColor: branding.secondaryColor ?? null,
    accentColor: branding.accentColor ?? null,
    tagline: branding.tagline ?? null,
    heroImageUrl: branding.heroImageUrl ?? null,
  };
}

export const OrganizationApiMapper = {
  toCreateRequest(
    input: CreateOrganizationRepositoryInput,
    owner: BusinessOwnerIdentityApiDto,
  ): CreateOrganizationApiRequest {
    return {
      organization: toOrganizationDto(input.organization),
      details: toOrganizationDetailsDto(input.details),
      branding: toOrganizationBrandingDto(input.branding),
      owner: {
        firstName: owner.firstName.trim(),
        lastName: owner.lastName?.trim() || null,
        email: owner.email?.trim() || null,
        phone: {
          countryId: owner.phone.countryId,
          callingCode: owner.phone.callingCode,
          number: owner.phone.number,
        },
      },
    };
  },

  toOrganizationUpdateRequest(
    organization: Organization,
  ): UpdateOrganizationApiRequest {
    return {
      organization: toOrganizationDto(organization),
    };
  },

  toDetailsUpdateRequest(
    details: OrganizationDetails,
  ): UpdateOrganizationApiRequest {
    return {
      details: toOrganizationDetailsDto(details),
    };
  },

  toBrandingUpdateRequest(
    branding: OrganizationBranding,
  ): UpdateOrganizationApiRequest {
    return {
      branding: toOrganizationBrandingDto(branding),
    };
  },
};
