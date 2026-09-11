import type { ID, ISODateString } from "./common";
import type { RedemptionMethod } from "./entities";

/**
 * Offer Redemption
 *
 * This is intentionally separate from Benefit Redemption.
 *
 * Physical entity: Offer Redemption.
 * An Offer Redemption does not contain benefitId or subscriptionId because an
 * Offer may be standalone. If an Offer is membership-restricted, eligibility
 * against the membership is validated by the Offer redemption engine.
 */
export interface OfferRedemption {
  id: ID;
  redemptionNumber: string;

  organizationId: ID;
  offerId: ID;
  userId: ID;

  storeId: ID;
  staffId?: ID;

  method: RedemptionMethod;
  redemptionDateTime: ISODateString;

  quantity: number;

  redemptionStatusId: ID;

  remarks?: string;

  createdAt: ISODateString;
  createdBy: ID;
  updatedAt: ISODateString;
  updatedBy: ID;

  isDeleted: boolean;
  versionNo: number;
}
