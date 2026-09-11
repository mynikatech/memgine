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
  CustomerExperienceReleaseService,
  CustomerExperienceReleaseSnapshot,
} from "./customer-experience-release";
import { asyncStorageStore } from "@/src/data/persistence/local/async-storage-store";
import { LOCAL_DATA_KEYS } from "@/src/data/persistence/local/keys";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class LocalCustomerExperienceReleaseService implements CustomerExperienceReleaseService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly membershipProductService: MembershipProductService,
    private readonly benefitService: BenefitService,
    private readonly offerService: OfferService,
    private readonly statusService: StatusService,
  ) {}

  async getPublishedRelease(
    organizationId: ID,
  ): Promise<CustomerExperienceRelease | null> {
    const releases =
      (await asyncStorageStore.get<CustomerExperienceRelease[]>(
        LOCAL_DATA_KEYS.customerExperienceReleases(organizationId),
      )) ?? [];

    const published = releases
      .filter((release) => release.releaseStatus === "PUBLISHED")
      .sort((a, b) => b.releaseNumber - a.releaseNumber)[0];

    return published ? clone(published) : null;
  }

  async createProposedSnapshot(
    customerExperience: CustomerExperience,
  ): Promise<CustomerExperienceReleaseSnapshot> {
    return this.createSnapshot(customerExperience);
  }

  async publishRelease(
    organizationId: ID,
    customerExperience: CustomerExperience,
    publishedBy: ID,
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

    const snapshot = await this.createSnapshot(customerExperience);
    const existing =
      (await asyncStorageStore.get<CustomerExperienceRelease[]>(
        LOCAL_DATA_KEYS.customerExperienceReleases(organizationId),
      )) ?? [];

    const nextNumber =
      existing.reduce(
        (max, release) => Math.max(max, release.releaseNumber),
        0,
      ) + 1;
    const now = new Date().toISOString();

    const archived = existing.map((release) => ({
      ...release,
      releaseStatus: "ARCHIVED" as const,
    }));

    const publishedExperience: CustomerExperience = {
      ...clone(customerExperience),
      experienceStatusId: "status-published",
      lifecycleStatus: "PUBLISHED",
      publishedAt: now,
      publishedBy,
      updatedAt: now,
      updatedBy: publishedBy,
    };

    const release: CustomerExperienceRelease = {
      id: `customer-experience-release-${organizationId}-${nextNumber}`,
      organizationId,
      releaseNumber: nextNumber,
      releaseStatus: "PUBLISHED",
      snapshot: { ...snapshot, customerExperience: publishedExperience },
      publishedAt: now,
      publishedBy,
      createdAt: now,
      createdBy: publishedBy,
      versionNo: 1,
    };

    await asyncStorageStore.set(
      LOCAL_DATA_KEYS.customerExperienceReleases(organizationId),
      [...archived, release],
    );

    return clone(release);
  }

  private async createSnapshot(
    customerExperience: CustomerExperience,
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

    const activeProducts = products.filter((product) =>
      activeProductIds.has(product.id),
    );

    if (!organization) {
      throw new Error(
        `Organization could not be loaded for customer experience release '${organizationId}'.`,
      );
    }

    return {
      customerExperience: clone(customerExperience),
      organization: clone(organization),
      membershipProducts: clone(activeProducts),
      benefits: clone(activeBenefits),
      offers: clone(activeOffers),
      stores: clone(activeStores),
      organizationBranding: clone(organizationBranding),
      organizationDetails: clone(organizationDetails),
    };
  }
}

function isActiveStatus(
  statusId: ID,
  statuses: Array<{ id: ID; statusCode: string; statusName: string }>,
): boolean {
  const status = statuses.find((candidate) => candidate.id === statusId);
  if (!status) return false;
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
