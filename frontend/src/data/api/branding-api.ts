import type { ID, OrganizationBranding } from "@/src/core";
import { apiFailure, type ApiResult } from "./result";
import { httpClient } from "./http-client";
import { OrganizationApiMapper, type UpdateOrganizationApiRequest } from "./mappers/organization-api-mapper";

type UpdateOrganizationServerResponse = { organizationId: string };
type SaveBrandingDraftRequest = Pick<OrganizationBranding,
  | "id" | "organizationId" | "versionNo" | "primaryColor" | "secondaryColor"
  | "accentColor" | "backgroundColor" | "textColor" | "backgroundImageUrl"
  | "platformThemeCode" | "decoration" | "announcementEnabled"
  | "announcementMessage" | "announcementStyle" | "announcementBackgroundColor"
  | "announcementTextColor" | "announcementLinkUrl" | "announcementStartsAt"
  | "announcementEndsAt"
>;
export class BrandingApi {
 async get(organizationId: ID): Promise<ApiResult<OrganizationBranding | null>> {
   return httpClient.get<OrganizationBranding | null>(`/api/v1/organizations/branding/${organizationId}`);
 }
 async update(organizationId: ID, branding: OrganizationBranding): Promise<ApiResult<OrganizationBranding>> {
   const request = OrganizationApiMapper.toBrandingUpdateRequest(branding);
   const serverResult = await httpClient.put<UpdateOrganizationApiRequest, UpdateOrganizationServerResponse>(
     `/api/v1/organizations/update/${organizationId}`, request,
   );
   if (!serverResult.success) return apiFailure(serverResult.error.code, serverResult.error.message);
   const refreshed = await this.get(organizationId);
   if (!refreshed.success) return refreshed;
   if (!refreshed.data) return apiFailure("BRANDING_NOT_FOUND", "Organization branding could not be loaded from the server.");
   return { success: true, data: refreshed.data };
 }
 async saveBrandingDraft(organizationId: ID, branding: OrganizationBranding): Promise<ApiResult<OrganizationBranding>> {
   const request: SaveBrandingDraftRequest = {
     id: branding.id, organizationId: branding.organizationId, versionNo: branding.versionNo,
     primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor,
     accentColor: branding.accentColor, backgroundColor: branding.backgroundColor,
     textColor: branding.textColor, backgroundImageUrl: branding.backgroundImageUrl,
     platformThemeCode: branding.platformThemeCode, decoration: branding.decoration,
     announcementEnabled: branding.announcementEnabled, announcementMessage: branding.announcementMessage,
     announcementStyle: branding.announcementStyle, announcementBackgroundColor: branding.announcementBackgroundColor,
     announcementTextColor: branding.announcementTextColor, announcementLinkUrl: branding.announcementLinkUrl,
     announcementStartsAt: branding.announcementStartsAt, announcementEndsAt: branding.announcementEndsAt,
   };
   return httpClient.put<SaveBrandingDraftRequest, OrganizationBranding>(
     `/api/v1/organizations/${encodeURIComponent(organizationId)}/branding-v2`, request
   );
 }
}
