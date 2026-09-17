import {
  DEFAULT_ROLE_CAPABILITIES,
  StaffRole,
  type ID,
  type Staff,
  type StaffStoreAssignment,
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
  if (normalized === StaffRole.OWNER) return StaffRole.OWNER;
  if (normalized === StaffRole.MANAGER) return StaffRole.MANAGER;
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
      capabilities: [...DEFAULT_ROLE_CAPABILITIES[role]],
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
