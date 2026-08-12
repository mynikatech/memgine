import { BenefitType } from "../domain/entities";
import { TemplateDefaultContent } from "../template/template-content";
import { F_AND_B_BAKERY_V1 } from "../template/template-definition";

/**
 * F_AND_B_DEFAULT_CONTENT — the REPLACEABLE starter/demo content that a new
 * Food & Beverage / Café-Bakery business begins with on the
 * `f-and-b-bakery-v1` template.
 *
 * The demo brand and copy are derived from the supplied client mockups (an
 * artisanal coffee experience). They are illustrative example content only —
 * every field is meant to be replaced by the business via its own
 * BusinessConfiguration + Domain Data. This is NOT a real business and NOT tied
 * to any specific tenant.
 *
 * Imagery uses royalty-free stock URLs purely so a future renderer has real
 * placeholder visuals; they are content values, not bundled assets.
 */
export const F_AND_B_DEFAULT_CONTENT: TemplateDefaultContent = {
  templateId: F_AND_B_BAKERY_V1.id,

  // ---- Mandatory ----
  businessIdentity: {
    displayName: "Steep & Sip",
    tagline: "Your artisanal coffee journey, brewed daily.",
    logoUrl: "https://placeholder.memgine.app/logos/steep-and-sip.png",
    heroImageUrl:
      "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=60",
  },
  membership: {
    tierName: "Artisan Member",
    productName: "Premium Single-Origin Roasts",
    description: "Your subscription for premium single-origin roasts, brewed fresh every day.",
    priceLabel: "$18 / month",
  },
  activeBenefits: [
    {
      title: "1 Coffee per day",
      description:
        "Treat yourself to our signature artisanal pour-over, crafted with precision by our baristas.",
      type: BenefitType.FREEBIE,
    },
    {
      title: "Member pricing on beans",
      description: "20% off all retail bags of single-origin roasted beans, every visit.",
      type: BenefitType.DISCOUNT,
    },
    {
      title: "Early access to seasonal roasts",
      description: "Be first to taste limited seasonal single-origin releases before they sell out.",
      type: BenefitType.PERK,
    },
  ],

  // ---- Optional ----
  heroPromotion: {
    title: "Today's brew is waiting",
    description: "Your daily signature pour-over is ready to redeem at any location.",
    badge: "MEMBER PERK",
    imageUrl:
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=60",
  },
  featuredPromotion: {
    title: "50% off Pastries",
    description:
      "Pair your morning pour-over with a fresh-baked delight. Valid on all butter croissants and seasonal danishes.",
    badge: "LIMITED TIME",
    expiryLabel: "Expires in 4h",
    imageUrl:
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=60",
  },
  offers: [
    {
      title: "50% off Pastries",
      description: "All butter croissants and seasonal danishes, today only.",
      badge: "LIMITED TIME",
      imageUrl:
        "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=800&q=60",
    },
    {
      title: "Bring a friend",
      description: "Free pour-over for a first-time guest when they visit with you.",
      badge: "MEMBERS",
      imageUrl:
        "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=60",
    },
    {
      title: "Double roast rewards",
      description: "Earn 2x progress toward your Coffee Master badge every weekend.",
      badge: "WEEKENDS",
      imageUrl:
        "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=800&q=60",
    },
  ],
  stores: [
    {
      name: "Downtown Roastery",
      area: "Downtown",
      addressLine: "128 King Street West",
      hours: "Mon–Fri 7:00–19:00 · Sat–Sun 8:00–18:00",
    },
    {
      name: "The Pier House",
      area: "Harbourfront",
      addressLine: "9 Harbour Esplanade",
      hours: "Daily 8:00–20:00",
    },
    {
      name: "The Quiet Corner",
      area: "Riverside",
      addressLine: "44 Maple Lane",
      hours: "Mon–Sat 7:30–17:00",
    },
  ],
  activity: [
    {
      title: "Ethiopian Yirgacheffe",
      location: "Downtown Roastery",
      timeLabel: "Today, 9:42 AM",
      status: "REDEEMED",
      imageUrl:
        "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=400&q=60",
    },
    {
      title: "Cold Brew Reserve",
      location: "The Pier House",
      timeLabel: "Oct 12, 2:15 PM",
      status: "REDEEMED",
      imageUrl:
        "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=400&q=60",
    },
    {
      title: "Guatemalan Antigua",
      location: "The Quiet Corner",
      timeLabel: "Oct 10, 8:05 AM",
      status: "REDEEMED",
      imageUrl:
        "https://images.unsplash.com/photo-1494314671902-399b18174975?auto=format&fit=crop&w=400&q=60",
    },
  ],
  businessInformation: {
    about:
      "Steep & Sip is a specialty coffee house serving precision-brewed single-origin pour-overs and fresh-baked pastries across three neighbourhood locations.",
    supportEmail: "hello@steepandsip.example",
    supportPhone: "+1 (416) 555-0182",
    website: "https://steepandsip.example",
  },
  businessPreferences: {
    notifications: true,
    marketingEmails: false,
    favoriteRoast: "Ethiopian",
  },
  referral: {
    headline: "Share the pour, earn a cup",
    description: "Invite a friend to become an Artisan Member and you both earn a free pour-over.",
    rewardLabel: "1 free pour-over each",
    code: "SIPWITHME",
  },
};
