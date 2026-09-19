import type { ID, Offer, OfferUsageRule } from "@/src/core";
import { entityStatusApi } from "./entity-status-api";
import { httpClient } from "./http-client";
import { apiFailure, apiSuccess, type ApiResult } from "./result";

type ServerRule = Omit<OfferUsageRule, "applicableDays"> & { applicableDays?: string | null };
type ServerBundle = { offer: Offer; rules: ServerRule[] };

export const offerOrganizationById = new Map<ID, ID>();

export class OfferApi {
  private async fromServer(offer: Offer): Promise<Offer> {
    offerOrganizationById.set(offer.id, offer.organizationId);
    return { ...offer, statusId: await entityStatusApi.resolveStatusId(offer.statusId) };
  }

  async rules(organizationId: ID, offerId: ID): Promise<OfferUsageRule[]> {
    const result = await httpClient.get<ServerRule[]>(
      `/api/v1/organizations/${organizationId}/offers/${offerId}/usage-rules`,
    );
    if (!result.success) throw new Error(result.error.message);
    return Promise.all(result.data.map(async (rule) => ({
      ...rule,
      applicableDays: rule.applicableDays ? rule.applicableDays.split(",") : undefined,
      offerUsageRuleStatusId: await entityStatusApi.resolveStatusId(rule.offerUsageRuleStatusId),
    })));
  }

  async list(organizationId: ID): Promise<ApiResult<Offer[]>> {
    try {
      const result = await httpClient.get<Offer[]>(`/api/v1/organizations/${organizationId}/offers`);
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map((offer) => this.fromServer(offer))));
    } catch (error) {
      return apiFailure("OFFER_LIST_FAILED", error instanceof Error ? error.message : "Unable to list offers.");
    }
  }

  async listForCustomer(organizationId: ID, userId: ID): Promise<ApiResult<Offer[]>> {
    try {
      const result = await httpClient.get<Offer[]>(
        `/api/v1/customer/organizations/${encodeURIComponent(organizationId)}/offers`,
      );
      if (!result.success) return result;
      return apiSuccess(await Promise.all(result.data.map((offer) => this.fromServer(offer))));
    } catch (error) {
      return apiFailure("CUSTOMER_OFFER_LIST_FAILED",
        error instanceof Error ? error.message : "Unable to load offers.");
    }
  }

  async get(organizationId: ID, offerId: ID): Promise<ApiResult<Offer | null>> {
    try {
      const result = await httpClient.get<Offer>(`/api/v1/organizations/${organizationId}/offers/${offerId}`);
      if (!result.success) return result;
      return apiSuccess(await this.fromServer(result.data));
    } catch (error) {
      return apiFailure("OFFER_LOAD_FAILED", error instanceof Error ? error.message : "Unable to load offer.");
    }
  }

  async save(organizationId: ID, offer: Offer, rules: OfferUsageRule[], create: boolean): Promise<ApiResult<Offer>> {
    try {
      const request = {
        id: offer.id, offerCode: offer.offerCode, offerName: offer.offerName,
        description: offer.description, membershipProductId: offer.membershipProductId,
        storeId: offer.storeId, promotionImageUrl: offer.promotionImageUrl,
        badgeText: offer.badgeText, availabilityText: offer.availabilityText,
        ctaLabel: offer.ctaLabel, ctaType: offer.ctaType, ctaTarget: offer.ctaTarget,
        discountPercentage: offer.discountPercentage, effectiveDate: offer.effectiveDate,
        expiryDate: offer.expiryDate,
        statusId: await entityStatusApi.resolveEntityStatusId("OFFER", offer.statusId),
        versionNo: offer.versionNo,
        rules: await Promise.all(rules.filter((rule) => !rule.isDeleted).map(async (rule) => ({
          id: rule.id, ruleName: rule.ruleName, frequencyType: rule.frequencyType,
          frequencyInterval: rule.frequencyInterval, usageLimit: rule.usageLimit,
          windowStartTime: rule.windowStartTime, windowEndTime: rule.windowEndTime,
          applicableDays: rule.applicableDays?.join(","), timeZone: rule.timeZone,
          effectiveDate: rule.effectiveDate, expiryDate: rule.expiryDate,
          offerUsageRuleStatusId: await entityStatusApi.resolveEntityStatusId(
            "OFFER_USAGE_RULE", rule.offerUsageRuleStatusId,
          ),
          versionNo: rule.versionNo,
        }))),
      };
      const path = `/api/v1/organizations/${organizationId}/offers`;
      const result = create
        ? await httpClient.post<typeof request, ServerBundle>(path, request)
        : await httpClient.put<typeof request, ServerBundle>(`${path}/${offer.id}`, request);
      if (!result.success) return result;
      return apiSuccess(await this.fromServer(result.data.offer));
    } catch (error) {
      return apiFailure("OFFER_SAVE_FAILED", error instanceof Error ? error.message : "Unable to save offer.");
    }
  }

  create(organizationId: ID, offer: Offer): Promise<ApiResult<Offer>> {
    return this.save(organizationId, offer, [], true);
  }

  async update(organizationId: ID, offer: Offer): Promise<ApiResult<Offer>> {
    try {
      return this.save(organizationId, offer, await this.rules(organizationId, offer.id), false);
    } catch (error) {
      return apiFailure("OFFER_UPDATE_FAILED", error instanceof Error ? error.message : "Unable to update offer.");
    }
  }

  async delete(organizationId: ID, offerId: ID): Promise<ApiResult<void>> {
    const result = await httpClient.delete<{ deleted: boolean }>(
      `/api/v1/organizations/${organizationId}/offers/${offerId}`,
    );
    if (!result.success) return result;
    if (!result.data.deleted) return apiFailure("OFFER_DELETE_FAILED", "Offer was not deleted.");
    offerOrganizationById.delete(offerId);
    return apiSuccess(undefined);
  }
}
