import type { Benefit, ID } from "@/src/core";

import type { BenefitRepository } from "../repositories/benefit/benefit-repository";

import { apiFailure, apiSuccess, type ApiResult } from "./result";

export class BenefitApi {
  constructor(private readonly repository: BenefitRepository) {}

  async list(organizationId: ID): Promise<ApiResult<Benefit[]>> {
    try {
      return apiSuccess(await this.repository.list(organizationId));
    } catch (error) {
      return apiFailure(
        "BENEFIT_LIST_FAILED",
        error instanceof Error ? error.message : "Unable to list benefits.",
      );
    }
  }

  async get(
    organizationId: ID,
    benefitId: ID,
  ): Promise<ApiResult<Benefit | null>> {
    try {
      return apiSuccess(await this.repository.get(organizationId, benefitId));
    } catch (error) {
      return apiFailure(
        "BENEFIT_LOAD_FAILED",
        error instanceof Error ? error.message : "Unable to load benefit.",
      );
    }
  }

  async create(
    organizationId: ID,
    benefit: Benefit,
  ): Promise<ApiResult<Benefit>> {
    try {
      return apiSuccess(
        await this.repository.create({
          ...benefit,
          organizationId,
        }),
      );
    } catch (error) {
      return apiFailure(
        "BENEFIT_CREATE_FAILED",
        error instanceof Error ? error.message : "Unable to create benefit.",
      );
    }
  }

  async update(
    organizationId: ID,
    benefit: Benefit,
  ): Promise<ApiResult<Benefit>> {
    try {
      return apiSuccess(await this.repository.update(organizationId, benefit));
    } catch (error) {
      return apiFailure(
        "BENEFIT_UPDATE_FAILED",
        error instanceof Error ? error.message : "Unable to update benefit.",
      );
    }
  }

  async delete(organizationId: ID, benefitId: ID): Promise<ApiResult<void>> {
    try {
      await this.repository.delete(organizationId, benefitId);

      return apiSuccess(undefined);
    } catch (error) {
      return apiFailure(
        "BENEFIT_DELETE_FAILED",
        error instanceof Error ? error.message : "Unable to delete benefit.",
      );
    }
  }
}
