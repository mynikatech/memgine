import type { Benefit, BenefitUsageRule, ID, Product } from "@/src/core";
import { BenefitFrequencyType } from "@/src/core";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

type ServerBenefit = Omit<Benefit, "retailPrice" | "cost"> & {
  retailPrice?: number | null;
  cost?: number | null;
};
type ServerRule = Omit<BenefitUsageRule, "frequencyType" | "applicableDays"> & {
  frequencyType: string;
  applicableDays?: string | null;
};
type ServerBundle = { benefit: ServerBenefit; rules: ServerRule[] };

const currencyByCountry: Record<string, string> = {
  CA: "CAD",
  US: "USD",
  GB: "GBP",
  UK: "GBP",
  IN: "INR",
  AU: "AUD",
  SG: "SGD",
  AE: "AED",
  NZ: "NZD",
};
export const benefitOrganizationById = new Map<ID, ID>();

export class BenefitApi {
  private readonly currencies = new Map<ID, string>();

  private async currency(organizationId: ID): Promise<string> {
    const cached = this.currencies.get(organizationId);
    if (cached) return cached;
    const result = await httpClient.get<{ address: { countryCode: string } }>(
      `/api/v1/organizations/details/${organizationId}`,
    );
    if (!result.success) throw new Error(result.error.message);
    const code = result.data.address.countryCode.trim().toUpperCase();
    const currency = currencyByCountry[code];
    if (!currency)
      throw new Error(`No Benefit currency configured for country ${code}.`);
    this.currencies.set(organizationId, currency);
    return currency;
  }

  private async fromServer(dto: ServerBenefit): Promise<Benefit> {
    benefitOrganizationById.set(dto.id, dto.organizationId);
    const currency = await this.currency(dto.organizationId);
    return {
      ...dto,
      benefitStatusId: await entityStatusApi.resolveStatusId(
        dto.benefitStatusId,
      ),
      retailPrice:
        dto.retailPrice == null
          ? undefined
          : { amountMinor: Math.round(dto.retailPrice * 100), currency },
      cost:
        dto.cost == null
          ? undefined
          : { amountMinor: Math.round(dto.cost * 100), currency },
    } as Benefit;
  }

  async rules(organizationId: ID, benefitId: ID): Promise<BenefitUsageRule[]> {
    const result = await httpClient.get<ServerRule[]>(
      `/api/v1/organizations/${organizationId}/benefits/${benefitId}/usage-rules`,
    );
    if (!result.success) throw new Error(result.error.message);
    return Promise.all(
      result.data.map(async (rule) => ({
        ...rule,
        frequencyType: rule.frequencyType as BenefitFrequencyType,
        applicableDays: rule.applicableDays
          ? rule.applicableDays.split(",")
          : undefined,
        benefitUsageRuleStatusId: await entityStatusApi.resolveStatusId(
          rule.benefitUsageRuleStatusId,
        ),
      })),
    );
  }

  async rulesForCustomer(organizationId: ID, userId: ID, benefitId: ID): Promise<BenefitUsageRule[]> {
    const result = await httpClient.get<ServerRule[]>(
      `/api/v1/customer/organizations/${encodeURIComponent(organizationId)}/benefits/${encodeURIComponent(benefitId)}/usage-rules`,
    );
    if (!result.success) throw new Error(result.error.message);
    return Promise.all(result.data.map(async (rule) => ({
      ...rule, frequencyType: rule.frequencyType as BenefitFrequencyType,
      applicableDays: rule.applicableDays ? rule.applicableDays.split(",") : undefined,
      benefitUsageRuleStatusId: await entityStatusApi.resolveStatusId(rule.benefitUsageRuleStatusId),
    })));
  }

  async products(organizationId: ID): Promise<Product[]> {
    const result = await httpClient.get<Product[]>(
      `/api/v1/organizations/${organizationId}/catalog-products`,
    );

    if (!result.success) throw new Error(result.error.message);

    for (const product of result.data) {
      const resolvedStatusId = await entityStatusApi.resolveStatusId(
        product.statusId,
      );
    }

    return Promise.all(
      result.data.map(async (product) => ({
        ...product,
        statusId: await entityStatusApi.resolveStatusId(product.statusId),
      })),
    );
  }

  async list(organizationId: ID): Promise<ApiResult<Benefit[]>> {
    try {
      const result = await httpClient.get<ServerBenefit[]>(
        `/api/v1/organizations/${organizationId}/benefits`,
      );
      if (!result.success) return result;
      return apiSuccess(
        await Promise.all(result.data.map((dto) => this.fromServer(dto))),
      );
    } catch (error) {
      return apiFailure(
        "BENEFIT_LIST_FAILED",
        error instanceof Error ? error.message : "Unable to list benefits.",
      );
    }
  }

  async listForCustomer(organizationId: ID, userId?: ID): Promise<ApiResult<Benefit[]>> {
    try {
      const result = await httpClient.get<ServerBenefit[]>(
        `/api/v1/customer/organizations/${encodeURIComponent(organizationId)}/benefits`,
      );
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map((dto) => this.fromServer(dto))));
    } catch (error) {
      return apiFailure("CUSTOMER_BENEFIT_LIST_FAILED",
        error instanceof Error ? error.message : "Unable to load benefits.");
    }
  }

  async listByMembershipProduct(
    membershipProductId: ID,
  ): Promise<ApiResult<Benefit[]>> {
    try {
      const result = await httpClient.get<ServerBenefit[]>(
        `/api/v1/membership-products/${membershipProductId}/benefits`,
      );
      if (!result.success) return result;
      return apiSuccess(
        await Promise.all(result.data.map((dto) => this.fromServer(dto))),
      );
    } catch (error) {
      return apiFailure(
        "BENEFIT_LIST_FAILED",
        error instanceof Error ? error.message : "Unable to list benefits.",
      );
    }
  }

  async get(organizationId: ID, benefitId: ID): Promise<ApiResult<Benefit>> {
    try {
      const result = await httpClient.get<ServerBenefit>(
        `/api/v1/organizations/${organizationId}/benefits/${benefitId}`,
      );
      if (!result.success) return result;
      return apiSuccess(await this.fromServer(result.data));
    } catch (error) {
      return apiFailure(
        "BENEFIT_LOAD_FAILED",
        error instanceof Error ? error.message : "Unable to load benefit.",
      );
    }
  }

  async save(
    organizationId: ID,
    benefit: Benefit,
    rules: BenefitUsageRule[],
    create: boolean,
  ): Promise<ApiResult<Benefit>> {
    try {
      const currency = await this.currency(organizationId);
      for (const money of [benefit.retailPrice, benefit.cost]) {
        if (money && money.currency !== currency)
          throw new Error(
            `Benefit prices must use the organization's ${currency} currency.`,
          );
      }
      const request = {
        id: benefit.id,
        benefitCode: benefit.benefitCode,
        benefitName: benefit.benefitName,
        displayName: benefit.displayName,
        benefitCategoryId: benefit.benefitCategoryId,
        benefitTypeId: benefit.benefitTypeId,
        description: benefit.description,
        benefitStatusId: await entityStatusApi.resolveEntityStatusId(
          "BENEFIT",
          benefit.benefitStatusId,
        ),
        productId: benefit.productId,
        retailPrice: benefit.retailPrice
          ? benefit.retailPrice.amountMinor / 100
          : null,
        cost: benefit.cost ? benefit.cost.amountMinor / 100 : null,
        effectiveDate: benefit.effectiveDate,
        expiryDate: benefit.expiryDate,
        rules: await Promise.all(
          rules
            .filter((rule) => !rule.isDeleted)
            .map(async (rule) => ({
              id: rule.id,
              ruleName: rule.ruleName,
              frequencyType: rule.frequencyType,
              frequencyInterval: rule.frequencyInterval,
              usageLimit: rule.usageLimit,
              windowStartTime: rule.windowStartTime,
              windowEndTime: rule.windowEndTime,
              applicableDays: rule.applicableDays?.join(","),
              timeZone: rule.timeZone,
              effectiveDate: rule.effectiveDate,
              expiryDate: rule.expiryDate,
              benefitUsageRuleStatusId:
                await entityStatusApi.resolveEntityStatusId(
                  "BENEFIT_USAGE_RULE",
                  rule.benefitUsageRuleStatusId,
                ),
            })),
        ),
      };
      const path = `/api/v1/organizations/${organizationId}/benefits`;
      const result = create
        ? await httpClient.post<typeof request, ServerBundle>(path, request)
        : await httpClient.put<typeof request, ServerBundle>(
            `${path}/${benefit.id}`,
            request,
          );
      if (!result.success) return result;
      return apiSuccess(await this.fromServer(result.data.benefit));
    } catch (error) {
      return apiFailure(
        "BENEFIT_SAVE_FAILED",
        error instanceof Error ? error.message : "Unable to save benefit.",
      );
    }
  }

  create(organizationId: ID, benefit: Benefit) {
    return this.save(organizationId, benefit, [], true);
  }
  async update(organizationId: ID, benefit: Benefit) {
    return this.save(
      organizationId,
      benefit,
      await this.rules(organizationId, benefit.id),
      false,
    );
  }

  async delete(organizationId: ID, benefitId: ID): Promise<ApiResult<void>> {
    const result = await httpClient.delete<{ deleted: boolean }>(
      `/api/v1/organizations/${organizationId}/benefits/${benefitId}`,
    );
    if (!result.success) return result;
    if (!result.data.deleted)
      return apiFailure("BENEFIT_DELETE_FAILED", "Benefit was not deleted.");
    benefitOrganizationById.delete(benefitId);
    return apiSuccess(undefined);
  }
}
