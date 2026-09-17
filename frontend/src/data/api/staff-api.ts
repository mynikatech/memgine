import type { ID, Staff, StaffStoreAssignment } from "@/src/core";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import {
  StaffApiMapper,
  type CreateStaffApiRequest,
  type CreateStaffStoreAssignmentApiRequest,
  type DeleteStaffServerResponse,
  type DeleteStaffStoreAssignmentServerResponse,
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
    return StaffApiMapper.fromServer({ ...dto, staffStatusId });
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
    if (!result.success)
      return apiFailure(result.error.code, result.error.message);
    return apiSuccess(
      await Promise.all(result.data.map((dto) => this.staffFromServer(dto))),
    );
  }

  async create(organizationId: ID, staff: Staff): Promise<ApiResult<Staff>> {
    console.log("[StaffApi] create entered", {
      organizationId,
      staffStatusId: staff.staffStatusId,
    });

    console.log("[StaffApi] resolving STAFF entity status");

    const staffStatusId = await entityStatusApi.resolveEntityStatusId(
      "STAFF",
      staff.staffStatusId,
    );

    console.log("[StaffApi] resolved STAFF entity status", {
      domainStatusId: staff.staffStatusId,
      entityStatusId: staffStatusId,
    });

    const request = StaffApiMapper.toCreateRequest({
      ...staff,
      staffStatusId,
    });

    console.log("[StaffApi] POST staff", request);

    const result = await httpClient.post<CreateStaffApiRequest, StaffServerDto>(
      `/api/v1/organizations/${organizationId}/staff`,
      request,
    );

    console.log("[StaffApi] POST staff returned", result);

    if (!result.success) {
      return apiFailure(result.error.code, result.error.message);
    }

    console.log("[StaffApi] resolving returned staff status", {
      entityStatusId: result.data.staffStatusId,
    });

    const mappedStaff = await this.staffFromServer(result.data);

    console.log("[StaffApi] create completed", mappedStaff);

    return apiSuccess(mappedStaff);
  }
  async update(organizationId: ID, staff: Staff): Promise<ApiResult<Staff>> {
    const staffStatusId = await entityStatusApi.resolveEntityStatusId(
      "STAFF",
      staff.staffStatusId,
    );
    const request = StaffApiMapper.toUpdateRequest({ ...staff, staffStatusId });
    const result = await httpClient.put<UpdateStaffApiRequest, StaffServerDto>(
      `/api/v1/organizations/${organizationId}/staff/${staff.id}`,
      request,
    );
    if (!result.success)
      return apiFailure(result.error.code, result.error.message);
    return apiSuccess(await this.staffFromServer(result.data));
  }

  async delete(organizationId: ID, staffId: ID): Promise<ApiResult<void>> {
    const result = await httpClient.delete<DeleteStaffServerResponse>(
      `/api/v1/organizations/${organizationId}/staff/${staffId}`,
    );
    if (!result.success)
      return apiFailure(result.error.code, result.error.message);
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
    if (!result.success)
      return apiFailure(result.error.code, result.error.message);
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
    if (!result.success)
      return apiFailure(result.error.code, result.error.message);
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
    if (!result.success)
      return apiFailure(result.error.code, result.error.message);
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
    if (!result.success)
      return apiFailure(result.error.code, result.error.message);
    if (!result.data.deleted) {
      return apiFailure(
        "STAFF_ASSIGNMENT_NOT_DELETED",
        "Staff store assignment could not be deleted.",
      );
    }
    return apiSuccess(undefined);
  }
}
