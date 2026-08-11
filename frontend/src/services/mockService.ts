import type { BusinessConfiguration } from "@/src/business/types";

import {
  benefitsByOrg,
  businessConfigurations,
  businessSummaries,
  memberships,
  offersByOrg,
  productsByOrg,
} from "./mockData";
import type {
  Benefit,
  BusinessSummary,
  ID,
  Membership,
  MembershipProduct,
  MemgineService,
  Offer,
} from "./types";

const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * In-memory implementation of the MemgineService boundary. Swappable for a REST
 * client later without touching any component. Simulates latency so loading
 * states are exercised.
 */
export class MockMemgineService implements MemgineService {
  async getBusinesses(): Promise<BusinessSummary[]> {
    await delay();
    return clone(businessSummaries);
  }

  async getBusinessConfiguration(id: ID): Promise<BusinessConfiguration> {
    await delay();
    const config = businessConfigurations[id];
    if (!config) throw new Error(`Unknown business: ${id}`);
    return clone(config);
  }

  async getMyMemberships(): Promise<Membership[]> {
    await delay();
    return clone(memberships);
  }

  async getOffers(organizationId: ID): Promise<Offer[]> {
    await delay();
    return clone(offersByOrg[organizationId] ?? []);
  }

  async getBenefits(organizationId: ID): Promise<Benefit[]> {
    await delay();
    return clone(benefitsByOrg[organizationId] ?? []);
  }

  async getMembershipProducts(organizationId: ID): Promise<MembershipProduct[]> {
    await delay();
    return clone(productsByOrg[organizationId] ?? []);
  }
}
