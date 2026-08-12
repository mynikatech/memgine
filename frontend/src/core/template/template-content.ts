import { BenefitType } from "../domain/entities";

/**
 * TemplateDefaultContent — REPLACEABLE starter/demo content for a template.
 *
 * This is deliberately its own layer, distinct from:
 *   - TemplateDefinition   (what CAN exist — structure & presentation rules)
 *   - BusinessConfiguration(business-specific branding/settings)
 *   - Domain Data          (actual business/customer records)
 *
 * It is the content a brand-new F&B business starts with before it edits
 * anything. Mandatory sections are always populated; optional sections may be
 * omitted for a given business.
 *
 * Content lives here as plain data — it MUST NOT be hard-coded inside React
 * components.
 */

export interface DefaultBusinessIdentityContent {
  displayName: string;
  tagline: string;
  logoUrl: string;
  heroImageUrl: string;
}

export interface DefaultMembershipContent {
  /** Membership tier label shown to customers, e.g. "Artisan Member". */
  tierName: string;
  /** The product the membership represents. */
  productName: string;
  description: string;
  /** Human-readable price label; real pricing lives in domain data. */
  priceLabel: string;
}

export interface DefaultBenefitContent {
  title: string;
  description: string;
  type: BenefitType;
}

export interface DefaultPromotionContent {
  title: string;
  description: string;
  /** Short highlight badge, e.g. "LIMITED TIME". */
  badge?: string;
  /** Human-readable expiry hint, e.g. "Expires in 4h". */
  expiryLabel?: string;
  imageUrl?: string;
}

export interface DefaultOfferContent {
  title: string;
  description: string;
  badge?: string;
  imageUrl?: string;
}

export interface DefaultStoreContent {
  name: string;
  /** Short area label, e.g. "Downtown". */
  area: string;
  addressLine: string;
  hours?: string;
}

export interface DefaultActivityContent {
  title: string;
  /** Where it happened, e.g. "Downtown Roastery". */
  location: string;
  /** Human-readable time label, e.g. "Today, 9:42 AM". */
  timeLabel: string;
  /** Status label, e.g. "REDEEMED". */
  status: string;
  imageUrl?: string;
}

export interface DefaultBusinessInformationContent {
  about: string;
  supportEmail: string;
  supportPhone: string;
  website: string;
}

export interface DefaultBusinessPreferencesContent {
  notifications: boolean;
  marketingEmails: boolean;
  favoriteRoast?: string;
}

export interface DefaultReferralContent {
  headline: string;
  description: string;
  rewardLabel: string;
  code: string;
}

export interface TemplateDefaultContent {
  /** References the TemplateDefinition this content seeds. */
  templateId: string;

  // ---- Mandatory sections ----
  businessIdentity: DefaultBusinessIdentityContent;
  membership: DefaultMembershipContent;
  activeBenefits: DefaultBenefitContent[];

  // ---- Optional sections ----
  heroPromotion?: DefaultPromotionContent;
  featuredPromotion?: DefaultPromotionContent;
  offers?: DefaultOfferContent[];
  stores?: DefaultStoreContent[];
  activity?: DefaultActivityContent[];
  businessInformation?: DefaultBusinessInformationContent;
  businessPreferences?: DefaultBusinessPreferencesContent;
  referral?: DefaultReferralContent;
}
