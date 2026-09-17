import type { ID, Staff, StaffStoreAssignment } from "@/src/core";

import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import {
  StaffApiMapper,
  type CreateStaffStoreAssignmentApiRequest,
  type CreateStaffTransactionApiRequest,
  type CreateStaffTransactionServerResponse,
  type DeleteStaffServerResponse,
  type DeleteStaffStoreAssignmentServerResponse,
  type StaffPersonApiInput,
  type StaffServerDto,
  type StaffStoreAssignmentServerDto,
  type UpdateStaffApiRequest,
  type UpdateStaffStoreAssignmentApiRequest,
} from "./mappers/staff-api-mapper";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

export class StaffApi {
  private async staffFromServer(dto: StaffServerDto): Promise<Staff> {
    const staffStatusId = await entityStatusApi.resolveStatusId(
      dto.staffStatusId,
    );

    return StaffApiMapper.fromServer({
      ...dto,
      staffStatusId,
    });
  }

  private async assignmentFromServer(
    dto: StaffStoreAssignmentServerDto,
  ): Promise<StaffStoreAssignment> {
    const assignmentStatusId = await entityStatusApi.resolveStatusId(
      dto.assignmentStatusId,
    );

    return StaffApiMapper.assignmentFromServer({
      ...dto,
      assignmentStatusId,
    });
  }

  async list(organizationId: ID): Promise<ApiResult<Staff[]>> {
    const result = await httpClient.get<StaffServerDto[]>(
      `/api/v1/organizations/${organizationId}/staff`,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    return apiSuccess(
      await Promise.all(result.data.map((dto) => this.staffFromServer(dto))),
    );
  }

  async createWithPerson(
    organizationId: ID,
    staff: Staff,
    person: StaffPersonApiInput,
    assignments: StaffStoreAssignment[],
  ): Promise<
    ApiResult<{
      staff: Staff;
      assignments: StaffStoreAssignment[];
    }>
  > {
    const staffStatusId = await entityStatusApi.resolveEntityStatusId(
      "STAFF",
      staff.staffStatusId,
    );

    const assignmentRequests = await Promise.all(
      assignments.map(async (assignment) => {
        const assignmentStatusId = await entityStatusApi.resolveEntityStatusId(
          "STAFF_STORE_ASSIGNMENT",
          assignment.assignmentStatusId,
        );

        return StaffApiMapper.assignmentToCreateRequest({
          ...assignment,
          assignmentStatusId,
        });
      }),
    );

    /*
     * These IDs are used only for the server transaction.
     * Nothing is persisted locally.
     *
     * PostgreSQL remains authoritative because the
     * frontend does not commit Staff data locally.
     *
     * We will revisit identifier generation separately
     * after the Staff flow is stable.
     */
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const userId = `user-${nonce}`;

    const organizationUserId = `organization-user-${nonce}`;

    const userCode = `USR-${Date.now()}`;

    const primaryPhone = `${person.primaryPhone.callingCode ?? ""}${
      person.primaryPhone.number ?? ""
    }`.replace(/\s/g, "");

    const request: CreateStaffTransactionApiRequest = {
      staff: StaffApiMapper.toCreateRequest({
        ...staff,
        organizationUserId,
        staffStatusId,
      }),

      organizationUser: {
        userId,
        userCode,

        firstName: person.firstName.trim(),

        middleName: person.middleName?.trim() || undefined,

        lastName: person.lastName.trim(),

        displayName:
          person.displayName?.trim() ||
          `${person.firstName} ${person.lastName}`.trim(),

        primaryEmail: person.primaryEmail?.trim().toLowerCase() || undefined,

        primaryPhone,

        preferredLanguageId: person.preferredLanguageId,

        organizationUserId,

        organizationUserTypeId: "organization-user-type-employee",

        joiningDate: staff.joiningDate,
      },

      assignments: assignmentRequests,
    };

    const result = await httpClient.post<
      CreateStaffTransactionApiRequest,
      CreateStaffTransactionServerResponse
    >(`/api/v1/organizations/${organizationId}/staff`, request);

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    const mappedStaff = await this.staffFromServer(result.data.staff);

    const mappedAssignments = await Promise.all(
      result.data.assignments.map((assignment) =>
        this.assignmentFromServer(assignment),
      ),
    );

    return apiSuccess({
      staff: mappedStaff,
      assignments: mappedAssignments,
    });
  }

  async update(organizationId: ID, staff: Staff): Promise<ApiResult<Staff>> {
    const staffStatusId = await entityStatusApi.resolveEntityStatusId(
      "STAFF",
      staff.staffStatusId,
    );

    const request: UpdateStaffApiRequest = StaffApiMapper.toUpdateRequest({
      ...staff,
      staffStatusId,
    });

    const result = await httpClient.put<UpdateStaffApiRequest, StaffServerDto>(
      `/api/v1/organizations/${organizationId}/staff/${staff.id}`,
      request,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    return apiSuccess(await this.staffFromServer(result.data));
  }

  async delete(organizationId: ID, staffId: ID): Promise<ApiResult<void>> {
    const result = await httpClient.delete<DeleteStaffServerResponse>(
      `/api/v1/organizations/${organizationId}/staff/${staffId}`,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    if (!result.data.deleted) {
      return apiFailure(
        "STAFF_NOT_DELETED",
        "Staff member could not be deleted.",
      );
    }

    return apiSuccess(undefined);
  }

  async listAssignments(
    organizationId: ID,
  ): Promise<ApiResult<StaffStoreAssignment[]>> {
    const result = await httpClient.get<StaffStoreAssignmentServerDto[]>(
      `/api/v1/organizations/${organizationId}/staff-store-assignments`,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    return apiSuccess(
      await Promise.all(
        result.data.map((dto) => this.assignmentFromServer(dto)),
      ),
    );
  }

  async createAssignment(
    organizationId: ID,
    assignment: StaffStoreAssignment,
  ): Promise<ApiResult<StaffStoreAssignment>> {
    const assignmentStatusId = await entityStatusApi.resolveEntityStatusId(
      "STAFF_STORE_ASSIGNMENT",
      assignment.assignmentStatusId,
    );

    const request = StaffApiMapper.assignmentToCreateRequest({
      ...assignment,
      assignmentStatusId,
    });

    const result = await httpClient.post<
      CreateStaffStoreAssignmentApiRequest,
      StaffStoreAssignmentServerDto
    >(
      `/api/v1/organizations/${organizationId}/staff-store-assignments`,
      request,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    return apiSuccess(await this.assignmentFromServer(result.data));
  }

  async updateAssignment(
    organizationId: ID,
    assignment: StaffStoreAssignment,
  ): Promise<ApiResult<StaffStoreAssignment>> {
    const assignmentStatusId = await entityStatusApi.resolveEntityStatusId(
      "STAFF_STORE_ASSIGNMENT",
      assignment.assignmentStatusId,
    );

    const request = StaffApiMapper.assignmentToUpdateRequest({
      ...assignment,
      assignmentStatusId,
    });

    const result = await httpClient.put<
      UpdateStaffStoreAssignmentApiRequest,
      StaffStoreAssignmentServerDto
    >(
      `/api/v1/organizations/${organizationId}/staff-store-assignments/${assignment.id}`,
      request,
    );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    return apiSuccess(await this.assignmentFromServer(result.data));
  }

  async deleteAssignment(
    organizationId: ID,
    assignmentId: ID,
  ): Promise<ApiResult<void>> {
    const result =
      await httpClient.delete<DeleteStaffStoreAssignmentServerResponse>(
        `/api/v1/organizations/${organizationId}/staff-store-assignments/${assignmentId}`,
      );

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    if (!result.data.deleted) {
      return apiFailure(
        "STAFF_ASSIGNMENT_NOT_DELETED",
        "Staff store assignment could not be deleted.",
      );
    }

    return apiSuccess(undefined);
  }
}
