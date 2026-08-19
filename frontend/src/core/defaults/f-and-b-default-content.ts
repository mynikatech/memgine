import { BenefitType } from "../domain/entities";
import { TemplateDefaultContent } from "../template/template-content";
import { F_AND_B_BAKERY_V1 } from "../template/template-definition";

/**
 * F_AND_B_DEFAULT_CONTENT
 *
 * Generic starter content for a new Food & Beverage / Café / Bakery
 * organization using the `f-and-b-bakery-v1` platform template.
 *
 * IMPORTANT:
 * - This is PLATFORM TEMPLATE CONTENT.
 * - It is NOT tied to Sunrise Bakery, Glow Studio, STEEP & SIP,
 *   or any other existing organization.
 * - Existing organizations may override this content with their own
 *   organization-specific business content.
 * - When a new organization is onboarded, this content provides the
 *   initial starter experience until the organization customizes it.
 */
export const F_AND_B_DEFAULT_CONTENT: TemplateDefaultContent = {
  templateId: F_AND_B_BAKERY_V1.id,

  // ---------------------------------------------------------------------------
  // Mandatory
  // ---------------------------------------------------------------------------

  businessIdentity: {
    displayName: "Your Business",
    tagline: "Great products, great experiences, every day.",
    logoUrl: "https://placeholder.memgine.app/logos/business.png",
    heroImageUrl:
      "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=60",
  },

  membership: {
    tierName: "Premium Member",
    productName: "Premium Membership",
    description: "Enjoy exclusive member benefits, special offers and rewards.",
    priceLabel: "$18 / month",
  },

  activeBenefits: [
    {
      title: "Daily member benefit",
      description:
        "Enjoy a complimentary signature item as part of your membership.",
      type: BenefitType.FREEBIE,
    },
    {
      title: "Member pricing",
      description: "Enjoy special pricing on selected products and purchases.",
      type: BenefitType.DISCOUNT,
    },
    {
      title: "Early access",
      description:
        "Get early access to seasonal products, new launches and special promotions.",
      type: BenefitType.PERK,
    },
  ],

  // ---------------------------------------------------------------------------
  // Optional
  // ---------------------------------------------------------------------------

  heroPromotion: {
    title: "Something special is waiting",
    description:
      "Enjoy your member benefits and discover what's new at your favourite location.",
    badge: "MEMBER PERK",
    imageUrl:
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=60",
  },

  featuredPromotion: {
    title: "Member Special",
    description: "Enjoy a special offer available exclusively to members.",
    badge: "LIMITED TIME",
    expiryLabel: "Limited time",
    imageUrl:
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=60",
  },

  offers: [
    {
      title: "Member Special",
      description: "Enjoy a special offer available exclusively to members.",
      badge: "MEMBERS",
      imageUrl:
        "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=800&q=60",
    },
    {
      title: "Bring a Friend",
      description:
        "Invite a friend to experience your business and discover your member benefits.",
      badge: "MEMBERS",
      imageUrl:
        "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=60",
    },
    {
      title: "Member Rewards",
      description:
        "Keep enjoying your membership and make the most of your member rewards.",
      badge: "REWARDS",
      imageUrl:
        "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=800&q=60",
    },
  ],

  stores: [
    {
      name: "Main Location",
      area: "Your Area",
      addressLine: "Business address",
      hours: "Opening hours",
    },
  ],

  /*
   * No historical activity should be copied into a newly onboarded
   * organization. This is intentionally an empty starter state.
   */
  activity: [],

  businessInformation: {
    about:
      "Welcome to your business. Customize this information from the Organization Admin to tell your customers about your products, services and membership experience.",
    supportEmail: "support@example.com",
    supportPhone: "+1 (000) 000-0000",
    website: "https://example.com",
  },

  businessPreferences: {
    notifications: true,
    marketingEmails: false,
    favoriteRoast: "",
  },

  referral: {
    headline: "Share the experience",
    description:
      "Invite a friend to discover your business and enjoy your membership benefits together.",
    rewardLabel: "Member referral reward",
    code: "WELCOME",
  },
};
