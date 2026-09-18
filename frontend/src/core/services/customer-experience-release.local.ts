import type { ID } from "../domain/common";

import type {
  BenefitService,
  MembershipProductService,
  OfferService,
  OrganizationService,
} from "./service-contracts";

import type { StatusService } from "./status";

import type { CustomerExperience } from "./customer-experience";

import type {
  CustomerExperienceRelease,
  CustomerExperienceReleaseContext,
  CustomerExperienceReleaseService,
  CustomerExperienceReleaseSnapshot,
} from "./customer-experience-release";

import { customerExperienceReleaseApi } from "@/src/data/api/customer-experience-release-api";

import type { BenefitUsageRuleService } from "./service-contracts.benefit-usage-rule.additions";

import type { OfferUsageRuleService } from "./offer-usage-rule-service";

import type { ReferralService } from "./service-contracts.profile-referral.additions";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class LocalCustomerExperienceReleaseService implements CustomerExperienceReleaseService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly membershipProductService: MembershipProductService,
    private readonly benefitService: BenefitService,
    private readonly benefitUsageRuleService: BenefitUsageRuleService,
    private readonly offerService: OfferService,
    private readonly offerUsageRuleService: OfferUsageRuleService,
    private readonly referralService: ReferralService,
    private readonly statusService: StatusService,
  ) {}

  async getPublishedRelease(
    organizationId: ID,
  ): Promise<CustomerExperienceRelease | null> {
    return customerExperienceReleaseApi.getPublished(organizationId);
  }

  async createProposedSnapshot(
    customerExperience: CustomerExperience,
    context: CustomerExperienceReleaseContext,
  ): Promise<CustomerExperienceReleaseSnapshot> {
    return this.createSnapshot(customerExperience, context);
  }

  async publishRelease(
    organizationId: ID,
    customerExperience: CustomerExperience,
    publishedBy: ID,
    context: CustomerExperienceReleaseContext,
  ): Promise<CustomerExperienceRelease> {
    if (
      !customerExperience.experienceDefinition.businessIdentity.displayName.trim()
    ) {
      throw new Error("Business display name is required before publishing.");
    }

    if (!customerExperience.experienceDefinition.membership.enabled) {
      throw new Error(
        "Membership must be enabled before publishing the Customer Experience.",
      );
    }

    const snapshot = await this.createSnapshot(customerExperience, context);

    /*
     * Preserve the existing publish semantics.
     *
     * Previously the AsyncStorage implementation converted the Customer
     * Experience inside the immutable release snapshot from DRAFT to
     * PUBLISHED before persisting the release.
     *
     * We still do that here. The only change in this migration is where
     * the completed release is persisted: PostgreSQL instead of AsyncStorage.
     */
    const now = new Date().toISOString();

    const publishedExperience: CustomerExperience = {
      ...clone(customerExperience),
      experienceStatusId: "status-published",
      lifecycleStatus: "PUBLISHED",
      publishedAt: now,
      publishedBy,
      updatedAt: now,
      updatedBy: publishedBy,
    };

    const publishedSnapshot: CustomerExperienceReleaseSnapshot = {
      ...snapshot,
      customerExperience: publishedExperience,
    };

    return customerExperienceReleaseApi.publish(organizationId, {
      snapshot: publishedSnapshot,
      publishedBy,
    });
  }

  private async createSnapshot(
    customerExperience: CustomerExperience,
    context: CustomerExperienceReleaseContext,
  ): Promise<CustomerExperienceReleaseSnapshot> {
    const organizationId = customerExperience.organizationId;

    const [
      products,
      benefits,
      offers,
      stores,
      organization,
      organizationBranding,
      organizationDetails,
      referralProgram,
      productStatuses,
      benefitStatuses,
      offerStatuses,
      storeStatuses,
    ] = await Promise.all([
      this.membershipProductService.listProducts(organizationId),
      this.benefitService.listByOrganization(organizationId),
      this.offerService.listByOrganization(organizationId),
      this.organizationService.listStores(organizationId),
      this.organizationService.getOrganization(organizationId),
      this.organizationService.getOrganizationBranding(organizationId),
      this.organizationService.getOrganizationDetails(organizationId),
      this.referralService.getProgram(organizationId),
      this.statusService.listMembershipProductStatuses(),
      this.statusService.listBenefitStatuses(),
      this.statusService.listOfferStatuses(),
      this.statusService.listStoreStatuses(),
    ]);

    const activeProductIds = new Set(
      products
        .filter(
          (product) =>
            !product.isDeleted &&
            isCurrentlyEffective(product.effectiveDate, product.expiryDate) &&
            isActiveStatus(product.productStatusId, productStatuses),
        )
        .map((product) => product.id),
    );

    const activeBenefits = benefits.filter(
      (benefit) =>
        !benefit.isDeleted &&
        isCurrentlyEffective(benefit.effectiveDate, benefit.expiryDate) &&
        isActiveStatus(benefit.benefitStatusId, benefitStatuses),
    );

    const activeOffers = offers.filter(
      (offer) =>
        !offer.isDeleted &&
        isCurrentlyEffective(offer.effectiveDate, offer.expiryDate) &&
        isActiveStatus(offer.statusId, offerStatuses) &&
        (!offer.membershipProductId ||
          activeProductIds.has(offer.membershipProductId)),
    );

    const activeStores = stores.filter(
      (store) =>
        !store.isDeleted && isActiveStatus(store.storeStatusId, storeStatuses),
    );

    const [benefitUsageRules, offerUsageRules] = await Promise.all([
      Promise.all(
        activeBenefits.map((benefit) =>
          this.benefitUsageRuleService.listByBenefit(benefit.id),
        ),
      ).then((rules) => rules.flat().filter((rule) => !rule.isDeleted)),

      Promise.all(
        activeOffers.map((offer) =>
          this.offerUsageRuleService.listByOffer(offer.id),
        ),
      ).then((rules) => rules.flat().filter((rule) => !rule.isDeleted)),
    ]);

    const activeProducts = products.filter((product) =>
      activeProductIds.has(product.id),
    );

    if (!organization) {
      throw new Error(
        `Organization could not be loaded for customer experience release '${organizationId}'.`,
      );
    }

    return {
      configuration: clone(context.configuration),
      template: clone(context.template),
      customerExperience: clone(customerExperience),
      organization: clone(organization),
      membershipProducts: clone(activeProducts),
      benefits: clone(activeBenefits),
      benefitUsageRules: clone(benefitUsageRules),
      offers: clone(activeOffers),
      offerUsageRules: clone(offerUsageRules),
      stores: clone(activeStores),
      referralProgram: clone(referralProgram),
      organizationBranding: clone(organizationBranding),
      organizationDetails: clone(organizationDetails),
    };
  }
}

function isActiveStatus(
  statusId: ID,
  statuses: Array<{
    id: ID;
    statusCode: string;
    statusName: string;
  }>,
): boolean {
  const status = statuses.find((candidate) => candidate.id === statusId);

  if (!status) {
    return false;
  }

  return (
    status.statusCode.trim().toUpperCase() === "ACTIVE" ||
    status.statusName.trim().toUpperCase() === "ACTIVE"
  );
}

function isCurrentlyEffective(
  effectiveDate?: string,
  expiryDate?: string,
): boolean {
  const now = Date.now();

  const start = effectiveDate
    ? Date.parse(effectiveDate)
    : Number.NEGATIVE_INFINITY;

  const end = expiryDate ? Date.parse(expiryDate) : Number.POSITIVE_INFINITY;

  return (
    !Number.isNaN(start) && !Number.isNaN(end) && now >= start && now <= end
  );
}
