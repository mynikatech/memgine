import {
  StaffRole,
  type ID,
  type OrganizationUser,
  type Staff,
  type StaffStoreAssignment,
  type User,
} from "@/src/core";

export interface StaffServerDto {
  id: ID;
  organizationId: ID;
  organizationUserId: ID;
  staffCode: string;
  designation?: string;
  storeId?: ID;
  joiningDate: string;
  relievingDate?: string;
  staffStatusId: ID;
  roleCode: string;
  createdAt: string;
  createdBy: ID;
  updatedAt: string;
  updatedBy: ID;
  isDeleted: boolean;
  versionNo: number;
}

export interface CreateStaffApiRequest {
  id: ID;
  organizationUserId: ID;
  staffCode: string;
  designation?: string;
  storeId?: ID;
  joiningDate: string;
  relievingDate?: string;
  staffStatusId: ID;
  roleCode: string;
}

export type UpdateStaffApiRequest = Omit<
  CreateStaffApiRequest,
  "id" | "organizationUserId"
>;

export interface StaffStoreAssignmentServerDto {
  id: ID;
  organizationId: ID;
  staffId: ID;
  storeId: ID;
  assignmentStatusId: ID;
  effectiveDate: string;
  endDate?: string;
  createdAt: string;
  createdBy: ID;
  updatedAt: string;
  updatedBy: ID;
  isDeleted: boolean;
  versionNo: number;
}

export interface CreateStaffStoreAssignmentApiRequest {
  id: ID;
  staffId: ID;
  storeId: ID;
  assignmentStatusId: ID;
  effectiveDate: string;
  endDate?: string;
}

export type UpdateStaffStoreAssignmentApiRequest = Omit<
  CreateStaffStoreAssignmentApiRequest,
  "id" | "staffId"
>;
export interface StaffPersonApiInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  displayName?: string;
  primaryEmail?: string;

  primaryPhone: {
    countryId: ID;
    callingCode: string;
    number: string;
  };

  preferredLanguageId?: ID;
}

export interface StaffPersonApiRequest {
  userId: ID;
  userCode: string;

  firstName: string;
  middleName?: string;
  lastName: string;
  displayName?: string;

  primaryEmail?: string;
  primaryPhone: string;
  preferredLanguageId?: ID;

  organizationUserId: ID;
  organizationUserTypeId: ID;
  joiningDate: string;
}

export interface StaffOrganizationUserApiRequest {
  userId: ID;
  userCode: string;
  firstName: string;
  middleName?: string;
  lastName?: string;
  displayName?: string;
  primaryEmail?: string;
  primaryPhone: string;
  preferredLanguageId?: ID;

  organizationUserId: ID;
  organizationUserTypeId: ID;
  joiningDate?: string;
}

export interface CreateStaffTransactionApiRequest {
  staff: CreateStaffApiRequest;
  organizationUser: StaffOrganizationUserApiRequest;
  assignments: CreateStaffStoreAssignmentApiRequest[];
}
export interface UpdateStaffTransactionApiRequest {
  staff: UpdateStaffApiRequest;
  person: StaffPersonApiRequest;
}

export interface CreateStaffTransactionServerResponse {
  staff: StaffServerDto;
  assignments: StaffStoreAssignmentServerDto[];
}

export interface DeleteStaffServerResponse {
  staffId: ID;
  deleted: boolean;
}

export interface DeleteStaffStoreAssignmentServerResponse {
  assignmentId: ID;
  deleted: boolean;
}

function toStaffRole(roleCode: string): StaffRole {
  const normalized = roleCode.trim().toUpperCase();

  if (normalized === StaffRole.OWNER || normalized === "OWNER") {
    return StaffRole.OWNER;
  }

  if (normalized === StaffRole.ORG_ADMIN || normalized === "ADMIN") {
    return StaffRole.ORG_ADMIN;
  }

  if (normalized === StaffRole.MANAGER) {
    return StaffRole.MANAGER;
  }

  return StaffRole.STAFF;
}

export const StaffApiMapper = {
  fromServer(dto: StaffServerDto): Staff {
    const role = toStaffRole(dto.roleCode);

    return {
      id: dto.id,
      organizationId: dto.organizationId,
      organizationUserId: dto.organizationUserId,
      staffCode: dto.staffCode,
      designation: dto.designation,
      storeId: dto.storeId,
      joiningDate: dto.joiningDate,
      relievingDate: dto.relievingDate,
      staffStatusId: dto.staffStatusId,
      role,
      // Staff metadata is not an effective RBAC assignment.
      capabilities: [],
      isActive: !dto.isDeleted,
      createdAt: dto.createdAt,
      createdBy: dto.createdBy,
      updatedAt: dto.updatedAt,
      updatedBy: dto.updatedBy,
      isDeleted: dto.isDeleted,
      versionNo: dto.versionNo,
    };
  },

  toCreateRequest(staff: Staff): CreateStaffApiRequest {
    return {
      id: staff.id,
      organizationUserId: staff.organizationUserId,
      staffCode: staff.staffCode,
      designation: staff.designation,
      storeId: staff.storeId,
      joiningDate: staff.joiningDate,
      relievingDate: staff.relievingDate,
      staffStatusId: staff.staffStatusId,
      roleCode: staff.role,
    };
  },

  toUpdateRequest(staff: Staff): UpdateStaffApiRequest {
    return {
      staffCode: staff.staffCode,
      designation: staff.designation,
      storeId: staff.storeId,
      joiningDate: staff.joiningDate,
      relievingDate: staff.relievingDate,
      staffStatusId: staff.staffStatusId,
      roleCode: staff.role,
    };
  },

  personToRequest(person: {
    userId: ID;
    userCode: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    displayName?: string;
    primaryEmail?: string;
    primaryPhone: {
      callingCode: string;
      number: string;
    };
    preferredLanguageId?: ID;
    organizationUserId: ID;
    organizationUserTypeId: ID;
    joiningDate: string;
  }): StaffPersonApiRequest {
    return {
      userId: person.userId,
      userCode: person.userCode,

      firstName: person.firstName,
      middleName: person.middleName,
      lastName: person.lastName,
      displayName: person.displayName,

      primaryEmail: person.primaryEmail,

      primaryPhone:
        `${person.primaryPhone.callingCode ?? ""}${person.primaryPhone.number ?? ""}`.trim(),

      preferredLanguageId: person.preferredLanguageId,

      organizationUserId: person.organizationUserId,
      organizationUserTypeId: person.organizationUserTypeId,

      joiningDate: person.joiningDate,
    };
  },

  assignmentFromServer(
    dto: StaffStoreAssignmentServerDto,
  ): StaffStoreAssignment {
    return { ...dto };
  },

  assignmentToCreateRequest(
    assignment: StaffStoreAssignment,
  ): CreateStaffStoreAssignmentApiRequest {
    return {
      id: assignment.id,
      staffId: assignment.staffId,
      storeId: assignment.storeId,
      assignmentStatusId: assignment.assignmentStatusId,
      effectiveDate: assignment.effectiveDate,
      endDate: assignment.endDate,
    };
  },

  assignmentToUpdateRequest(
    assignment: StaffStoreAssignment,
  ): UpdateStaffStoreAssignmentApiRequest {
    return {
      storeId: assignment.storeId,
      assignmentStatusId: assignment.assignmentStatusId,
      effectiveDate: assignment.effectiveDate,
      endDate: assignment.endDate,
    };
  },
};
