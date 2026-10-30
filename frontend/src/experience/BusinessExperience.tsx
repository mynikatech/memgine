import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  AccessibilityInfo,
  AppState,
  Easing,
  Image,
  Pressable,
  ScrollView,
  View,
  Linking,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  RedemptionProductPicker,
  type RedemptionItemChoice,
  type RedemptionProductSelectionState,
} from "@/src/ui/domain/RedemptionProductPicker";
import { getSubscriptionPeriodLabel } from "@/src/core/domain/membership-helpers";
import { resolveCustomerBranding } from "@/src/core/customer/resolve-customer-branding";
import { DecorativeThemeFrame } from "@/src/ui/domain/DecorativeThemeFrame";
import {
  DecorativeContentThemeScope,
  overlayContentTheme,
} from "@/src/ui/domain/DecorativeContentTheme";
import type {
  CardStyle,
  TemplateDefinition,
} from "@/src/core/template/template-definition";

import type {
  Benefit,
  BenefitUsageRule,
  CustomerExperienceDefinition,
  MembershipProduct,
  Offer,
  OfferUsageRule,
  Organization,
  OrganizationDetails,
  OrganizationBranding,
  Redemption,
  ReferralProgram,
  Store,
  Status,
  Subscription,
  TemplateDefaultContent,
} from "@/src/core";

import { services } from "@/src/core";
import { trackActivity } from "@/src/core/services/activity-audit";
import { resolveAssetUrl } from "@/src/data/api/asset-url";
import type { CustomerRedemptionItemStatus } from "@/src/data/api/customer-data-api";
import {
  BusinessThemeScope,
  useBusiness,
  useTranslation,
} from "@/src/providers";
import { buildTheme } from "@/src/theme/theme";
import {
  readableForeground,
  readableForegroundOnSurface,
} from "@/src/theme/color-utils";
import { Badge, BrandLogo, Button, Card, Modal, Section, Text } from "@/src/ui";

import {
  ActivityItem,
  benefitIconForType,
  BenefitItem,
  MembershipCard,
  OfferCard,
  QrPlaceholder,
} from "@/src/ui/domain";

import { ExperienceTabKey, resolveExperience } from "./resolve-experience";

/** Shared, configuration-driven announcement used by both Preview and Customer. */
function BrandingAnnouncement({
  message,
  style,
  background,
  foreground,
  link,
  paddingHorizontal,
  paddingVertical,
}: {
  message: string;
  style: "STATIC" | "FADE" | "SLIDE" | "TICKER";
  background: string;
  foreground: string;
  link: string | null;
  paddingHorizontal: number;
  paddingVertical: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(false);
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState === "active",
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const [messageWidth, setMessageWidth] = useState(0);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppIsActive(nextState === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const shouldAnimate = style !== "STATIC" && !reducedMotion && appIsActive;
    if (!shouldAnimate) {
      // FADE and SLIDE animate toward one. When animation is intentionally
      // skipped, pin them at that final readable state instead of leaving the
      // message transparent or offset.
      progress.setValue(style === "FADE" || style === "SLIDE" ? 1 : 0);
      return;
    }

    progress.setValue(0);
    const animation =
      style === "TICKER"
        ? messageWidth > containerWidth && containerWidth > 0
          ? Animated.loop(
              Animated.sequence([
                Animated.delay(450),
                Animated.timing(progress, {
                  toValue: 1,
                  duration: Math.max(5000, messageWidth * 18),
                  easing: Easing.linear,
                  useNativeDriver: true,
                }),
                Animated.delay(150),
                Animated.timing(progress, {
                  toValue: 0,
                  duration: 0,
                  useNativeDriver: true,
                }),
              ]),
            )
          : null
        : Animated.timing(progress, {
            toValue: 1,
            duration: style === "FADE" ? 360 : 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          });
    if (!animation) return;
    animation.start();
    return () => animation.stop();
  }, [
    appIsActive,
    containerWidth,
    link,
    message,
    messageWidth,
    progress,
    reducedMotion,
    style,
  ]);

  const animationStyle =
    style === "FADE"
      ? {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
          }),
        }
      : style === "SLIDE"
        ? {
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-24, 0],
                }),
              },
            ],
          }
        : style === "TICKER"
          ? {
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -(messageWidth + 24)],
                  }),
                },
              ],
            }
          : undefined;
  return (
    <Pressable
      disabled={!link}
      accessibilityRole={link ? "link" : "text"}
      accessibilityLabel={message}
      onPress={() => {
        if (link) void Linking.openURL(link);
      }}
      style={{
        backgroundColor: background,
        paddingHorizontal,
        paddingVertical: Math.max(paddingVertical, 14),
        overflow: "hidden",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: foreground,
      }}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      {style === "TICKER" ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: -10000, top: -10000 }}
        >
          <Text
            variant="bodySmall"
            numberOfLines={1}
            onLayout={(event) =>
              setMessageWidth(event.nativeEvent.layout.width)
            }
          >
            {message}
            {link ? "  ·  Learn more ↗" : ""}
          </Text>
        </View>
      ) : null}
      <Animated.View
        style={[
          animationStyle,
          style === "TICKER" ? { alignSelf: "flex-start" } : undefined,
        ]}
      >
        <Text
          variant="bodySmall"
          numberOfLines={style === "TICKER" ? 1 : undefined}
          style={{ color: foreground, flexShrink: 0 }}
          onLayout={
            style === "TICKER"
              ? undefined
              : (event) => setMessageWidth(event.nativeEvent.layout.width)
          }
        >
          {message}
          {link ? "  ·  Learn more ↗" : ""}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function formatPhoneNumber(
  phone?: OrganizationDetails["supportPhone"],
): string {
  if (!phone) return "";
  return [phone.callingCode, phone.number].filter(Boolean).join(" ").trim();
}

function parseCanonicalUtcTimestamp(value: string): Date {
  let normalized = value.trim().replace(" ", "T");

  // PostgreSQL timestamptz::text may return offsets such as +00 or -05.
  if (/[+-]\d{2}$/.test(normalized)) {
    normalized = `${normalized}:00`;
  } else if (/[+-]\d{4}$/.test(normalized)) {
    normalized = normalized.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  } else if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) {
    normalized = `${normalized}Z`;
  }

  return new Date(normalized);
}

function formatBusinessExpiry(
  value: string,
  timeZone: string,
  locale: string,
): string {
  const instant = parseCanonicalUtcTimestamp(value);
  if (Number.isNaN(instant.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(instant);
  } catch {
    return "—";
  }
}

/**
 * Customer-facing sections which can be independently previewed by Org Admin.
 */
export type CustomerExperiencePreviewSection =
  | "membership"
  | "benefits"
  | "offers"
  | "stores"
  | "activity"
  | "business-information"
  | "business-preferences"
  | "referral"
  | "profile";

export type ExperienceRenderMode =
  | "customer"
  | "current-preview"
  | "proposed-preview";

type Props = {
  content: TemplateDefaultContent;

  subscription?: Subscription;
  subscriptionStatus?: Status;
  product?: MembershipProduct;

  benefits: Benefit[];
  offers: Offer[];
  membershipPurchaseOffers?: {
    offerId: string;
    displayName: string;
    applicableMembershipProductIds: string[];
  }[];
  stores: Store[];
  redemptions: Redemption[];
  benefitUsageRules?: BenefitUsageRule[];
  offerUsageRules?: OfferUsageRule[];
  redemptionItemStatuses?: CustomerRedemptionItemStatus[];

  memberships: {
    subscription: Subscription;
    product: MembershipProduct;
  }[];

  selectedSubscriptionId: string;
  onSelectSubscription: (subscriptionId: string) => void;
  /**
   * Displays a historical subscription in read-only mode.
   * No redemption or membership entitlement actions are exposed.
   */

  availableMemberships: MembershipProduct[];

  onJoin: (productId: string) => void;
  onUseMembershipPurchaseOffer?: (
    offerId: string,
    displayName: string,
    productId: string,
  ) => void;
  onExit: () => void;

  /**
   * Customer Experience definition used for preview.
   *
   * When omitted, the actual active BusinessConfiguration is used.
   */
  previewDefinition?: CustomerExperienceDefinition;

  /**
   * Optional organization override.
   *
   * Used by admin Current/Proposed preview so the same customer renderer
   * can render either the persisted organization or the proposed draft.
   */
  organizationOverride?: Organization;

  previewProductStoreIds?: Record<string, string[]>;

  /**
   * Optional organization-details override.
   */
  detailsOverride?: OrganizationDetails | null;

  /**
   * Organization branding belonging to the exact customer state being
   * rendered.
   *
   * Current Preview receives the branding frozen in the published release.
   * Proposed Preview receives the branding captured in the proposed snapshot.
   *
   * When supplied this is authoritative for customer brand assets/colours.
   */
  brandingOverride?: OrganizationBranding | null;

  initialTab?: ExperienceTabKey;

  activeTab?: ExperienceTabKey;
  onTabChange?: (tab: ExperienceTabKey) => void;

  /**
   * Explicitly identifies the rendering source.
   *
   * customer         = published/live business state + real customer data
   * current-preview  = published/live business state + preview data
   * proposed-preview = draft/proposed business state + preview data
   */
  renderMode?: ExperienceRenderMode;

  /**
   * Published/proposed referral program supplied by the release snapshot.
   * When supplied, BusinessExperience must not replace it with mutable
   * organization-level referral configuration.
   */
  referralProgramOverride?: ReferralProgram | null;

  hideTabBar?: boolean;

  onPreviewTab?: (tab: ExperienceTabKey) => void;

  /**
   * When specified, only this customer-facing section is rendered.
   */
  previewSection?: CustomerExperiencePreviewSection;

  /**
   * Canonical logo for the currently selected membership's business.
   *
   * The landing wallet resolves this from the subscription's
   * OrganizationUser -> OrganizationBranding relationship and passes it
   * through so the same MembershipCard renders the same business identity
   * inside the Business Experience.
   */
  membershipLogoUrl?: string;

  /** Organization-specific customer-facing tagline. */
  tagline?: string;

  /** Organization-specific customer hero image. */
  heroImageUrl?: string;
  /** Resolved by the customer self-service route; replaces local identity lookup. */
  customerUserId?: string;

  /** Published public inputs used by customer discovery without changing workspace context. */
  configurationOverride?: import("@/src/core").BusinessConfiguration;
  templateOverride?: TemplateDefinition;
  onRefreshRedemptionState?: () => Promise<void> | void;
};

export function BusinessExperience({
  content,
  previewProductStoreIds,
  subscription,
  subscriptionStatus,
  product,
  benefits,
  offers,
  membershipPurchaseOffers = [],
  stores,
  redemptions,
  benefitUsageRules,
  offerUsageRules,
  redemptionItemStatuses = [],
  memberships,
  selectedSubscriptionId,
  onSelectSubscription,
  availableMemberships,
  onJoin,
  onUseMembershipPurchaseOffer,
  onExit,
  previewDefinition,
  organizationOverride,
  detailsOverride,
  brandingOverride,
  initialTab = "card",
  activeTab,
  onTabChange,
  renderMode = "customer",
  referralProgramOverride,
  hideTabBar = false,
  onPreviewTab,
  previewSection,
  membershipLogoUrl,
  tagline,
  heroImageUrl,
  customerUserId,
  configurationOverride,
  templateOverride,
  onRefreshRedemptionState,
}: Props) {
  const isPreviewMode = renderMode !== "customer";
  // Reference-data status code determines entitlement; the display label
  // remains sourced from subscriptionStatus.statusName.
  const isHistoricalSubscription =
    !isPreviewMode &&
    Boolean(subscription) &&
    subscriptionStatus?.statusCode?.toUpperCase() !== "ACTIVE";

  const {
    organization: contextOrganization,
    configuration: contextConfiguration,
    template: contextTemplate,
  } = useBusiness();
  const { width } = useWindowDimensions();
  const isMobileLayout = Platform.OS !== "web" || width < 600;
  const configuration = configurationOverride ?? contextConfiguration;
  const template = templateOverride ?? contextTemplate;

  const { t, formatDate, formatMoney } = useTranslation();
  const insets = useSafeAreaInsets();

  /**
   * The actual customer renderer can receive a proposed organization/details
   * while leaving the rest of the application context untouched.
   */
  const organization = organizationOverride ?? contextOrganization;

  /**
   * BusinessExperience's customer-facing business information is ultimately
   * resolved by resolveExperience().
   *
   * The details override is therefore supplied through the configuration
   * object used by the resolver where the resolver supports it.
   */
  const definitionResolvedBranding = useMemo(
    () =>
      resolveCustomerBranding({
        organization,
        configuration,
        previewDefinition,
      }),
    [organization, configuration, previewDefinition],
  );

  /*
   * OrganizationBranding is the authoritative customer-facing brand source.
   *
   * In preview mode brandingOverride belongs to the exact release state:
   *
   *   Current  -> published release OrganizationBranding
   *   Proposed -> proposed snapshot OrganizationBranding
   *
   * CustomerExperienceDefinition can still supply presentation/content
   * configuration, but it must not replace persisted organization brand
   * colours when OrganizationBranding is available.
   */
  // Restoration phase: original three-colour presentation is the default.
  // Enhanced mode will be opt-in after separate visual validation.
  const enhancedVisualsEnabled = false;

  const resolvedBranding = useMemo(
    () => ({
      ...definitionResolvedBranding,

      logoUrl: brandingOverride?.logoUrl ?? definitionResolvedBranding.logoUrl,

      darkThemeLogoUrl:
        brandingOverride?.darkThemeLogoUrl ??
        definitionResolvedBranding.darkThemeLogoUrl,

      faviconUrl:
        brandingOverride?.faviconUrl ?? definitionResolvedBranding.faviconUrl,

      splashScreenImageUrl:
        brandingOverride?.splashScreenImageUrl ??
        definitionResolvedBranding.splashScreenImageUrl,

      primaryColor:
        brandingOverride?.primaryColor ??
        definitionResolvedBranding.primaryColor,

      secondaryColor:
        brandingOverride?.secondaryColor ??
        definitionResolvedBranding.secondaryColor,

      accentColor:
        brandingOverride?.accentColor ?? definitionResolvedBranding.accentColor,
      backgroundColor: brandingOverride?.backgroundColor,
      textColor: brandingOverride?.textColor,
      backgroundImageUrl: enhancedVisualsEnabled
        ? brandingOverride?.backgroundImageUrl
        : undefined,
      decoration: enhancedVisualsEnabled
        ? brandingOverride?.decoration
        : undefined,
      announcementEnabled: enhancedVisualsEnabled
        ? brandingOverride?.announcementEnabled
        : undefined,
      announcementMessage: enhancedVisualsEnabled
        ? brandingOverride?.announcementMessage
        : undefined,
      announcementStyle: enhancedVisualsEnabled
        ? brandingOverride?.announcementStyle
        : undefined,
      announcementBackgroundColor: enhancedVisualsEnabled
        ? brandingOverride?.announcementBackgroundColor
        : undefined,
      announcementTextColor: enhancedVisualsEnabled
        ? brandingOverride?.announcementTextColor
        : undefined,
      announcementLinkUrl: enhancedVisualsEnabled
        ? brandingOverride?.announcementLinkUrl
        : undefined,
      announcementStartsAt: enhancedVisualsEnabled
        ? brandingOverride?.announcementStartsAt
        : undefined,
      announcementEndsAt: enhancedVisualsEnabled
        ? brandingOverride?.announcementEndsAt
        : undefined,
    }),
    [definitionResolvedBranding, brandingOverride],
  );

  const resolvedConfiguration = useMemo(
    () => ({
      ...configuration,

      identity: {
        ...configuration.identity,
        displayName: resolvedBranding.displayName,
      },
      branding: {
        ...configuration.branding,
        logoUrl:
          resolvedBranding.logoUrl ?? configuration.branding.logoUrl ?? "",
        darkThemeLogoUrl:
          resolvedBranding.darkThemeLogoUrl ??
          configuration.branding.darkThemeLogoUrl,
        faviconUrl:
          resolvedBranding.faviconUrl ?? configuration.branding.faviconUrl,
        splashScreenImageUrl:
          resolvedBranding.splashScreenImageUrl ??
          configuration.branding.splashScreenImageUrl,
        primaryColor:
          resolvedBranding.primaryColor ?? configuration.branding.primaryColor,
        secondaryColor:
          resolvedBranding.secondaryColor ??
          configuration.branding.secondaryColor,
        accentColor:
          resolvedBranding.accentColor ?? configuration.branding.accentColor,
      },
      customerExperience: {
        ...configuration.customerExperience,

        cardStyle:
          previewDefinition?.membership.cardStyle ??
          configuration.customerExperience.cardStyle,

        showOffers:
          previewDefinition?.sections.offers ??
          configuration.customerExperience.showOffers,

        showStores:
          previewDefinition?.sections.stores ??
          configuration.customerExperience.showStores,

        showActivity:
          previewDefinition?.sections.activity ??
          configuration.customerExperience.showActivity,
      },
    }),
    [configuration, resolvedBranding, previewDefinition, tagline],
  );

  /*
   * BusinessExperience and all nested customer components must consume the
   * same resolved brand theme.
   *
   * Previously the renderer could resolve one branding configuration while
   * MembershipCard / BenefitItem / OfferCard still consumed the outer provider
   * theme. That allowed stale/default teal branding to leak into Preview.
   */
  // Stage 1: keep all Classic card and semantic tokens unchanged.
  // Only the page canvas and text sitting directly on it may use V2 colours.
  const theme = useMemo(
    () => buildTheme(resolvedConfiguration.branding),
    [resolvedConfiguration.branding],
  );
  const validHex = (value: string | null | undefined): value is string =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  const customerBackground = validHex(resolvedBranding.backgroundColor)
    ? resolvedBranding.backgroundColor
    : theme.colors.background;
  const requestedPageText = validHex(resolvedBranding.textColor)
    ? resolvedBranding.textColor
    : theme.colors.text;
  const pageTextColor = readableForegroundOnSurface(
    customerBackground,
    requestedPageText,
  );
  // The theme supplied to cards remains Classic. In particular, do not map
  // backgroundColor to colors.card/surface or textColor to colors.text.
  const customerTheme = theme;
  const hasDecorativeImageOverlay = false;
  const overlayCardTheme = customerTheme;
  const announcement = useMemo(() => {
    if (
      !resolvedBranding.announcementEnabled ||
      !resolvedBranding.announcementMessage?.trim()
    )
      return null;
    const current = Date.now();
    const starts = resolvedBranding.announcementStartsAt
      ? Date.parse(resolvedBranding.announcementStartsAt)
      : null;
    const ends = resolvedBranding.announcementEndsAt
      ? Date.parse(resolvedBranding.announcementEndsAt)
      : null;
    if (
      (starts !== null && (!Number.isFinite(starts) || current < starts)) ||
      (ends !== null && (!Number.isFinite(ends) || current > ends))
    )
      return null;
    const background = validHex(resolvedBranding.announcementBackgroundColor)
      ? resolvedBranding.announcementBackgroundColor
      : theme.colors.accent;
    const foreground = validHex(resolvedBranding.announcementTextColor)
      ? resolvedBranding.announcementTextColor
      : readableForeground(background);
    const link = resolvedBranding.announcementLinkUrl?.trim();
    return {
      message: resolvedBranding.announcementMessage.trim(),
      style: resolvedBranding.announcementStyle ?? "STATIC",
      background,
      foreground,
      link: link && /^https:\/\//i.test(link) ? link : null,
    };
  }, [resolvedBranding, theme.colors.accent]);
  const ProfileThemeCard = ({
    children,
    testID,
  }: {
    children: ReactNode;
    testID?: string;
  }) => (
    <DecorativeThemeFrame
      imageUrl={resolvedBranding.decoration?.cardBackgroundImageUrl ?? null}
      primaryColor={theme.colors.primary}
      accentColor={theme.colors.accent}
      backgroundColor={customerBackground}
      decoration={resolvedBranding.decoration}
    >
      <DecorativeContentThemeScope enabled={hasDecorativeImageOverlay}>
        <Card
          padding="lg"
          testID={testID}
          style={
            hasDecorativeImageOverlay
              ? { backgroundColor: "rgba(255,255,255,0.92)" }
              : undefined
          }
        >
          {children}
        </Card>
      </DecorativeContentThemeScope>
    </DecorativeThemeFrame>
  );

  const resolvedContent = previewDefinition?.content ?? content;

  const [tab, setTab] = useState<ExperienceTabKey>(initialTab);
  const [referralOpen, setReferralOpen] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const effectiveTab = activeTab ?? tab;

  /* ------------------------------------------------------------------ */
  /* Persisted customer profile data                                   */
  /* ------------------------------------------------------------------ */

  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileOrganizationDetails, setProfileOrganizationDetails] =
    useState<OrganizationDetails | null>(detailsOverride ?? null);
  const [profileOrganizationWebsite, setProfileOrganizationWebsite] =
    useState<string>(organization.website ?? "");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [marketingEmailsEnabled, setMarketingEmailsEnabled] = useState(false);
  const [referralProgram, setReferralProgram] =
    useState<ReferralProgram | null>(null);
  const [referralSharePayload, setReferralSharePayload] = useState<{
    referralId: string;
    referralCode: string;
    message: string;
  } | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [savingPreference, setSavingPreference] = useState<
    "NOTIFICATIONS" | "MARKETING_EMAILS" | null
  >(null);
  const [customerActionError, setCustomerActionError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    const loadProfileData = async () => {
      if (!subscription || isPreviewMode) {
        if (!cancelled) {
          setProfileUserId(null);
          setReferralProgram(null);
          setNotificationsEnabled(true);
          setMarketingEmailsEnabled(false);
          setProfileOrganizationDetails(detailsOverride ?? null);
          setProfileOrganizationWebsite(organization.website ?? "");
        }
        return;
      }

      if (customerUserId) {
        try {
          const [
            details,
            persistedOrganization,
            notifications,
            marketingEmails,
          ] = await Promise.all([
            detailsOverride === undefined
              ? services.organization.getOrganizationDetails(organization.id)
              : Promise.resolve(detailsOverride),
            organizationOverride === undefined
              ? services.organization.getOrganization(organization.id)
              : Promise.resolve(organizationOverride),
            services.customerData.preference(
              organization.id,
              customerUserId,
              "NOTIFICATIONS",
            ),
            services.customerData.preference(
              organization.id,
              customerUserId,
              "MARKETING_EMAILS",
            ),
          ]);
          if (cancelled) return;
          setProfileUserId(customerUserId);
          setProfileOrganizationDetails(details ?? null);
          setProfileOrganizationWebsite(
            persistedOrganization?.website ?? organization.website ?? "",
          );
          setNotificationsEnabled(
            notifications == null ? true : notifications === "true",
          );
          setMarketingEmailsEnabled(marketingEmails === "true");
          setReferralProgram(null);
          setCustomerActionError(null);
        } catch (error) {
          if (!cancelled)
            setCustomerActionError(
              error instanceof Error
                ? error.message
                : "Unable to load preferences.",
            );
        }
        return;
      }

      try {
        const [organizationUser, persistedOrganization] = await Promise.all([
          services.organization.getOrganizationUser(
            subscription.organizationUserId,
          ),
          services.organization.getOrganization(organization.id),
        ]);

        // A supplied release snapshot is authoritative for business details.
        // Only read mutable persisted details for legacy callers that do not
        // supply an override.
        const persistedDetails =
          detailsOverride === undefined
            ? await services.organization.getOrganizationDetails(
                organization.id,
              )
            : null;

        let resolvedOrganizationUser = organizationUser;

        if (!resolvedOrganizationUser) {
          const organizationUsers =
            await services.organization.listOrganizationUsers(organization.id);
          resolvedOrganizationUser =
            organizationUsers.find(
              (organizationUser) =>
                organizationUser.id === subscription.organizationUserId,
            ) ?? null;
        }

        const userId = resolvedOrganizationUser?.userId ?? null;

        if (cancelled) return;

        setProfileUserId(userId);
        setProfileOrganizationDetails(
          detailsOverride !== undefined ? detailsOverride : persistedDetails,
        );
        setProfileOrganizationWebsite(
          persistedOrganization?.website ?? organization.website ?? "",
        );

        if (!userId) {
          setReferralProgram(null);
          setNotificationsEnabled(true);
          setMarketingEmailsEnabled(false);
          return;
        }

        const [notifications, marketingEmails, program] = await Promise.all([
          services.customerPreference.getValue(userId, "NOTIFICATIONS"),
          services.customerPreference.getValue(userId, "MARKETING_EMAILS"),
          referralProgramOverride !== undefined
            ? Promise.resolve(referralProgramOverride)
            : services.referral.getProgram(organization.id),
        ]);

        if (cancelled) return;

        setNotificationsEnabled(
          notifications == null ? true : notifications.toLowerCase() === "true",
        );
        setMarketingEmailsEnabled(
          marketingEmails == null
            ? false
            : marketingEmails.toLowerCase() === "true",
        );
        setReferralProgram(program);
      } catch {
        if (!cancelled) {
          setProfileUserId(null);
          setReferralProgram(null);
          setNotificationsEnabled(true);
          setMarketingEmailsEnabled(false);
          setProfileOrganizationDetails(detailsOverride ?? null);
          setProfileOrganizationWebsite(organization.website ?? "");
        }
      }
    };

    void loadProfileData();

    return () => {
      cancelled = true;
    };
  }, [
    subscription,
    isPreviewMode,
    organization.id,
    detailsOverride,
    organization.website,
    customerUserId,
  ]);

  const handlePreferenceToggle = async (
    preferenceTypeCode: "NOTIFICATIONS" | "MARKETING_EMAILS",
  ) => {
    if (savingPreference) return;

    let userId = customerUserId ?? profileUserId;

    if (!userId && subscription && !customerUserId) {
      const organizationUser =
        (await services.organization.getOrganizationUser(
          subscription.organizationUserId,
        )) ?? null;

      if (organizationUser) {
        userId = organizationUser.userId;
      } else {
        const organizationUsers =
          await services.organization.listOrganizationUsers(organization.id);
        userId =
          organizationUsers.find(
            (item) => item.id === subscription.organizationUserId,
          )?.userId ?? null;
      }
    }

    if (!userId) return;

    const previousValue =
      preferenceTypeCode === "NOTIFICATIONS"
        ? notificationsEnabled
        : marketingEmailsEnabled;
    const nextValue = !previousValue;

    if (preferenceTypeCode === "NOTIFICATIONS") {
      setNotificationsEnabled(nextValue);
    } else {
      setMarketingEmailsEnabled(nextValue);
    }

    setSavingPreference(preferenceTypeCode);

    try {
      if (customerUserId)
        await services.customerData.setPreference(
          organization.id,
          customerUserId,
          preferenceTypeCode,
          String(nextValue),
        );
      else
        await services.customerPreference.setValue(
          userId,
          preferenceTypeCode,
          String(nextValue),
        );
      setCustomerActionError(null);
    } catch (error) {
      setCustomerActionError(
        error instanceof Error ? error.message : "Unable to save preference.",
      );
      if (preferenceTypeCode === "NOTIFICATIONS") {
        setNotificationsEnabled(previousValue);
      } else {
        setMarketingEmailsEnabled(previousValue);
      }
    } finally {
      setSavingPreference(null);
    }
  };

  const handleReferralPress = async () => {
    if (!profileUserId || !referralProgram) return;

    setReferralLoading(true);

    try {
      const payload = await services.referralEngine.createSharePayload(
        organization.id,
        profileUserId,
        {
          businessName: organization.displayName ?? organization.name,
        },
      );

      setReferralSharePayload(payload);
      setReferralOpen(true);
    } finally {
      setReferralLoading(false);
    }
  };

  const handleTabChange = (nextTab: ExperienceTabKey) => {
    if (activeTab === undefined) {
      setTab(nextTab);
    }

    onTabChange?.(nextTab);
  };

  const membershipPurchaseOfferIds = useMemo(
    () => new Set(membershipPurchaseOffers.map((offer) => offer.offerId)),
    [membershipPurchaseOffers],
  );
  const regularOffers = useMemo(
    () => offers.filter((offer) => !membershipPurchaseOfferIds.has(offer.id)),
    [membershipPurchaseOfferIds, offers],
  );

  const exp = useMemo(
    () =>
      resolveExperience({
        organization,
        configuration: resolvedConfiguration,
        template,
        content: resolvedContent,
        subscription,
        subscriptionStatus,
        product,
        benefits,
        offers: regularOffers,
        stores,
        redemptions,
        formatDate,
        detailsOverride,
        benefitPresentationMode:
          previewSection === "benefits" ? "organization" : "membership",
      }),
    [
      organization,
      resolvedConfiguration,
      template,
      resolvedContent,
      subscription,
      subscriptionStatus,
      product,
      benefits,
      regularOffers,
      stores,
      redemptions,
      formatDate,
      detailsOverride,
      previewSection,
    ],
  );

  const cardStyle: CardStyle =
    previewDefinition?.membership.cardStyle ??
    configuration.customerExperience.cardStyle;

  /* ------------------------------------------------------------------ */
  /* Redemption                                                         */
  /* ------------------------------------------------------------------ */

  type PendingRedemption = {
    transactionId: string;
    transactionNumber: string;
    status: "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" | "CANCELLED";
    expiresAt?: string | null;
    qrReference: string;
    benefitIds: string[];
    offerIds: string[];
  };
  const [selectedBenefitIds, setSelectedBenefitIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(
    new Set(),
  );
  const [pendingRedemption, setPendingRedemption] =
    useState<PendingRedemption | null>(null);
  const [redemptionLoading, setRedemptionLoading] = useState(false);

  type MembershipPurchaseOfferQr = {
    qrReference: string;
    offerId: string;
    displayName: string;
    expiresAt: string;
    productId: string;
  };
  const [membershipOfferQr, setMembershipOfferQr] =
    useState<MembershipPurchaseOfferQr | null>(null);
  const [
    membershipOfferQrLoadingProductId,
    setMembershipOfferQrLoadingProductId,
  ] = useState<string | null>(null);
  useEffect(() => {
    setSelectedBenefitIds(new Set());
    setSelectedOfferIds(new Set());
    setPendingRedemption(null);
  }, [selectedSubscriptionId]);
  const toggleBenefit = (id: string) =>
    setSelectedBenefitIds((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleOffer = (id: string) =>
    setSelectedOfferIds((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const redemptionStatusByItem = useMemo(
    () =>
      new Map(
        redemptionItemStatuses.map((item) => [
          `${item.itemType}:${item.itemId}`,
          item,
        ]),
      ),
    [redemptionItemStatuses],
  );
  const statusFor = (
    itemType: "BENEFIT" | "OFFER",
    itemId: string,
    previewAvailable = true,
  ): CustomerRedemptionItemStatus =>
    redemptionStatusByItem.get(`${itemType}:${itemId}`) ?? {
      itemId,
      itemType,
      status: isPreviewMode && previewAvailable ? "AVAILABLE" : "INACTIVE",
      displayReason: isPreviewMode && previewAvailable ? null : "Unavailable",
    };
  // Store availability is informational. Customer QR generation never requires a Store.
  const [benefitStoreIds, setBenefitStoreIds] = useState<
    Record<string, string[]>
  >({});
  const [benefitAvailabilityLoaded, setBenefitAvailabilityLoaded] =
    useState(false);
  const storeNamesById = useMemo(
    () => Object.fromEntries(stores.map((store) => [store.id, store.name])),
    [stores],
  );
  const availabilityBenefitIds = benefits
    .map((benefit) => benefit.id)
    .sort()
    .join("|");
  useEffect(() => {
    if (isPreviewMode || !subscription || isHistoricalSubscription) {
      setBenefitStoreIds({});
      setBenefitAvailabilityLoaded(false);
      return;
    }
    let active = true;
    setBenefitAvailabilityLoaded(false);
    const targets = benefits.filter((benefit) => benefit.products?.length);
    void Promise.all(
      targets.map(async (benefit) => {
        try {
          const choices = await services.customerData.redemptionProductChoices(
            organization.id,
            subscription.id,
            "BENEFIT",
            benefit.id,
          );
          return [benefit.id, choices] as const;
        } catch {
          return [benefit.id, []] as const;
        }
      }),
    ).then((results) => {
      if (!active) return;
      const available: Record<string, string[]> = {};
      for (const [benefitId, choices] of results) {
        for (const choice of choices) {
          const key = `${benefitId}:${choice.productId}`;
          available[key] = choice.availableStoreIds ?? [];
        }
      }
      setBenefitStoreIds(available);
      setBenefitAvailabilityLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [
    organization.id,
    subscription?.id,
    availabilityBenefitIds,
    isPreviewMode,
    isHistoricalSubscription,
  ]);

  // Offers share the same verified customer product-mapping API as Benefits.
  const [offerStoreIds, setOfferStoreIds] = useState<Record<string, string[]>>(
    {},
  );
  const availabilityOfferIds = regularOffers
    .map((offer) => offer.id)
    .sort()
    .join("|");
  useEffect(() => {
    if (isPreviewMode || !subscription || isHistoricalSubscription) {
      setOfferStoreIds({});
      return;
    }
    let active = true;
    setOfferStoreIds({});
    const targets = regularOffers.filter((offer) => offer.products?.length);
    void Promise.all(
      targets.map(async (offer) => {
        try {
          const choices = await services.customerData.redemptionProductChoices(
            organization.id,
            subscription.id,
            "OFFER",
            offer.id,
          );
          return [offer.id, choices] as const;
        } catch {
          return [offer.id, []] as const;
        }
      }),
    ).then((results) => {
      if (!active) return;
      const available: Record<string, string[]> = {};
      for (const [offerId, choices] of results) {
        for (const choice of choices) {
          available[`${offerId}:${choice.productId}`] =
            choice.availableStoreIds ?? [];
        }
      }
      setOfferStoreIds(available);
    });
    return () => {
      active = false;
    };
  }, [
    organization.id,
    subscription?.id,
    availabilityOfferIds,
    isPreviewMode,
    isHistoricalSubscription,
  ]);

  const offerProductAvailability = (
    offerId: string,
    productId: string,
  ): string => {
    const ids = isPreviewMode
      ? previewProductStoreIds?.[productId]
      : offerStoreIds[`${offerId}:${productId}`];
    const names = [
      ...new Set(
        (ids ?? [])
          .map((id) => storeNamesById[id])
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    return names.length
      ? `Available at: ${names.join(", ")}`
      : "Please check with the store for availability.";
  };

  const offerAvailabilityText = (offer: Offer): string => {
    if (!offer.products?.length) return offer.availabilityText ?? "";
    const details = offer.products.map(
      (eligible) =>
        `${eligible.productName || eligible.productCode} — ${offerProductAvailability(offer.id, eligible.productId)}`,
    );
    return [offer.availabilityText, ...details].filter(Boolean).join("\n");
  };

  const benefitProductAvailability = (benefitId: string, productId: string) => {
    const ids: string[] | undefined = isPreviewMode
      ? previewProductStoreIds?.[productId]
      : benefitStoreIds[`${benefitId}:${productId}`];

    if (ids === undefined) {
      return "Please check with the store for availability.";
    }

    const benefit = benefits.find((item) => item.id === benefitId);

    const permittedIds =
      benefit?.storeAvailability?.mode === "SELECTED_STORES"
        ? new Set(benefit.storeAvailability.storeIds)
        : null;

    const names = [
      ...new Set(
        ids
          .filter((id) => !permittedIds || permittedIds.has(id))
          .map((id) => storeNamesById[id])
          .filter((name): name is string => Boolean(name)),
      ),
    ];

    return names.length > 0
      ? `Available at: ${names.join(", ")}`
      : "Please check with the store for availability.";
  };

  const benefitItems = exp.redeemableBenefits.map((benefit) => ({
    benefit,
    itemStatus: statusFor("BENEFIT", benefit.id, benefit.available),
  }));
  const redeemableOffers = exp.offers.filter((offer) => {
    if (!offer.membershipProductId) return true;
    return offer.membershipProductId === product?.id;
  });
  const offerItems = redeemableOffers.map((offer) => ({
    offer,
    itemStatus: statusFor("OFFER", offer.id),
  }));
  const selectableBenefits = benefitItems.filter(
    ({ itemStatus }) => itemStatus.status === "AVAILABLE",
  );
  const selectableOffers = offerItems.filter(
    ({ itemStatus }) => itemStatus.status === "AVAILABLE",
  );
  const redeemSectionBenefits = benefitItems.filter(
    ({ itemStatus }) =>
      itemStatus.status === "AVAILABLE" ||
      itemStatus.status === "LIMIT_REACHED",
  );
  const redeemSectionOffers = offerItems.filter(
    ({ itemStatus }) =>
      itemStatus.status === "AVAILABLE" ||
      itemStatus.status === "LIMIT_REACHED",
  );
  const offersTabItems = offerItems.filter(
    ({ itemStatus }) =>
      itemStatus.status !== "NOT_APPLICABLE" &&
      itemStatus.status !== "INACTIVE",
  );
  const selectableBenefitKey = selectableBenefits
    .map(({ benefit }) => benefit.id)
    .sort()
    .join("|");
  const selectableOfferKey = selectableOffers
    .map(({ offer }) => offer.id)
    .sort()
    .join("|");
  useEffect(() => {
    const allowedBenefitIds = new Set(
      selectableBenefits.map(({ benefit }) => benefit.id),
    );
    const allowedOfferIds = new Set(
      selectableOffers.map(({ offer }) => offer.id),
    );
    setSelectedBenefitIds(
      (previous) =>
        new Set([...previous].filter((id) => allowedBenefitIds.has(id))),
    );
    setSelectedOfferIds(
      (previous) =>
        new Set([...previous].filter((id) => allowedOfferIds.has(id))),
    );
  }, [selectableBenefitKey, selectableOfferKey]);

  const [productSelection, setProductSelection] =
    useState<RedemptionProductSelectionState>({
      selections: {},
      ready: false,
    });

  const selectedRedemptionProducts: RedemptionItemChoice[] = [
    ...selectableBenefits
      .filter(({ benefit }) => selectedBenefitIds.has(benefit.id))
      .map(({ benefit }) => ({
        itemType: "BENEFIT" as const,
        itemId: benefit.id,
        label: benefit.benefitName,
      })),
    ...selectableOffers
      .filter(({ offer }) => selectedOfferIds.has(offer.id))
      .map(({ offer }) => ({
        itemType: "OFFER" as const,
        itemId: offer.id,
        label: offer.offerName,
      })),
  ];
  const createRedemptionTransaction = async (
    scope: "ALL" | "OFFERS" = "ALL",
  ) => {
    if (
      !subscription ||
      isPreviewMode ||
      isHistoricalSubscription ||
      redemptionLoading
    ) {
      return;
    }

    const benefitIds =
      scope === "ALL"
        ? selectableBenefits
            .filter(({ benefit }) => selectedBenefitIds.has(benefit.id))
            .map(({ benefit }) => benefit.id)
        : [];
    const offerIds = selectableOffers
      .filter(({ offer }) => selectedOfferIds.has(offer.id))
      .map(({ offer }) => offer.id);
    if (!benefitIds.length && !offerIds.length) return;
    const keys = [
      ...benefitIds.map((id) => `BENEFIT:${id}`),
      ...offerIds.map((id) => `OFFER:${id}`),
    ];
    console.log("CUSTOMER REDEMPTION DEBUG", {
      scope,
      benefitIds,
      offerIds,
      keys,
      productSelection,
    });
    if (
      !productSelection.ready ||
      keys.some((key) => !productSelection.selections[key])
    ) {
      setCustomerActionError(
        "Select the product for each Benefit or Offer before generating a QR.",
      );
      return;
    }

    const productSelections = Object.fromEntries(
      keys.map((key) => [key, productSelection.selections[key]]),
    );

    setRedemptionLoading(true);
    setCustomerActionError(null);
    try {
      const pending = await services.customerData.createRedemptionTransaction(
        organization.id,
        {
          subscriptionId: subscription.id,
          benefitIds,
          offerIds,
          redemptionMethod: "CUSTOMER_QR",
          productSelections,
        },
      );
      const qr = await services.customerData.issueRedemptionTransactionQr(
        organization.id,
        pending.transactionId,
      );
      setPendingRedemption({
        ...pending,
        status: "PENDING",
        transactionNumber: qr.transactionNumber,
        expiresAt: qr.expiresAt,
        qrReference: qr.qrReference,
        benefitIds,
        offerIds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const knownSafe = [
        "no longer eligible",
        "not available today",
        "usage limit",
        "subscription is not active",
        "subscription is not available",
      ].some((fragment) => message.toLowerCase().includes(fragment));
      setCustomerActionError(
        knownSafe ? message : "Unable to create redemption. Please try again.",
      );
    } finally {
      setRedemptionLoading(false);
    }
  };

  useEffect(() => {
    if (
      isPreviewMode ||
      isHistoricalSubscription ||
      !subscription ||
      !pendingRedemption ||
      pendingRedemption.status !== "PENDING"
    ) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const current = await services.customerData.redemptionTransactionStatus(
          organization.id,
          pendingRedemption.transactionId,
        );
        if (cancelled || current.status === "PENDING") return;

        setPendingRedemption((previous) =>
          previous?.transactionId === current.transactionId
            ? {
                ...previous,
                status: current.status,
                expiresAt: current.expiresAt ?? previous.expiresAt,
              }
            : previous,
        );
        await onRefreshRedemptionState?.();
      } catch {
        // A transient status-read failure must not discard a still-valid QR.
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    isPreviewMode,
    isHistoricalSubscription,
    onRefreshRedemptionState,
    organization.id,
    pendingRedemption?.status,
    pendingRedemption?.transactionId,
    subscription,
  ]);

  const benefitTitleById = useMemo(
    () =>
      new Map(exp.benefits.map((b) => [b.id, b.displayName ?? b.benefitName])),
    [exp.benefits],
  );

  const selectedBenefitCount = selectableBenefits.filter(({ benefit }) =>
    selectedBenefitIds.has(benefit.id),
  ).length;
  const selectedOfferCount = selectableOffers.filter(({ offer }) =>
    selectedOfferIds.has(offer.id),
  ).length;
  const selectedCount = selectedBenefitCount + selectedOfferCount;
  const selectedSummary = [
    selectedBenefitCount
      ? `${selectedBenefitCount} Benefit${selectedBenefitCount === 1 ? "" : "s"}`
      : null,
    selectedOfferCount
      ? `${selectedOfferCount} Offer${selectedOfferCount === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(" + ");

  const hasRedeemable =
    selectableBenefits.length > 0 || selectableOffers.length > 0;
  const membershipOfferForProduct = (membershipProductId: string) => {
    const candidates = membershipPurchaseOffers.filter((offer) =>
      offer.applicableMembershipProductIds.includes(membershipProductId),
    );
    // A card is shown only when the server returned one unambiguous target.
    // Pricing remains exclusively resolved by the quote endpoint.
    return candidates.length === 1 ? candidates[0] : undefined;
  };

  const issueMembershipPurchaseOfferQr = async (
    offerId: string,
    productId: string,
  ) => {
    if (isPreviewMode || membershipOfferQrLoadingProductId) return;

    setMembershipOfferQrLoadingProductId(productId);
    setCustomerActionError(null);

    try {
      const qr = await services.customerData.issueMembershipPurchaseOfferQr(
        organization.id,
        offerId,
      );

      setMembershipOfferQr({
        ...qr,
        productId,
      });
    } catch (error) {
      setMembershipOfferQr(null);

      setCustomerActionError(
        error instanceof Error
          ? error.message
          : "Unable to generate Membership Offer QR.",
      );
    } finally {
      setMembershipOfferQrLoadingProductId(null);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Sub-renderers                                                      */
  /* ------------------------------------------------------------------ */

  const HeroImage = ({
    uri,
    height = 168,
  }: {
    uri?: string;
    height?: number;
  }) => {
    const resolvedUri = resolveAssetUrl(uri);

    return resolvedUri ? (
      <Image
        source={{ uri: resolvedUri }}
        resizeMode="cover"
        style={{
          width: "100%",
          height,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      />
    ) : null;
  };

  const renderPromotionCard = (
    promo: NonNullable<typeof exp.heroPromotion>,
  ) => (
    <Card padding="none" style={{ overflow: "hidden", borderRadius: 22 }}>
      <HeroImage uri={promo.imageUrl} />

      <View
        style={{
          padding: theme.spacing.xl,
          gap: theme.spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {promo.badge ? <Badge label={promo.badge} tone="brand" /> : <View />}

          {promo.expiryLabel ? (
            <Text variant="caption" color="textMuted">
              {promo.expiryLabel}
            </Text>
          ) : null}
        </View>

        <Text variant="h2" color="text">
          {promo.title}
        </Text>

        <Text variant="bodySmall" color="textSecondary">
          {promo.description}
        </Text>
      </View>
    </Card>
  );

  const renderTabPreviewLink = (tabKey: ExperienceTabKey) => {
    if (!isPreviewMode || !onPreviewTab || previewSection) {
      return null;
    }

    return (
      <Pressable
        onPress={() => onPreviewTab(tabKey)}
        accessibilityRole="link"
        hitSlop={6}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          paddingVertical: 2,
          opacity: pressed ? theme.states.pressedOpacity : 1,
        })}
      >
        <Text
          variant="bodySmall"
          color="primary"
          style={{ textDecorationLine: "underline", fontWeight: "600" }}
        >
          Preview
        </Text>
      </Pressable>
    );
  };

  /* ------------------------------------------------------------------ */
  /* Card                                                               */
  /* ------------------------------------------------------------------ */

  const CardTab = (
    <View style={{ gap: theme.spacing.lg }} testID="experience-tab-card">
      {renderTabPreviewLink("card")}

      {enhancedVisualsEnabled && heroImageUrl ? (
        <Card
          padding="none"
          style={{
            overflow: "hidden",
            borderRadius: 22,
          }}
        >
          <HeroImage uri={heroImageUrl} height={isMobileLayout ? 190 : 250} />

          <View
            style={{
              paddingHorizontal: theme.spacing.xl,
              paddingTop: theme.spacing.lg,
              paddingBottom: theme.spacing.xl,
              gap: theme.spacing.sm,
            }}
          >
            <Badge label="MEMBER PERKS" tone="brand" />

            <Text variant="h1" color="text">
              Something special is waiting
            </Text>

            <Text variant="body" color="textSecondary">
              {tagline?.trim() ||
                "Enjoy your member benefits and discover what is new for you."}
            </Text>

            {exp.membership ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing.sm,
                  marginTop: theme.spacing.xs,
                }}
              >
                <Ionicons
                  name="sparkles-outline"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text variant="caption" color="primary">
                  {exp.membership.tier} member benefits
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
      ) : exp.heroPromotion ? (
        renderPromotionCard(exp.heroPromotion)
      ) : null}

      {isHistoricalSubscription && subscription ? (
        <Section titleColor={pageTextColor} title="Previous Membership">
          <Card padding="lg" testID="experience-previous-membership">
            <View style={{ gap: theme.spacing.md }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: theme.spacing.sm,
                }}
              >
                <Text variant="bodyStrong" color="text">
                  {exp.membership?.tier ??
                    product?.displayName ??
                    product?.membershipProductName ??
                    "Membership"}
                </Text>
                <Badge
                  label={subscriptionStatus?.statusName ?? "Status unavailable"}
                  tone="neutral"
                />
              </View>
              <Text variant="bodySmall" color="textMuted">
                Originally valid until {formatDate(subscription.endDate)}
              </Text>
              <Text variant="bodySmall" color="textSecondary">
                This membership is no longer active. View its previous activity
                in the History tab.
              </Text>
              {product &&
              availableMemberships.some((item) => item.id === product.id) ? (
                <Button
                  label="Repurchase"
                  size="sm"
                  onPress={() => {
                    const purchaseOffer = membershipOfferForProduct(product.id);
                    if (purchaseOffer && onUseMembershipPurchaseOffer) {
                      onUseMembershipPurchaseOffer(
                        purchaseOffer.offerId,
                        purchaseOffer.displayName,
                        product.id,
                      );
                    } else {
                      onJoin(product.id);
                    }
                  }}
                  testID="experience-repurchase-membership"
                />
              ) : null}
            </View>
          </Card>
        </Section>
      ) : exp.membership ? (
        <Section titleColor={pageTextColor} title={t("experience.yourMemberships")}>
          <MembershipCard
            decoration={resolvedBranding.decoration}
            decorationImageUrl={
              resolvedBranding.decoration?.cardBackgroundImageUrl
            }
            decorationBackgroundColor={customerBackground}
            testID="experience-membership-card"
            organizationName={exp.displayName}
            tier={exp.membership.tier}
            validUntil={exp.membership.validUntilLabel}
            status={subscriptionStatus}
            cardStyle={cardStyle}
            logoUrl={
              membershipLogoUrl ?? resolvedConfiguration.branding.logoUrl
            }
          />
        </Section>
      ) : isPreviewMode ? (
        <Section titleColor={pageTextColor} title={t("experience.yourMemberships")}>
          <MembershipCard
            decoration={resolvedBranding.decoration}
            decorationImageUrl={
              resolvedBranding.decoration?.cardBackgroundImageUrl
            }
            decorationBackgroundColor={customerBackground}
            testID="experience-preview-membership-card"
            organizationName={exp.displayName}
            tier={
              previewDefinition?.membership.headline ??
              content.membership.tierName ??
              "Membership"
            }
            validUntil="—"
            status={subscriptionStatus}
            cardStyle={cardStyle}
            logoUrl={
              membershipLogoUrl ?? resolvedConfiguration.branding.logoUrl
            }
          />
        </Section>
      ) : null}

      {!isHistoricalSubscription &&
      (previewSection === "benefits" || exp.membership) &&
      exp.benefits.length ? (
        <Section titleColor={pageTextColor} title={t("experience.yourBenefits")}>
          <Card padding="lg">
            <View style={{ gap: 18 }}>
              {exp.benefits.map((b) => (
                <BenefitItem
                  key={b.id}
                  testID={`experience-benefit-${b.id}`}
                  title={b.displayName ?? b.benefitName}
                  subtitle={b.description}
                  disclaimerText={b.disclaimerText}
                  eligibleProducts={b.products?.map(
                    (product) => product.productName || product.productCode,
                  )}
                  productStoreAvailability={b.products?.map((eligible) => ({
                    productId: eligible.productId,
                    productName: eligible.productName || eligible.productCode,
                    availability: benefitProductAvailability(
                      b.id,
                      eligible.productId,
                    ),
                  }))}
                  icon={benefitIconForType(b.benefitTypeId)}
                  usageRules={benefitUsageRules?.filter(
                    (rule) => rule.benefitId === b.id,
                  )}
                />
              ))}
            </View>
          </Card>
        </Section>
      ) : null}

      {!isHistoricalSubscription &&
      exp.membership?.active &&
      (redeemSectionBenefits.length || redeemSectionOffers.length) ? (
        <Section titleColor={pageTextColor} title={t("experience.redeemBenefits")}>
          <Card padding="lg" testID="experience-redeem-benefits">
            <View style={{ gap: 14 }}>
              {redeemSectionBenefits.length ? (
                <>
                  <Text variant="bodyStrong" color="text">
                    Benefits
                  </Text>
                  {redeemSectionBenefits.map(({ benefit: b, itemStatus }) => {
                    const selectable = itemStatus.status === "AVAILABLE";
                    const selected = selectable && selectedBenefitIds.has(b.id);

                    return (
                      <Pressable
                        key={b.id}
                        testID={`experience-redeem-benefit-${b.id}`}
                        disabled={!selectable || isPreviewMode}
                        onPress={() => toggleBenefit(b.id)}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: theme.spacing.md,
                          opacity: !selectable
                            ? 0.5
                            : pressed
                              ? theme.states.pressedOpacity
                              : 1,
                        })}
                      >
                        <Ionicons
                          name={
                            !selectable
                              ? "ban-outline"
                              : selected
                                ? "checkbox"
                                : "square-outline"
                          }
                          size={22}
                          color={
                            !selectable || !selected
                              ? theme.colors.textMuted
                              : theme.colors.primary
                          }
                        />

                        <View style={{ flex: 1 }}>
                          <Text
                            variant="bodyStrong"
                            color={selectable ? "text" : "textMuted"}
                          >
                            {b.displayName ?? b.benefitName}
                          </Text>

                          {b.description ? (
                            <Text variant="bodySmall" color="textMuted">
                              {b.description}
                            </Text>
                          ) : null}
                          {b.products?.length ? (
                            <View style={{ gap: 3, marginTop: 4 }}>
                              <Text variant="bodySmall" color="textSecondary">
                                Choose from:
                              </Text>
                              {b.products.map((eligible) => (
                                <Text
                                  key={eligible.productId}
                                  variant="caption"
                                  color="textMuted"
                                >
                                  {eligible.productName || eligible.productCode}{" "}
                                  —{" "}
                                  {benefitProductAvailability(
                                    b.id,
                                    eligible.productId,
                                  )}
                                </Text>
                              ))}
                            </View>
                          ) : null}
                        </View>

                        {!selectable ? (
                          <Badge
                            label={
                              itemStatus.displayReason ??
                              t("experience.benefitUsed")
                            }
                            tone="neutral"
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </>
              ) : null}

              {redeemSectionOffers.length ? (
                <View style={{ gap: theme.spacing.sm }}>
                  <Text variant="bodyStrong" color="text">
                    Special Offers
                  </Text>
                  {redeemSectionOffers.map(({ offer, itemStatus }) => (
                    <DecorativeThemeFrame
                      key={offer.id}
                      imageUrl={
                        resolvedBranding.decoration?.cardBackgroundImageUrl ??
                        null
                      }
                      primaryColor={theme.colors.primary}
                      accentColor={theme.colors.accent}
                      variant="content"
                      decoration={resolvedBranding.decoration}
                    >
                      <OfferCard
                        decorative={Boolean(
                          resolvedBranding.decoration?.cardBackgroundImageUrl &&
                          resolvedBranding.decoration?.cardTreatment ===
                            "IMAGE_OVERLAY",
                        )}
                        offerId={offer.id}
                        testID={`experience-redeem-offer-${offer.id}`}
                        title={offer.offerName}
                        description={offer.description}
                        imageUrl={offer.promotionImageUrl}
                        badge={offer.badgeText}
                        availabilityText={offerAvailabilityText(offer)}
                        disclaimerText={offer.disclaimerText}
                        applicableProducts={offer.products?.map(
                          (product) =>
                            product.productName || product.productCode,
                        )}
                        discountPercentage={offer.discountPercentage}
                        ctaLabel={
                          isPreviewMode
                            ? offer.ctaLabel
                            : itemStatus.status === "AVAILABLE"
                              ? selectedOfferIds.has(offer.id)
                                ? "Remove from redemption"
                                : "Add to redemption"
                              : (itemStatus.displayReason ?? "Unavailable")
                        }
                        usageRules={offerUsageRules?.filter(
                          (rule) => rule.offerId === offer.id,
                        )}
                        onPress={
                          isPreviewMode ||
                          isHistoricalSubscription ||
                          itemStatus.status !== "AVAILABLE"
                            ? undefined
                            : () => toggleOffer(offer.id)
                        }
                      />
                    </DecorativeThemeFrame>
                  ))}
                </View>
              ) : null}

              {!hasRedeemable ? (
                <Text variant="bodySmall" color="textMuted">
                  {t("experience.noRedeemable")}
                </Text>
              ) : null}

              {!isPreviewMode ? (
                <View
                  style={{
                    flexDirection: isMobileLayout ? "column" : "row",
                    alignItems: isMobileLayout ? "stretch" : "center",
                    justifyContent: isMobileLayout
                      ? "flex-start"
                      : "space-between",
                    width: "100%",
                    gap: isMobileLayout ? theme.spacing.md : theme.spacing.sm,
                    marginTop: theme.spacing.sm,
                  }}
                >
                  <Text variant="caption" color="textMuted">
                    {selectedSummary || "No items selected"}
                  </Text>
                  {!isPreviewMode && selectedRedemptionProducts.length > 0 ? (
                    <RedemptionProductPicker
                      storeNamesById={storeNamesById}
                      subscriptionId={subscription?.id ?? ""}
                      items={selectedRedemptionProducts}
                      loadChoices={(item) =>
                        services.customerData.redemptionProductChoices(
                          organization.id,
                          subscription?.id ?? "",
                          item.itemType,
                          item.itemId,
                        )
                      }
                      onChange={setProductSelection}
                    />
                  ) : null}
                  <Button
                    label={
                      redemptionLoading
                        ? "Creating redemption…"
                        : `Redeem Selected${selectedCount ? ` (${selectedCount})` : ""}`
                    }
                    disabled={selectedCount === 0 || redemptionLoading}
                    onPress={() => {
                      void createRedemptionTransaction("ALL");
                    }}
                    testID="experience-redeem-selected"
                  />
                </View>
              ) : null}
            </View>
          </Card>
        </Section>
      ) : null}

      {!isPreviewMode && availableMemberships.length ? (
        <Section titleColor={pageTextColor} title={t("experience.availableMemberships")}>
          <View style={{ gap: theme.spacing.md }}>
            {availableMemberships.map((p) => {
              const membershipOffer = membershipOfferForProduct(p.id);
              return (
                <Card
                  key={p.id}
                  testID={`experience-available-${p.id}`}
                  padding="lg"
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing.md,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        gap: 2,
                      }}
                    >
                      <Text variant="bodyStrong" color="text">
                        {p.displayName ?? p.membershipProductName}
                      </Text>

                      {p.description ? (
                        <Text variant="bodySmall" color="textMuted">
                          {p.description}
                        </Text>
                      ) : null}

                      {p.plans.map((plan) => (
                        <View key={plan.id} style={{ gap: 2 }}>
                          <Text variant="bodySmall" color="textMuted">
                            {plan.subscriptionPlanName}
                          </Text>
                          <Text variant="bodySmall" color="primary">
                            {`${formatMoney(plan.price.amountMinor)} · ${getSubscriptionPeriodLabel(plan)}`}
                          </Text>
                        </View>
                      ))}
                      {membershipOffer ? (
                        <View style={{ gap: 2, marginTop: theme.spacing.xs }}>
                          <Text variant="label" color="textSecondary">
                            MEMBERSHIP OFFER
                          </Text>
                          <Text variant="bodySmall" color="primary">
                            {membershipOffer.displayName}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={{ gap: theme.spacing.xs }}>
                      <Button
                        label={
                          membershipOffer
                            ? "Join with Offer"
                            : t("experience.join")
                        }
                        size="sm"
                        onPress={() => {
                          trackActivity("BUY_MEMBERSHIP_CLICKED", {
                            organizationId: organization.id,
                            membershipProductId: p.id,
                          });
                          if (membershipOffer) {
                            onUseMembershipPurchaseOffer?.(
                              membershipOffer.offerId,
                              membershipOffer.displayName,
                              p.id,
                            );
                          } else {
                            onJoin(p.id);
                          }
                        }}
                        disabled={Boolean(
                          membershipOffer && !onUseMembershipPurchaseOffer,
                        )}
                        testID={`experience-join-${p.id}`}
                      />
                      {membershipOffer ? (
                        <>
                          <Button
                            label={
                              membershipOfferQrLoadingProductId === p.id
                                ? "Generating QR…"
                                : "Show QR at Store"
                            }
                            size="sm"
                            variant="outline"
                            disabled={
                              membershipOfferQrLoadingProductId !== null
                            }
                            onPress={() => {
                              void issueMembershipPurchaseOfferQr(
                                membershipOffer.offerId,
                                p.id,
                              );
                            }}
                            testID={`experience-membership-offer-${membershipOffer.offerId}-qr`}
                          />
                          <Text variant="caption" color="textMuted">
                            QR expires 5 minutes after it is generated.
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        </Section>
      ) : null}
    </View>
  );

  /* ------------------------------------------------------------------ */
  /* Offers                                                             */
  /* ------------------------------------------------------------------ */

  const OffersTab = (() => {
    /**
     * Offers are organization-owned and may optionally be restricted to a
     * MembershipProduct. The selected subscription remains the single source
     * of truth for membership-specific filtering.
     *
     * Customer Offers intentionally uses one consistent card treatment:
     * there is no separate featured/hero offer. Every applicable offer is
     * presented once as its own offer card.
     */
    return (
      <View style={{ gap: theme.spacing.lg }} testID="experience-tab-offers">
        {renderTabPreviewLink("offers")}

        <Section titleColor={pageTextColor} title={t("experience.todaysPerks")}>
          <View style={{ gap: theme.spacing.md }}>
            {offersTabItems.length ? (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="label" color="textSecondary">
                  OTHER OFFERS
                </Text>
                {offersTabItems.map(({ offer, itemStatus }) => (
                  <DecorativeThemeFrame
                    key={offer.id}
                    imageUrl={
                      resolvedBranding.decoration?.cardBackgroundImageUrl ??
                      null
                    }
                    primaryColor={theme.colors.primary}
                    accentColor={theme.colors.accent}
                    variant="content"
                    decoration={resolvedBranding.decoration}
                  >
                    <OfferCard
                      decorative={Boolean(
                        resolvedBranding.decoration?.cardBackgroundImageUrl &&
                        resolvedBranding.decoration?.cardTreatment ===
                          "IMAGE_OVERLAY",
                      )}
                      offerId={offer.id}
                      testID={`experience-offer-${offer.id}`}
                      title={offer.offerName}
                      description={offer.description}
                      imageUrl={offer.promotionImageUrl}
                      badge={offer.badgeText}
                      availabilityText={offerAvailabilityText(offer)}
                      disclaimerText={offer.disclaimerText}
                      applicableProducts={offer.products?.map(
                        (product) => product.productName || product.productCode,
                      )}
                      discountPercentage={offer.discountPercentage}
                      ctaLabel={
                        isPreviewMode
                          ? offer.ctaLabel
                          : !isHistoricalSubscription &&
                              itemStatus.status === "AVAILABLE"
                            ? selectedOfferIds.has(offer.id)
                              ? "Remove from redemption"
                              : "Add to redemption"
                            : (itemStatus.displayReason ?? "Unavailable")
                      }
                      usageRules={offerUsageRules?.filter(
                        (rule) => rule.offerId === offer.id,
                      )}
                      onPress={
                        isPreviewMode || itemStatus.status !== "AVAILABLE"
                          ? undefined
                          : () => toggleOffer(offer.id)
                      }
                    />
                  </DecorativeThemeFrame>
                ))}
              </View>
            ) : null}

            {!offersTabItems.length ? (
              <Card
                padding="lg"
                style={{
                  alignItems: "center",
                  paddingVertical: 32,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: theme.colors.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: theme.spacing.sm,
                  }}
                >
                  <Ionicons
                    name="pricetag-outline"
                    size={28}
                    color={theme.colors.primary}
                  />
                </View>

                <Text variant="bodyStrong" color="text">
                  No offers available
                </Text>

                <Text
                  variant="bodySmall"
                  color="textMuted"
                  style={{
                    textAlign: "center",
                    marginTop: 4,
                  }}
                >
                  There are no special offers available for you right now. Check
                  back later for something new.
                </Text>
              </Card>
            ) : null}

            {!isPreviewMode &&
            !isHistoricalSubscription &&
            offersTabItems.length ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: theme.spacing.md,
                }}
              >
                <Text variant="caption" color="textMuted">
                  {selectedOfferCount
                    ? `Basket: ${selectedOfferCount} Offer${selectedOfferCount === 1 ? "" : "s"}`
                    : "Basket: No offers selected"}
                </Text>

                <Button
                  label={
                    redemptionLoading
                      ? "Creating redemption…"
                      : `Redeem Selected${selectedOfferCount ? ` (${selectedOfferCount})` : ""}`
                  }
                  disabled={selectedOfferCount === 0 || redemptionLoading}
                  onPress={() => {
                    void createRedemptionTransaction("OFFERS");
                  }}
                  testID="experience-offers-redeem-selected"
                />
              </View>
            ) : null}
          </View>
        </Section>
      </View>
    );
  })();

  const HistoryTab = (() => {
    const sortedActivity = [...exp.activity].sort((a, b) => {
      const redemptionA = redemptions.find((r) => r.id === a.id);
      const redemptionB = redemptions.find((r) => r.id === b.id);

      const timeA = redemptionA
        ? new Date(redemptionA.redemptionDateTime).getTime()
        : 0;

      const timeB = redemptionB
        ? new Date(redemptionB.redemptionDateTime).getTime()
        : 0;

      return timeB - timeA;
    });

    const visibleActivity = showAllHistory
      ? sortedActivity
      : sortedActivity.slice(0, 3);

    const currentYear = new Date().getFullYear();

    const redemptionsThisYear = redemptions.filter(
      (redemption) =>
        new Date(redemption.redemptionDateTime).getFullYear() === currentYear,
    ).length;

    const latestRedemption = [...redemptions].sort(
      (a, b) =>
        new Date(b.redemptionDateTime).getTime() -
        new Date(a.redemptionDateTime).getTime(),
    )[0];

    const calendarBaseDate = latestRedemption
      ? new Date(latestRedemption.redemptionDateTime)
      : new Date();

    const calendarYear = calendarBaseDate.getFullYear();
    const calendarMonth = calendarBaseDate.getMonth();

    const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
    const firstWeekday = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    const calendarCells: Array<{
      date: Date;
      day: number;
      currentMonth: boolean;
    }> = [];

    for (let i = firstWeekday - 1; i >= 0; i -= 1) {
      const date = new Date(calendarYear, calendarMonth, -i);

      calendarCells.push({
        date,
        day: date.getDate(),
        currentMonth: false,
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(calendarYear, calendarMonth, day);

      calendarCells.push({
        date,
        day: date.getDate(),
        currentMonth: true,
      });
    }

    let nextDay = 1;

    while (calendarCells.length % 7 !== 0) {
      const date = new Date(calendarYear, calendarMonth + 1, nextDay);

      calendarCells.push({
        date,
        day: date.getDate(),
        currentMonth: false,
      });

      nextDay += 1;
    }

    const redemptionDates = new Set(
      redemptions.map((r) => {
        const date = new Date(r.redemptionDateTime);

        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      }),
    );

    const dateKey = (date: Date) =>
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    const storeCounts = new Map<string, number>();

    redemptions.forEach((redemption) => {
      storeCounts.set(
        redemption.storeId,
        (storeCounts.get(redemption.storeId) ?? 0) + 1,
      );
    });

    let mostVisitedStore = exp.mostVisited;

    if (storeCounts.size) {
      let highestCount = 0;
      let highestStoreId: string | undefined;

      storeCounts.forEach((count, storeId) => {
        if (count > highestCount) {
          highestCount = count;
          highestStoreId = storeId;
        }
      });

      if (highestStoreId) {
        mostVisitedStore =
          exp.stores.find((store) => store.id === highestStoreId)?.name ??
          exp.mostVisited;
      }
    }

    const benefitCounts = new Map<string, number>();

    redemptions.forEach((redemption) => {
      benefitCounts.set(
        redemption.benefitId,
        (benefitCounts.get(redemption.benefitId) ?? 0) + 1,
      );
    });

    let topBenefit: string | undefined;

    if (benefitCounts.size) {
      let highestCount = 0;
      let highestBenefitId: string | undefined;

      benefitCounts.forEach((count, benefitId) => {
        if (count > highestCount) {
          highestCount = count;
          highestBenefitId = benefitId;
        }
      });

      if (highestBenefitId) {
        topBenefit = benefitTitleById.get(highestBenefitId);
      }
    }

    const monthLabel = calendarBaseDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

    return (
      <View style={{ gap: theme.spacing.lg }} testID="experience-tab-history">
        {renderTabPreviewLink("history")}

        {subscription && !isPreviewMode ? (
          <Section titleColor={pageTextColor} title="Membership Details">
            <Card padding="lg">
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="bodyStrong" color="text">
                  {exp.membership?.tier ??
                    product?.displayName ??
                    product?.membershipProductName ??
                    "Membership"}
                </Text>
                <Badge
                  label={subscriptionStatus?.statusName ?? "Status unavailable"}
                  tone="neutral"
                />
                <Text variant="bodySmall" color="textMuted">
                  Subscription: {subscription.subscriptionNumber}
                </Text>
                <Text variant="bodySmall" color="textMuted">
                  Start: {formatDate(subscription.startDate)}
                </Text>
                <Text variant="bodySmall" color="textMuted">
                  Original end: {formatDate(subscription.endDate)}
                </Text>
              </View>
            </Card>
          </Section>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text variant="h2" color="text">
            {t("experience.tabHistory")}
          </Text>

          {sortedActivity.length > 3 ? (
            <Pressable
              onPress={() => setShowAllHistory((current) => !current)}
              hitSlop={8}
            >
              <Text variant="label" color="primary">
                {showAllHistory ? "Show Less" : "View All"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <DecorativeThemeFrame
          imageUrl={resolvedBranding.decoration?.cardBackgroundImageUrl ?? null}
          primaryColor={theme.colors.primary}
          accentColor={theme.colors.accent}
          backgroundColor={customerBackground}
          decoration={resolvedBranding.decoration}
        >
          <DecorativeContentThemeScope
            enabled={Boolean(
              resolvedBranding.decoration?.cardBackgroundImageUrl &&
              resolvedBranding.decoration?.cardTreatment === "IMAGE_OVERLAY",
            )}
          >
            <Card
              padding="lg"
              testID="experience-history-summary"
              style={{
                overflow: "hidden",
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor:
                  resolvedBranding.decoration?.cardBackgroundImageUrl &&
                  resolvedBranding.decoration?.cardTreatment === "IMAGE_OVERLAY"
                    ? "rgba(255,255,255,0.92)"
                    : theme.colors.surface,
              }}
            >
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: theme.spacing.md,
                  gap: theme.spacing.xs,
                }}
              >
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    backgroundColor: theme.colors.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: theme.spacing.xs,
                  }}
                >
                  <Ionicons
                    name="gift-outline"
                    size={34}
                    color={theme.colors.primary}
                  />
                </View>

                <Text variant="title" color="text">
                  Redeemed
                </Text>

                <Text
                  variant="display"
                  color="primary"
                  style={{
                    fontSize: 44,
                    lineHeight: 50,
                    fontWeight: "600",
                  }}
                >
                  {redemptionsThisYear}
                </Text>

                <Text
                  variant="caption"
                  color="textMuted"
                  style={{
                    letterSpacing: 1.5,
                    fontWeight: "600",
                  }}
                >
                  REWARDS THIS YEAR
                </Text>

                <Text
                  variant="bodySmall"
                  color="textSecondary"
                  style={{
                    textAlign: "center",
                    marginTop: theme.spacing.sm,
                  }}
                >
                  Your membership activity at {exp.displayName}
                </Text>
              </View>
            </Card>
          </DecorativeContentThemeScope>
        </DecorativeThemeFrame>

        {visibleActivity.length ? (
          <Section titleColor={pageTextColor} title="Recent Activity">
            <View style={{ gap: theme.spacing.md }}>
              {visibleActivity.map((activity) => {
                const redemption = redemptions.find(
                  (r) => r.id === activity.id,
                );

                const benefit = redemption
                  ? exp.benefits.find((b) => b.id === redemption.benefitId)
                  : undefined;

                const iconName = benefit
                  ? benefitIconForType(benefit.benefitTypeId)
                  : "gift-outline";

                return (
                  <DecorativeThemeFrame
                    key={activity.id}
                    imageUrl={
                      resolvedBranding.decoration?.cardBackgroundImageUrl ??
                      null
                    }
                    primaryColor={theme.colors.primary}
                    accentColor={theme.colors.accent}
                    backgroundColor={customerBackground}
                    decoration={resolvedBranding.decoration}
                  >
                    <DecorativeContentThemeScope
                      enabled={Boolean(
                        resolvedBranding.decoration?.cardBackgroundImageUrl &&
                        resolvedBranding.decoration?.cardTreatment ===
                          "IMAGE_OVERLAY",
                      )}
                    >
                      <Card
                        padding="md"
                        testID={`experience-activity-${activity.id}`}
                        style={{
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor:
                            resolvedBranding.decoration
                              ?.cardBackgroundImageUrl &&
                            resolvedBranding.decoration?.cardTreatment ===
                              "IMAGE_OVERLAY"
                              ? "rgba(255,255,255,0.92)"
                              : theme.colors.surface,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: theme.spacing.md,
                          }}
                        >
                          <View
                            style={{
                              width: 54,
                              height: 54,
                              borderRadius: theme.radius.md,
                              backgroundColor: theme.colors.primarySoft,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Ionicons
                              name={iconName as keyof typeof Ionicons.glyphMap}
                              size={27}
                              color={theme.colors.primary}
                            />
                          </View>

                          <View
                            style={{
                              flex: 1,
                              gap: 2,
                            }}
                          >
                            <Text
                              variant="bodyStrong"
                              color="text"
                              numberOfLines={2}
                            >
                              {activity.title}
                            </Text>

                            <Text
                              variant="bodySmall"
                              color="textSecondary"
                              numberOfLines={1}
                            >
                              {activity.location}
                            </Text>

                            <Text variant="caption" color="textMuted">
                              {activity.timeLabel}
                            </Text>
                          </View>

                          <View
                            style={{
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Text
                              variant="caption"
                              color="primary"
                              style={{
                                fontWeight: "600",
                                letterSpacing: 0.5,
                              }}
                            >
                              {t("experience.redeemed").toUpperCase()}
                            </Text>

                            <View
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 12,
                                backgroundColor: theme.colors.primary,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons
                                name="checkmark"
                                size={15}
                                color={theme.colors.onPrimary}
                              />
                            </View>
                          </View>
                        </View>
                      </Card>
                    </DecorativeContentThemeScope>
                  </DecorativeThemeFrame>
                );
              })}
            </View>
          </Section>
        ) : (
          <Card
            padding="lg"
            style={{
              alignItems: "center",
              paddingVertical: 32,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: theme.colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: theme.spacing.sm,
              }}
            >
              <Ionicons
                name="time-outline"
                size={28}
                color={theme.colors.primary}
              />
            </View>

            <Text variant="bodyStrong" color="text">
              {t("experience.tabHistory")}
            </Text>

            <Text
              variant="bodySmall"
              color="textMuted"
              style={{
                textAlign: "center",
                marginTop: 4,
              }}
            >
              {t("experience.historyEmpty")}
            </Text>
          </Card>
        )}

        <Card
          padding="lg"
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <View style={{ gap: theme.spacing.lg }}>
            <View>
              <Text variant="h2" color="text">
                Activity
              </Text>

              <Text
                variant="caption"
                color="textMuted"
                style={{ marginTop: 3 }}
              >
                {monthLabel}
              </Text>
            </View>

            <View style={{ flexDirection: "row" }}>
              {weekdayLabels.map((label, index) => (
                <View
                  key={`${label}-${index}`}
                  style={{
                    flex: 1,
                    alignItems: "center",
                  }}
                >
                  <Text variant="caption" color="textMuted">
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ gap: 8 }}>
              {Array.from({
                length: Math.ceil(calendarCells.length / 7),
              }).map((_, weekIndex) => (
                <View
                  key={`week-${weekIndex}`}
                  style={{
                    flexDirection: "row",
                  }}
                >
                  {calendarCells
                    .slice(weekIndex * 7, weekIndex * 7 + 7)
                    .map((cell) => {
                      const hasActivity = redemptionDates.has(
                        dateKey(cell.date),
                      );

                      const isLatest = latestRedemption
                        ? dateKey(
                            new Date(latestRedemption.redemptionDateTime),
                          ) === dateKey(cell.date)
                        : false;

                      return (
                        <View
                          key={dateKey(cell.date)}
                          style={{
                            flex: 1,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 17,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: hasActivity
                                ? theme.colors.primarySoft
                                : "transparent",
                              borderWidth: isLatest ? 1.5 : 0,
                              borderColor: theme.colors.primary,
                            }}
                          >
                            <Text
                              variant="caption"
                              color={
                                !cell.currentMonth
                                  ? "textMuted"
                                  : hasActivity
                                    ? "primary"
                                    : "text"
                              }
                              style={{
                                opacity: cell.currentMonth ? 1 : 0.35,
                                fontWeight: hasActivity ? "600" : "400",
                              }}
                            >
                              {cell.day}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                </View>
              ))}
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.sm,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: theme.colors.primarySoft,
                }}
              />

              <Text variant="caption" color="textMuted">
                Redemption activity
              </Text>
            </View>
          </View>
        </Card>

        {mostVisitedStore || topBenefit ? (
          <View style={{ gap: theme.spacing.sm }}>
            {mostVisitedStore ? (
              <Card
                padding="md"
                style={{
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: theme.colors.primarySoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="star-outline"
                      size={18}
                      color={theme.colors.primary}
                    />
                  </View>

                  <Text variant="bodySmall" color="text" style={{ flex: 1 }}>
                    Most Visited
                  </Text>

                  <Text
                    variant="bodySmall"
                    color="textSecondary"
                    numberOfLines={1}
                  >
                    {mostVisitedStore}
                  </Text>
                </View>
              </Card>
            ) : null}

            {topBenefit ? (
              <Card
                padding="md"
                style={{
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: theme.colors.primarySoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="heart-outline"
                      size={18}
                      color={theme.colors.primary}
                    />
                  </View>

                  <Text variant="bodySmall" color="text" style={{ flex: 1 }}>
                    Top Benefit
                  </Text>

                  <Text
                    variant="bodySmall"
                    color="textSecondary"
                    numberOfLines={1}
                    style={{
                      maxWidth: "55%",
                      textAlign: "right",
                    }}
                  >
                    {topBenefit}
                  </Text>
                </View>
              </Card>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  })();

  /* ------------------------------------------------------------------ */
  /* Business information                                               */
  /* ------------------------------------------------------------------ */

  /**
   * The customer-facing Business Information section is rendered in one
   * place and reused by both the real Profile tab and the Org Admin
   * individual-section preview. This prevents the admin preview from
   * drifting away from the actual customer experience.
   */
  const profileDetails = profileOrganizationDetails;
  const businessAbout = profileDetails?.aboutOrganization?.trim() || "";
  const businessSupportEmail = profileDetails?.supportEmail?.trim() || "";
  const businessSupportPhone = formatPhoneNumber(profileDetails?.supportPhone);
  const businessWebsite = profileOrganizationWebsite.trim();

  const ProfileBusinessInformationSection =
    businessAbout ||
    businessSupportEmail ||
    businessSupportPhone ||
    businessWebsite ? (
      <Section titleColor={pageTextColor} title={t("experience.about")}>
        <ProfileThemeCard testID="experience-profile-business-information">
          <View style={{ gap: theme.spacing.md }}>
            {businessAbout ? (
              <Text variant="body" color="textSecondary">
                {businessAbout}
              </Text>
            ) : null}

            {businessSupportEmail ? (
              <InfoRow
                icon="mail-outline"
                label={t("experience.email")}
                value={businessSupportEmail}
                theme={overlayCardTheme}
              />
            ) : null}

            {businessSupportPhone ? (
              <InfoRow
                icon="call-outline"
                label={t("experience.phone")}
                value={businessSupportPhone}
                theme={overlayCardTheme}
              />
            ) : null}

            {businessWebsite ? (
              <InfoRow
                icon="globe-outline"
                label={t("experience.website")}
                value={businessWebsite}
                theme={overlayCardTheme}
              />
            ) : null}
          </View>
        </ProfileThemeCard>
      </Section>
    ) : null;

  const BusinessInformationSection = exp.businessInformation ? (
    <Section titleColor={pageTextColor} title={t("experience.about")}>
      <ProfileThemeCard testID="experience-business-information">
        <View style={{ gap: theme.spacing.md }}>
          {exp.businessInformation.about ? (
            <Text variant="body" color="textSecondary">
              {exp.businessInformation.about}
            </Text>
          ) : null}

          {exp.businessInformation.supportEmail ? (
            <InfoRow
              icon="mail-outline"
              label={t("experience.email")}
              value={exp.businessInformation.supportEmail}
              theme={overlayCardTheme}
            />
          ) : null}

          {exp.businessInformation.supportPhone ? (
            <InfoRow
              icon="call-outline"
              label={t("experience.phone")}
              value={exp.businessInformation.supportPhone}
              theme={overlayCardTheme}
            />
          ) : null}

          {exp.businessInformation.website ? (
            <InfoRow
              icon="globe-outline"
              label={t("experience.website")}
              value={exp.businessInformation.website}
              theme={overlayCardTheme}
            />
          ) : null}
        </View>
      </ProfileThemeCard>
    </Section>
  ) : null;

  /* ------------------------------------------------------------------ */
  /* Profile                                                            */
  /* ------------------------------------------------------------------ */

  const ProfileTab = (
    <View style={{ gap: theme.spacing.lg }} testID="experience-tab-profile">
      {renderTabPreviewLink("profile")}

      {exp.showStores && exp.stores.length ? (
        <Section titleColor={pageTextColor} title={t("experience.locations")}>
          <ProfileThemeCard testID="experience-profile-stores">
            <View style={{ gap: 18 }}>
              {exp.stores.map((s) => (
                <View
                  key={s.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.md,
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={20}
                    color={theme.colors.primary}
                  />

                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" color="text">
                      {s.name}
                    </Text>

                    <Text variant="bodySmall" color="textMuted">
                      {s.address.line1}
                      {s.address.city ? `, ${s.address.city}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ProfileThemeCard>
        </Section>
      ) : null}

      {ProfileBusinessInformationSection}

      <Section titleColor={pageTextColor} title={t("experience.preferences")}>
        <ProfileThemeCard testID="experience-profile-preferences">
          <View style={{ gap: theme.spacing.md }}>
            {/*
            <PrefRow
              label={t("experience.notifications")}
              on={notificationsEnabled}
              t={t}
              theme={overlayCardTheme}
              onPress={() => void handlePreferenceToggle("NOTIFICATIONS")}
              disabled={savingPreference === "NOTIFICATIONS"}
            />
          */}

            <PrefRow
              label={t("experience.marketingEmails")}
              on={marketingEmailsEnabled}
              t={t}
              theme={theme}
              onPress={() => void handlePreferenceToggle("MARKETING_EMAILS")}
              disabled={savingPreference === "MARKETING_EMAILS"}
            />
          </View>
        </ProfileThemeCard>
      </Section>

      {referralProgram ? (
        <ProfileThemeCard testID="experience-profile-referral">
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="title" color="text">
              {referralProgram.referralProgramName}
            </Text>

            {referralProgram.description ? (
              <Text variant="bodySmall" color="textMuted">
                {referralProgram.description}
              </Text>
            ) : null}

            <Button
              label={
                referralLoading
                  ? "Creating referral…"
                  : t("experience.referral")
              }
              variant="secondary"
              onPress={() => void handleReferralPress()}
              testID="experience-referral"
              disabled={referralLoading || !profileUserId}
            />
          </View>
        </ProfileThemeCard>
      ) : null}
    </View>
  );

  const tabContent =
    effectiveTab === "card"
      ? CardTab
      : effectiveTab === "offers"
        ? OffersTab
        : effectiveTab === "history"
          ? HistoryTab
          : ProfileTab;

  /* ------------------------------------------------------------------ */
  /* Individual section preview                                         */
  /* ------------------------------------------------------------------ */

  const individualSectionContent = (() => {
    switch (previewSection) {
      case "membership":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-membership"
          >
            <Section titleColor={pageTextColor} title={t("experience.yourMemberships")}>
              <MembershipCard
                decoration={resolvedBranding.decoration}
                decorationImageUrl={
                  resolvedBranding.decoration?.cardBackgroundImageUrl
                }
                decorationBackgroundColor={customerBackground}
                testID="experience-preview-membership-card"
                organizationName={exp.displayName}
                tier={
                  exp.membership?.tier ??
                  previewDefinition?.membership.headline ??
                  resolvedContent.membership.tierName ??
                  "Membership"
                }
                validUntil={exp.membership?.validUntilLabel ?? "—"}
                status={subscriptionStatus}
                cardStyle={cardStyle}
                logoUrl={
                  membershipLogoUrl ?? resolvedConfiguration.branding.logoUrl
                }
              />
            </Section>
          </View>
        );

      case "benefits":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-benefits"
          >
            <Section titleColor={pageTextColor} title={t("experience.yourBenefits")}>
              {exp.benefits.length ? (
                <DecorativeThemeFrame
                  imageUrl={
                    resolvedBranding.decoration?.cardBackgroundImageUrl ?? null
                  }
                  primaryColor={theme.colors.primary}
                  accentColor={theme.colors.accent}
                  decoration={resolvedBranding.decoration}
                >
                  <DecorativeContentThemeScope
                    enabled={Boolean(
                      resolvedBranding.decoration?.cardBackgroundImageUrl &&
                      resolvedBranding.decoration?.cardTreatment ===
                        "IMAGE_OVERLAY",
                    )}
                  >
                    <Card
                      padding="lg"
                      style={{
                        backgroundColor:
                          resolvedBranding.decoration?.cardBackgroundImageUrl &&
                          resolvedBranding.decoration?.cardTreatment ===
                            "IMAGE_OVERLAY"
                            ? "rgba(255,255,255,0.92)"
                            : theme.colors.card,
                      }}
                    >
                      <View style={{ gap: 18 }}>
                        {exp.benefits.map((b) => (
                          <BenefitItem
                            key={b.id}
                            testID={`experience-preview-benefit-${b.id}`}
                            title={b.displayName ?? b.benefitName}
                            subtitle={b.description}
                            disclaimerText={b.disclaimerText}
                            eligibleProducts={b.products?.map(
                              (product) =>
                                product.productName || product.productCode,
                            )}
                            productStoreAvailability={b.products?.map(
                              (eligible) => ({
                                productId: eligible.productId,
                                productName:
                                  eligible.productName || eligible.productCode,
                                availability: benefitProductAvailability(
                                  b.id,
                                  eligible.productId,
                                ),
                              }),
                            )}
                            icon={benefitIconForType(b.benefitTypeId)}
                            usageRules={benefitUsageRules?.filter(
                              (rule) => rule.benefitId === b.id,
                            )}
                          />
                        ))}
                      </View>
                    </Card>
                  </DecorativeContentThemeScope>
                </DecorativeThemeFrame>
              ) : (
                <Card padding="lg">
                  <Text variant="bodySmall" color="textMuted">
                    No membership benefits are currently configured.
                  </Text>
                </Card>
              )}
            </Section>
          </View>
        );

      case "offers":
        return OffersTab;

      case "activity":
        return HistoryTab;

      case "stores":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-stores"
          >
            <Section titleColor={pageTextColor} title={t("experience.locations")}>
              {exp.stores.length ? (
                <ProfileThemeCard testID="experience-preview-stores">
                  <View style={{ gap: 18 }}>
                    {exp.stores.map((s) => (
                      <View
                        key={s.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: theme.spacing.md,
                        }}
                      >
                        <Ionicons
                          name="location-outline"
                          size={20}
                          color={theme.colors.primary}
                        />

                        <View style={{ flex: 1 }}>
                          <Text variant="bodyStrong" color="text">
                            {s.name}
                          </Text>

                          <Text variant="bodySmall" color="textMuted">
                            {s.address.line1}
                            {s.address.city ? `, ${s.address.city}` : ""}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </ProfileThemeCard>
              ) : (
                <Card padding="lg">
                  <Text variant="bodySmall" color="textMuted">
                    No store locations are currently configured.
                  </Text>
                </Card>
              )}
            </Section>
          </View>
        );

      case "business-information":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-business-information"
          >
            {BusinessInformationSection ?? (
              <Card padding="lg">
                <Text variant="bodySmall" color="textMuted">
                  Business information is not configured for this template.
                </Text>
              </Card>
            )}
          </View>
        );

      case "business-preferences":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-business-preferences"
          >
            <Section titleColor={pageTextColor} title={t("experience.preferences")}>
              {exp.businessPreferences ? (
                <Card padding="lg">
                  <View style={{ gap: theme.spacing.md }}>
                    <PrefRow
                      label={t("experience.notifications")}
                      on={exp.businessPreferences.notifications}
                      t={t}
                      theme={theme}
                    />

                    <PrefRow
                      label={t("experience.marketingEmails")}
                      on={exp.businessPreferences.marketingEmails}
                      t={t}
                      theme={theme}
                    />
                  </View>
                </Card>
              ) : (
                <Card padding="lg">
                  <Text variant="bodySmall" color="textMuted">
                    Business preferences are not configured for this template.
                  </Text>
                </Card>
              )}
            </Section>
          </View>
        );

      case "referral":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-referral"
          >
            <Section titleColor={pageTextColor} title={t("experience.referral")}>
              {exp.referral ? (
                <Card padding="lg">
                  <View style={{ gap: theme.spacing.sm }}>
                    <Text variant="title" color="text">
                      {exp.referral.headline}
                    </Text>

                    <Text variant="bodySmall" color="textMuted">
                      {exp.referral.description}
                    </Text>

                    <Button
                      label={t("experience.referral")}
                      variant="secondary"
                      onPress={() => setReferralOpen(true)}
                      testID="experience-preview-referral"
                      disabled={isPreviewMode}
                    />
                  </View>
                </Card>
              ) : (
                <Card padding="lg">
                  <Text variant="bodySmall" color="textMuted">
                    Referral is not configured for this template.
                  </Text>
                </Card>
              )}
            </Section>
          </View>
        );

      case "profile":
        return ProfileTab;

      default:
        return null;
    }
  })();

  const renderedContent = previewSection
    ? individualSectionContent
    : tabContent;

  return (
    <BusinessThemeScope theme={customerTheme}>
      <View
        style={{
          flex: 1,
          backgroundColor: customerBackground,
          paddingTop: insets.top,
        }}
      >
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.sm,
          }}
        >
          <Pressable
            onPress={onExit}
            testID="experience-back"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              alignSelf: "flex-start",
              paddingVertical: 6,
              opacity: pressed ? theme.states.pressedOpacity : 1,
            })}
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={theme.colors.primary}
            />
            <Text variant="label" color="primary">
              {t("experience.back")}
            </Text>
          </Pressable>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
          }}
        >
          <BrandLogo
            logoUrl={
              membershipLogoUrl ?? resolvedConfiguration.branding.logoUrl
            }
            monogram={exp.monogram}
            size={46}
            fit="cover"
            testID="experience-brand-logo"
          />
          <View style={{ flex: 1 }}>
            <Text variant="h2" color="text" style={{ color: pageTextColor }}>
              {exp.displayName}
            </Text>
            <Text variant="caption" color="textMuted" style={{ color: pageTextColor }}>
              {tagline?.trim() || exp.tagline}
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: theme.spacing.lg,
            paddingTop: theme.spacing.sm,
            paddingBottom: insets.bottom + 90,
            gap: theme.spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          {customerActionError ? (
            <Card padding="md">
              <Text variant="bodySmall" color="textMuted">
                {customerActionError}
              </Text>
            </Card>
          ) : null}
          {memberships.length > 1 &&
          effectiveTab !== "profile" &&
          previewSection !== "profile" ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                gap: theme.spacing.sm,
              }}
              testID="experience-membership-selector"
            >
              {memberships.map((m) => {
                const selected = m.subscription.id === selectedSubscriptionId;

                const plan = m.product.plans.find(
                  (item) => item.id === m.subscription.subscriptionPlanId,
                );

                const productLabel =
                  m.product.displayName ?? m.product.membershipProductName;

                const label = plan?.subscriptionPlanName
                  ? `${productLabel} · ${plan.subscriptionPlanName}`
                  : productLabel;

                return (
                  <Pressable
                    key={m.subscription.id}
                    testID={`experience-membership-option-${m.subscription.id}`}
                    onPress={() => onSelectSubscription(m.subscription.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: 8,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: selected
                        ? theme.colors.primary
                        : theme.colors.border,
                      backgroundColor: selected
                        ? theme.colors.primarySoft
                        : theme.colors.background,
                      opacity: pressed ? theme.states.pressedOpacity : 1,
                    })}
                  >
                    <Ionicons
                      name={selected ? "card" : "card-outline"}
                      size={14}
                      color={
                        selected ? theme.colors.primary : theme.colors.textMuted
                      }
                    />

                    <Text
                      variant="label"
                      color={selected ? "primary" : "textMuted"}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          {renderedContent}
        </ScrollView>

        {!hideTabBar ? (
          <View
            style={{
              flexDirection: "row",
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              paddingBottom: insets.bottom,
            }}
          >
            {exp.tabs.map((tb) => {
              const focused = tb.key === effectiveTab;

              return (
                <Pressable
                  key={tb.key}
                  testID={`experience-tabbar-${tb.key}`}
                  onPress={() => handleTabChange(tb.key)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 10,
                    gap: 2,
                  }}
                >
                  <Ionicons
                    name={
                      (focused
                        ? tb.icon
                        : tb.iconOutline) as keyof typeof Ionicons.glyphMap
                    }
                    size={22}
                    color={
                      focused ? theme.colors.primary : theme.colors.textMuted
                    }
                  />

                  <Text
                    variant="caption"
                    color={focused ? "primary" : "textMuted"}
                  >
                    {t(tb.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {!isPreviewMode ? (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 6,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text variant="caption" color="textMuted">
              {t("experience.poweredBy")}
            </Text>
          </View>
        ) : null}

        <Modal
          visible={referralOpen}
          onClose={() => setReferralOpen(false)}
          title={exp.referral?.headline ?? t("experience.referral")}
          testID="experience-referral-modal"
        >
          {referralProgram || exp.referral ? (
            <View style={{ gap: theme.spacing.md }}>
              <Text variant="body" color="textSecondary">
                {referralProgram?.description ?? exp.referral?.description}
              </Text>

              {referralSharePayload ? (
                <>
                  <View style={{ alignItems: "center", gap: 6 }}>
                    <Text variant="caption" color="textMuted">
                      {t("experience.referralCode")}
                    </Text>
                    <Badge
                      label={referralSharePayload.referralCode}
                      tone="brand"
                    />
                  </View>
                  <Text
                    variant="bodySmall"
                    color="textSecondary"
                    style={{ textAlign: "center" }}
                  >
                    {referralSharePayload.message}
                  </Text>
                </>
              ) : exp.referral ? (
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Text variant="caption" color="textMuted">
                    {t("experience.referralCode")}
                  </Text>
                  <Badge label={exp.referral.code} tone="brand" />
                </View>
              ) : null}

              <Text
                variant="bodySmall"
                color="primary"
                style={{ textAlign: "center" }}
              >
                {referralProgram?.referrerRewardValue != null
                  ? `Referral reward: ${referralProgram.referrerRewardValue}`
                  : exp.referral?.rewardLabel}
              </Text>
            </View>
          ) : null}
        </Modal>

        {!isPreviewMode ? (
          <Modal
            visible={!!membershipOfferQr}
            onClose={() => setMembershipOfferQr(null)}
            title="Membership purchase QR"
            testID="experience-membership-purchase-offer-qr-modal"
          >
            {membershipOfferQr ? (
              <View style={{ gap: theme.spacing.md }}>
                <Text variant="title" color="text">
                  {membershipOfferQr.displayName}
                </Text>
                <Text variant="bodySmall" color="textMuted">
                  Show this QR at the Counter to use your Membership Offer.
                </Text>
                <QrPlaceholder
                  value={membershipOfferQr.qrReference}
                  size={208}
                  caption="Present this code to the Counter."
                  testID="experience-membership-purchase-offer-qr"
                />
                <Text variant="bodySmall" color="textMuted">
                  Expires at:{" "}
                  {formatBusinessExpiry(
                    membershipOfferQr.expiresAt,
                    configuration.localization.timezone,
                    configuration.localization.defaultLanguage,
                  )}
                </Text>
                <Button
                  label="Generate new QR"
                  variant="secondary"
                  disabled={membershipOfferQrLoadingProductId !== null}
                  onPress={() => {
                    void issueMembershipPurchaseOfferQr(
                      membershipOfferQr.offerId,
                      membershipOfferQr.productId,
                    );
                  }}
                />
              </View>
            ) : null}
          </Modal>
        ) : null}

        {!isPreviewMode ? (
          <Modal
            visible={!!pendingRedemption}
            onClose={() => setPendingRedemption(null)}
            title={
              pendingRedemption?.status === "SUCCESS"
                ? "Redemption complete"
                : pendingRedemption?.status === "EXPIRED"
                  ? "Redemption expired"
                  : pendingRedemption?.status === "PENDING"
                    ? "Redemption ready"
                    : "Redemption unavailable"
            }
            testID="experience-pending-redemption-modal"
          >
            {pendingRedemption ? (
              <View style={{ gap: theme.spacing.md }}>
                {pendingRedemption.status === "PENDING" ? (
                  <>
                    <Text variant="title" color="text">
                      Redeem{" "}
                      {pendingRedemption.benefitIds.length +
                        pendingRedemption.offerIds.length}{" "}
                      item
                      {pendingRedemption.benefitIds.length +
                        pendingRedemption.offerIds.length ===
                      1
                        ? ""
                        : "s"}
                    </Text>
                    {pendingRedemption.benefitIds.length ? (
                      <View style={{ gap: 4 }}>
                        <Text variant="bodyStrong" color="text">
                          Benefits
                        </Text>
                        {pendingRedemption.benefitIds.map((id) => (
                          <Text key={id} variant="bodySmall" color="text">
                            • {benefitTitleById.get(id) ?? "Benefit"}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {pendingRedemption.offerIds.length ? (
                      <View style={{ gap: 4 }}>
                        <Text variant="bodyStrong" color="text">
                          Offers
                        </Text>
                        {pendingRedemption.offerIds.map((id) => (
                          <Text key={id} variant="bodySmall" color="text">
                            •{" "}
                            {exp.offers.find((offer) => offer.id === id)
                              ?.offerName ?? "Offer"}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    <QrPlaceholder
                      value={pendingRedemption.qrReference}
                      size={208}
                      caption="Present this code to the Counter."
                      testID="experience-pending-redemption-qr"
                    />
                    {pendingRedemption.expiresAt ? (
                      <Text variant="bodySmall" color="textMuted">
                        Expires at:{" "}
                        {formatBusinessExpiry(
                          pendingRedemption.expiresAt,
                          configuration.localization.timezone,
                          configuration.localization.defaultLanguage,
                        )}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text variant="title" color="text">
                      {pendingRedemption.status === "SUCCESS"
                        ? "Redemption successful"
                        : pendingRedemption.status === "EXPIRED"
                          ? "Redemption expired"
                          : "Redemption unavailable"}
                    </Text>
                    <Text variant="body" color="textMuted">
                      {pendingRedemption.status === "SUCCESS"
                        ? "Your redemption has been completed."
                        : pendingRedemption.status === "EXPIRED"
                          ? "This redemption code has expired. Select items again to create a new code."
                          : "This redemption could not be completed. Select items again to try later."}
                    </Text>
                    <Button
                      label="Close"
                      onPress={() => setPendingRedemption(null)}
                    />
                  </>
                )}
              </View>
            ) : null}
          </Modal>
        ) : null}
      </View>
    </BusinessThemeScope>
  );
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

function InfoRow({
  icon,
  label,
  value,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  theme: ReturnType<typeof useBusiness>["theme"];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
      }}
    >
      <Ionicons name={icon} size={18} color={theme.colors.textMuted} />

      <View style={{ flex: 1 }}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>

        <Text variant="bodySmall" color="text">
          {value}
        </Text>
      </View>
    </View>
  );
}

function PrefRow({
  label,
  on,
  t,
  theme,
  onPress,
  disabled = false,
}: {
  label: string;
  on: boolean;
  t: (path: string) => string;
  theme: ReturnType<typeof useBusiness>["theme"];
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: disabled || !onPress }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Text variant="bodySmall" color="text">
        {label}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 42,
            height: 24,
            borderRadius: 12,
            padding: 3,
            backgroundColor: on
              ? theme.colors.primary
              : theme.colors.surfaceAlt,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: theme.colors.surface,
              alignSelf: on ? "flex-end" : "flex-start",
            }}
          />
        </View>

        <View
          style={{
            backgroundColor: on
              ? theme.colors.successSoft
              : theme.colors.surfaceAlt,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: theme.radius.pill,
          }}
        >
          <Text variant="caption" color={on ? "success" : "textMuted"}>
            {on ? t("experience.on") : t("experience.off")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
