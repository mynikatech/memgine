import type { ID, OrganizationUser, User } from "@/src/core";

export interface OrganizationUserServerDto {
  organizationUserId: ID;
  organizationId: ID;

  userId: ID;
  userCode: string;

  firstName: string;
  middleName?: string;
  lastName?: string;
  displayName?: string;

  primaryEmail?: string;
  primaryPhone?: string;

  preferredLanguageId?: ID;
  userStatusId?: ID;

  organizationUserTypeId: ID;
  organizationUserStatusId?: ID;

  joiningDate?: string;

  createdAt?: string;
  createdBy?: ID;
  updatedAt?: string;
  updatedBy?: ID;

  isDeleted?: boolean;
  versionNo?: number;
}

export interface OrganizationUserWithUser {
  organizationUser: OrganizationUser;
  user: User;
}

function splitPhone(primaryPhone?: string): {
  callingCode: string;
  number: string;
} {
  const value = primaryPhone?.trim() ?? "";

  if (!value) {
    return {
      callingCode: "",
      number: "",
    };
  }

  /*
   * Toronto/Canada is the initial deployment,
   * but do not hard-code a country ID here.
   *
   * Country metadata remains reference data.
   */
  if (value.startsWith("+1")) {
    return {
      callingCode: "+1",
      number: value.substring(2),
    };
  }

  return {
    callingCode: "",
    number: value.replace(/\D/g, ""),
  };
}

export const OrganizationUserApiMapper = {
  fromServer(dto: OrganizationUserServerDto): OrganizationUserWithUser {
    const now = new Date().toISOString();

    const phone = splitPhone(dto.primaryPhone);

    const user: User = {
      id: dto.userId,
      userCode: dto.userCode,

      firstName: dto.firstName,
      middleName: dto.middleName,
      lastName: dto.lastName ?? "",

      displayName: dto.displayName,

      primaryEmail: dto.primaryEmail,

      primaryPhone: {
        /*
         * The current OrganizationUser server DTO
         * exposes the scalar persisted phone.
         *
         * Country ID is reference metadata and is
         * normalized by the Staff form from its
         * country list when editing.
         */
        countryId: "",
        callingCode: phone.callingCode,
        number: phone.number,
      },

      preferredLanguageId: dto.preferredLanguageId,

      userStatusId: dto.userStatusId ?? "status-active",

      createdAt: dto.createdAt ?? now,

      createdBy: dto.createdBy ?? "",

      updatedAt: dto.updatedAt ?? now,

      updatedBy: dto.updatedBy ?? dto.createdBy ?? "",

      isDeleted: dto.isDeleted ?? false,

      versionNo: dto.versionNo ?? 1,
    };

    const organizationUser: OrganizationUser = {
      id: dto.organizationUserId,

      organizationId: dto.organizationId,

      userId: dto.userId,

      organizationUserTypeId: dto.organizationUserTypeId,

      organizationUserStatusId: dto.organizationUserStatusId ?? "status-active",

      joiningDate: dto.joiningDate ?? dto.createdAt ?? new Date().toISOString(),

      createdAt: dto.createdAt ?? now,

      createdBy: dto.createdBy ?? "",

      updatedAt: dto.updatedAt ?? now,

      updatedBy: dto.updatedBy ?? dto.createdBy ?? "",

      isDeleted: dto.isDeleted ?? false,

      versionNo: dto.versionNo ?? 1,
    };

    return {
      organizationUser,
      user,
    };
  },
};
