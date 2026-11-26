import {
  advertisedSavingsLabel,
  compactPotentialSavingsLabel,
  formatTransactionMoney,
  potentialSavingsAssumptions,
  potentialSavingsLabel,
  subscriptionSavingsDisplay,
  verifiedSavingsMoney,
} from "@/src/core/domain/savings-display";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useTheme } from "@/src/providers";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveThemeExperience } from "@/src/core/theme-experience.types";

import { ThemeHeaderDecoration } from "@/src/ui/domain/ThemeHeaderDecoration";

import { ThemeFeatureSection } from "@/src/ui/domain/ThemeFeatureSection";
import { MembershipPlanDetailsModal } from "@/src/ui/domain/MembershipPlanDetailsModal";
import { BusinessSavingsBanner } from "@/src/ui/domain/BusinessSavingsBanner";
import {
  getSubscriptionPeriodLabel,
  resolveJoinPlan,
} from "@/src/core/domain/membership-helpers";
import { resolveCustomerBranding } from "@/src/core/customer/resolve-customer-branding";
import { DecorativeThemeFrame } from "@/src/ui/domain/DecorativeThemeFrame";
import {
  MembershipAgreementApi,
  type MembershipAgreementAcceptance,
} from "@/src/data/api/membership-agreement-api";
import { MembershipAgreementHistoryLink } from "@/src/ui/domain/MembershipAgreementHistoryLink";
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
  SubscriptionPlan,
  TemplateDefaultContent,
} from "@/src/core";

import { services } from "@/src/core";
import { trackActivity } from "@/src/core/services/activity-audit";
import { resolveAssetUrl } from "@/src/data/api/asset-url";
import {
  CustomerDataApi,
  type CustomerFulfillment,
  type CustomerFulfillmentPayment,
  type CustomerRedemptionItemStatus,
  type BusinessActualSavings,
  type TransactionHistoryItem,
  type TransactionReceipt,
} from "@/src/data/api/customer-data-api";
import {
  CustomerFulfillmentSummary,
  fulfillmentIsTerminal,
} from "@/src/ui/domain/CustomerFulfillmentFlow";
import {
  CustomerActiveOrders,
  ReservationLinks,
  useCustomerFulfillmentActivity,
} from "@/src/ui/domain/CustomerActiveOrders";
import {
  activeCounterQrForSelection,
  entitlementUnavailableLabel,
  redemptionContentWidth,
} from "@/src/ui/domain/fulfillment-presentation";
import {
  storeConflictMessage,
  type FulfillmentStoreName,
} from "@/src/ui/domain/fulfillment-store-eligibility";
import { TransactionReceiptViewer } from "@/src/ui/domain/TransactionReceiptViewer";
import {
  groupCustomerOrders,
  transactionSummary,
  transactionReceiptCaption,
  transactionTypeLabel,
} from "@/src/ui/domain/transaction-history-display";
import {
  BusinessThemeScope,
  useBusiness,
  useTranslation,
} from "@/src/providers";
import { buildTheme } from "@/src/theme/theme";
import { readableForegroundOnSurface } from "@/src/theme/color-utils";
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

import { AnnouncementDisplay } from "./announcements/AnnouncementDisplay";
import { resolveAnnouncementConfiguration } from "./announcements/announcement-model";

function formatPhoneNumber(
  phone?: OrganizationDetails["supportPhone"],
): string {
  if (!phone) return "";
  return [phone.callingCode, phone.number].filter(Boolean).join(" ").trim();
}

const customerTransactionApi = new CustomerDataApi();

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
  scrollableMobileWebHeader?: boolean;
  benefits: Benefit[];
  historyBenefits?: Benefit[];
  offers: Offer[];
  membershipPurchaseOffers?: {
    offerId: string;
    displayName: string;
    applicableMembershipProductIds: string[];
  }[];
  stores: Store[];
  redemptions: Redemption[];
  historyRedemptions?: Redemption[];
  benefitUsageRules?: BenefitUsageRule[];
  offerUsageRules?: OfferUsageRule[];
  redemptionItemStatuses?: CustomerRedemptionItemStatus[];

  memberships: {
    subscription: Subscription;
    product: MembershipProduct;
  }[];
  historyMemberships?: Props["memberships"];

  selectedSubscriptionId: string;
  onSelectSubscription: (subscriptionId: string) => void;
  /**
   * Displays a historical subscription in read-only mode.
   * No redemption or membership entitlement actions are exposed.
   */

  availableMemberships: MembershipProduct[];
  detailsCatalog?: MembershipProduct[];
  planDetailsProductId?: string;
  planDetailsPlanId?: string;
  onExploreMembership?: (productId: string, planId: string) => void;
  showAvailableMembershipsFirst?: boolean;
  publicDiscoveryNavigation?: boolean;

  onJoin: (productId: string, planId?: string) => void;
  onUseMembershipPurchaseOffer?: (
    offerId: string,
    displayName: string,
    productId: string,
    planId?: string,
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

const customerOrderReference = (order: TransactionHistoryItem): string => {
  if (order.transactionNumber && !order.transactionNumber.startsWith("RCP-")) {
    return order.transactionNumber;
  }

  const suffix = order.transactionId.replace(/-/g, "").slice(-8).toUpperCase();

  return `ORDER-${suffix}`;
};

type HeroImageProps = {
  uri?: string;
  height?: number;
  borderRadius: number;
  backgroundColor: string;
};

function HeroImage({
  uri,
  height = 168,
  borderRadius,
  backgroundColor,
}: HeroImageProps) {
  const resolvedUri = resolveAssetUrl(uri);

  return resolvedUri ? (
    <Image
      source={{ uri: resolvedUri }}
      resizeMode="cover"
      style={{
        width: "100%",
        height,
        borderRadius,
        backgroundColor,
      }}
    />
  ) : null;
}
function MembershipExploreHighlighter({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const theme = useTheme();

  if (count <= 0) return null;

  return (
    <Pressable
      testID="experience-explore-memberships"
      accessibilityRole="button"
      accessibilityLabel={`Explore ${count} available memberships`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primarySoft,
        opacity: pressed ? theme.states.pressedOpacity : 1,
      })}
    >
      <Ionicons name="sparkles" size={17} color={theme.colors.primary} />

      <Text variant="label" color="primary">
        Explore
      </Text>

      <View
        style={{
          minWidth: 22,
          height: 22,
          paddingHorizontal: 5,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: theme.colors.primary,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <Text variant="caption" color="primary">
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

export function BusinessExperience({
  content,
  previewProductStoreIds,
  subscription,
  subscriptionStatus,
  product,
  benefits,
  historyBenefits = benefits,
  offers,
  membershipPurchaseOffers = [],
  stores,
  redemptions,
  historyRedemptions = redemptions,
  benefitUsageRules,
  offerUsageRules,
  redemptionItemStatuses = [],
  memberships,
  historyMemberships = memberships,
  selectedSubscriptionId,
  onSelectSubscription,
  availableMemberships,
  detailsCatalog = availableMemberships,
  planDetailsProductId,
  planDetailsPlanId,
  onExploreMembership,
  showAvailableMembershipsFirst = false,
  scrollableMobileWebHeader = false,
  publicDiscoveryNavigation = false,
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
  const router = useRouter();
  const refreshOnFulfillmentReturn = useRef(false);
  const isPreviewMode = renderMode !== "customer";
  // Reference-data status code determines entitlement; the display label
  // remains sourced from subscriptionStatus.statusName.
  const isHistoricalSubscription =
    !isPreviewMode &&
    Boolean(subscription) &&
    subscriptionStatus?.statusCode?.toUpperCase() !== "ACTIVE";
  const exploreMembershipCount = new Set(
    availableMemberships.map((membership) => membership.id),
  ).size;
  const hasActiveCustomerMembership =
    !isPreviewMode && Boolean(subscription) && !isHistoricalSubscription;

  const displayAvailableMembershipsFirst =
    showAvailableMembershipsFirst && !hasActiveCustomerMembership;

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
  const selectedPlan = product?.plans.find(
    (plan) => plan.id === subscription?.subscriptionPlanId,
  );
  const selectedPlanSavings = selectedPlan?.potentialSavings;
  const detailsProduct = detailsCatalog.find(
    (item) => item.id === planDetailsProductId,
  );
  const availableDetailsProduct = availableMemberships.find(
    (item) => item.id === planDetailsProductId,
  );
  const detailsPlan = resolveJoinPlan(
    planDetailsPlanId
      ? detailsProduct
      : (availableDetailsProduct ?? detailsProduct),
    planDetailsPlanId,
  );
  const isPlanExploration = !isPreviewMode && Boolean(planDetailsProductId);
  const insets = useSafeAreaInsets();

  /**
   * The actual customer renderer can receive a proposed organization/details
   * while leaving the rest of the application context untouched.
   */
  const organization = organizationOverride ?? contextOrganization;

  const [acceptedAgreements, setAcceptedAgreements] = useState<
    MembershipAgreementAcceptance[]
  >([]);
  useEffect(() => {
    if (isPreviewMode || !customerUserId) {
      setAcceptedAgreements([]);
      return;
    }
    let active = true;
    setAcceptedAgreements([]);
    new MembershipAgreementApi()
      .history(organization.id)
      .then((result) => {
        if (active && result.success) setAcceptedAgreements(result.data);
      })
      .catch(() => {
        if (active) setAcceptedAgreements([]);
      });
    return () => {
      active = false;
    };
  }, [customerUserId, organization.id, isPreviewMode]);

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
      themeExperience: brandingOverride?.themeExperience ?? null,
      announcementEnabled: brandingOverride?.announcementEnabled,
      announcementMessage: brandingOverride?.announcementMessage,
      announcementStyle: brandingOverride?.announcementStyle,
      announcementBackgroundColor:
        brandingOverride?.announcementBackgroundColor,
      announcementTextColor: brandingOverride?.announcementTextColor,
      announcementLinkUrl: brandingOverride?.announcementLinkUrl,
      announcementStartsAt: brandingOverride?.announcementStartsAt,
      announcementEndsAt: brandingOverride?.announcementEndsAt,
      announcementConfiguration: brandingOverride?.announcementConfiguration,
    }),
    [definitionResolvedBranding, brandingOverride],
  );

  const themeExperience = useMemo(
    () => resolveThemeExperience(resolvedBranding.themeExperience),
    [resolvedBranding.themeExperience],
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
  // Both proposed preview and customer views use the same released configuration contract.
  const announcementConfiguration = useMemo(
    () => resolveAnnouncementConfiguration(resolvedBranding),
    [resolvedBranding],
  );
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
  const effectiveTab = activeTab ?? tab;
  const focused = useIsFocused();
  const [referralOpen, setReferralOpen] = useState(false);
  const [selectedAvailablePlan, setSelectedAvailablePlan] = useState<{
    membership: MembershipProduct;
    plan: SubscriptionPlan;
  } | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historySubscriptionId, setHistorySubscriptionId] = useState<
    string | null
  >(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const activity = useCustomerFulfillmentActivity(
    organization.id,
    subscription?.id,
    !isPreviewMode && !!customerUserId && focused,
    historyRefresh,
  );
  const [pendingFulfillmentPayment, setPendingFulfillmentPayment] =
    useState<CustomerFulfillmentPayment | null>(null);
  const [fulfillmentOffset, setFulfillmentOffset] = useState(0);
  const [fulfillmentHistory, setFulfillmentHistory] = useState<{
    key: string;
    rows: CustomerFulfillment[];
    hasMore: boolean;
  }>({ key: "", rows: [], hasMore: false });
  const [fulfillmentHistoryFailure, setFulfillmentHistoryFailure] =
    useState(false);
  const [fulfillmentHistoryLoading, setFulfillmentHistoryLoading] =
    useState(false);
  const [orders, setOrders] = useState<{
    key: string;
    rows: TransactionHistoryItem[];
  }>({ key: "", rows: [] });
  const [orderOffset, setOrderOffset] = useState(0);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderReceipt, setOrderReceipt] = useState<TransactionReceipt | null>(
    null,
  );
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const receiptRequest = useRef(0);
  const mainScroll = useRef<ScrollView>(null);
  const availableMembershipsRef = useRef<View>(null);
  const orderScope = JSON.stringify([
    organization.id,
    customerUserId,
    historyRefresh,
  ]);
  const activeFulfillmentVersions = activity?.orders.map(({ id, version }) => [
    id,
    version,
  ]);
  const fulfillmentHistoryScope = JSON.stringify([
    orderScope,
    historySubscriptionId,
    activeFulfillmentVersions,
  ]);
  const businessSavingsScope = JSON.stringify([
    organization.id,
    customerUserId,
  ]);
  const [businessSavingsResult, setBusinessSavingsResult] = useState<{
    key: string;
    data?: BusinessActualSavings;
    error?: boolean;
  }>();
  const scopedRedemptions = useMemo(
    () =>
      historySubscriptionId
        ? historyRedemptions.filter(
            (entry) => entry.subscriptionId === historySubscriptionId,
          )
        : historyRedemptions,
    [historyRedemptions, historySubscriptionId],
  );

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setHistorySubscriptionId(null);
    setOrderOffset(0);
    setOrderReceipt(null);
    setReceiptError(null);
    setPendingFulfillmentPayment(null);
    return () => {
      receiptRequest.current += 1;
    };
  }, [organization.id, customerUserId]);

  useEffect(() => {
    const id = subscription?.id;
    if (!id || !customerUserId || !focused || isPreviewMode) return;
    let live = true;
    void customerTransactionApi
      .pendingFulfillmentPayment(organization.id, id)
      .then((result) => {
        if (live && result.success)
          setPendingFulfillmentPayment(result.data.payment ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [
    customerUserId,
    focused,
    isPreviewMode,
    organization.id,
    subscription?.id,
  ]);

  useEffect(() => {
    if (!focused || !refreshOnFulfillmentReturn.current) return;
    refreshOnFulfillmentReturn.current = false;
    setOrderOffset(0);
    setHistoryRefresh((value) => value + 1);
    void onRefreshRedemptionState?.();
  }, [focused, onRefreshRedemptionState]);

  const openFulfillment = (
    view: "details" | "payment",
    id: string,
    subscriptionId = subscription?.id,
  ) => {
    if (!subscriptionId || isPreviewMode) return;
    refreshOnFulfillmentReturn.current = true;
    router.push({
      pathname: "/business/fulfillment",
      params: { org: organization.id, subscription: subscriptionId, view, id },
    });
  };
  const openCounterQr = (id: string) => {
    if (!subscription?.id || isPreviewMode) return;
    refreshOnFulfillmentReturn.current = true;
    router.push({
      pathname: "/business/fulfillment",
      params: {
        org: organization.id,
        subscription: subscription.id,
        view: "qr",
        id,
      },
    });
  };

  useEffect(() => {
    setFulfillmentOffset(0);
  }, [fulfillmentHistoryScope]);

  useEffect(() => {
    if (!focused || effectiveTab !== "history") setFulfillmentOffset(0);
  }, [effectiveTab, focused]);

  useEffect(() => {
    if (
      isPreviewMode ||
      !customerUserId ||
      !focused ||
      effectiveTab !== "history"
    )
      return;
    if (
      fulfillmentOffset > 0 &&
      fulfillmentHistory.key !== fulfillmentHistoryScope
    )
      return;
    let live = true;
    setFulfillmentHistoryLoading(true);
    setFulfillmentHistoryFailure(false);
    void customerTransactionApi
      .fulfillments(organization.id, historySubscriptionId, fulfillmentOffset)
      .then((result) => {
        if (!live) return;
        if (!result.success) throw new Error(result.error.message);
        setFulfillmentHistory((previous) => {
          const initial =
            fulfillmentOffset && previous.key === fulfillmentHistoryScope
              ? previous.rows
              : [];
          const rows = [
            ...new Map(
              [...initial, ...result.data].map((item) => [item.id, item]),
            ).values(),
          ];
          return {
            key: fulfillmentHistoryScope,
            rows,
            hasMore: result.data.length === 25,
          };
        });
      })
      .catch(() => {
        if (live) setFulfillmentHistoryFailure(true);
      })
      .finally(() => {
        if (live) setFulfillmentHistoryLoading(false);
      });
    return () => {
      live = false;
    };
  }, [
    customerUserId,
    effectiveTab,
    focused,
    fulfillmentHistoryScope,
    fulfillmentOffset,
    historySubscriptionId,
    isPreviewMode,
    organization.id,
  ]);

  useEffect(() => {
    if (isPreviewMode || !customerUserId || effectiveTab !== "history") return;
    let cancelled = false;
    const limit = 25;
    const loadOrders = async () => {
      setOrdersLoading(true);
      setOrdersError(null);
      try {
        const result = await customerTransactionApi.transactionHistory(
          organization.id,
          { limit, offset: orderOffset },
        );
        if (cancelled) return;
        if (!result.success) throw new Error(result.error.message);
        setOrders((previous) => ({
          key: orderScope,
          rows:
            orderOffset && previous.key === orderScope
              ? [...previous.rows, ...result.data]
              : result.data,
        }));
        setHasMoreOrders(result.data.length === limit);
      } catch {
        if (!cancelled) setOrdersError("Unable to load orders.");
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    };
    void loadOrders();
    return () => {
      cancelled = true;
    };
  }, [
    customerUserId,
    effectiveTab,
    isPreviewMode,
    orderOffset,
    orderScope,
    organization.id,
  ]);

  useEffect(() => {
    if (isPreviewMode || !customerUserId || !focused) return;
    let cancelled = false;
    setBusinessSavingsResult({ key: businessSavingsScope });
    void customerTransactionApi
      .businessActualSavings(organization.id)
      .then((result) => {
        if (!cancelled)
          setBusinessSavingsResult(
            result.success
              ? { key: businessSavingsScope, data: result.data }
              : { key: businessSavingsScope, error: true },
          );
      })
      .catch(() => {
        if (!cancelled)
          setBusinessSavingsResult({ key: businessSavingsScope, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [
    businessSavingsScope,
    customerUserId,
    focused,
    historyRefresh,
    isPreviewMode,
    organization.id,
  ]);

  // The business response already contains each owned membership's verified
  // currency amounts and coverage. Reuse it instead of recalculating savings
  // with a second subscription-specific HTTP request.
  const currentBusinessSavings =
    businessSavingsResult?.key === businessSavingsScope
      ? businessSavingsResult
      : undefined;
  const savingsRows = (currentBusinessSavings?.data?.memberships ?? [])
    .filter((row) => row.subscriptionId === subscription?.id)
    .map((row) => ({
      ...row,
      // The membership display uses netSavingsMinor for COMPLETE rows.
      // A COMPLETE verified amount is the authoritative net amount; PARTIAL
      // rows continue to use verifiedNetSavingsMinor without claiming a total.
      netSavingsMinor:
        row.coverageState === "COMPLETE"
          ? row.verifiedNetSavingsMinor
          : undefined,
    }));
  const actualSavings = subscriptionSavingsDisplay(savingsRows);
  const actualSavingsMessage = !currentBusinessSavings
    ? "Loading savings…"
    : currentBusinessSavings.error
      ? "Unable to load savings"
      : actualSavings.incomplete && !actualSavings.partial.length
        ? "Savings history incomplete"
        : actualSavings.complete.length || actualSavings.partial.length
          ? undefined
          : savingsRows.some(
                (row) => row.coverageState === "NO_REDEMPTION_HISTORY",
              )
            ? "No completed redemptions yet"
            : "Savings unavailable";

  const openOrderReceipt = async (
    order: Pick<TransactionHistoryItem, "organizationId" | "receiptId">,
  ) => {
    if (!order.receiptId) return;
    const request = ++receiptRequest.current;
    setReceiptError(null);
    try {
      const result = await customerTransactionApi.receipt(
        order.organizationId,
        order.receiptId,
      );
      if (request !== receiptRequest.current) return;
      if (result.success) setOrderReceipt(result.data);
      else setReceiptError(result.error.message);
    } catch {
      if (request === receiptRequest.current)
        setReceiptError("Unable to load receipt.");
    }
  };
  const receiptSavings =
    orderReceipt?.receiptKind === "COUNTER_REDEMPTION" &&
    orderReceipt.actualSavings?.transactionId ===
      orderReceipt.sourceTransactionId
      ? verifiedSavingsMoney(orderReceipt.actualSavings)
      : undefined;
  const historySelector =
    !isPreviewMode && effectiveTab === "history" && !previewSection;
  const selectorMemberships = historySelector
    ? historyMemberships
    : memberships;

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

  const handleTabChange = (
    nextTab: ExperienceTabKey,
    historyId: string | null = null,
  ) => {
    if (nextTab === "history") {
      setHistorySubscriptionId(historyId);
      setShowAllHistory(false);
      setOrderOffset(0);
      setHistoryRefresh((current) => current + 1);
      mainScroll.current?.scrollTo({ y: 0, animated: false });
    }
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
        redemptions:
          effectiveTab === "history" ? scopedRedemptions : redemptions,
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
      scopedRedemptions,
      effectiveTab,
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

  const [selectedBenefitIds, setSelectedBenefitIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(
    new Set(),
  );
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
        (activity?.itemStatuses ?? redemptionItemStatuses).map((item) => [
          `${item.itemType}:${item.itemId}`,
          item,
        ]),
      ),
    [activity, redemptionItemStatuses],
  );
  const reservationsFor = (kind: "BENEFIT" | "OFFER", id: string) =>
    activity?.reservations.filter(
      (item) => item.itemType === kind && item.itemId === id,
    ) ?? [];
  const counterQrs = activity?.counterQrs ?? [];
  const counterQrFor = (kind: "BENEFIT" | "OFFER", id: string) =>
    activeCounterQrForSelection(
      counterQrs,
      kind === "BENEFIT" ? [id] : [],
      kind === "OFFER" ? [id] : [],
    );
  const reservationCustomerLabels = Object.fromEntries(
    (activity?.orders ?? []).map((order) => [order.id, order.customerLabel]),
  );
  const redemptionContent = {
    width: "100%" as const,
    maxWidth: redemptionContentWidth,
    alignSelf: "center" as const,
  };
  const customerSectionContent =
    Platform.OS === "web" && !isPreviewMode
      ? {
          width: "100%" as const,
          alignSelf: "stretch" as const,
        }
      : redemptionContent;
  const renderReservations = (
    kind: "BENEFIT" | "OFFER",
    id: string,
    unavailable: boolean,
  ) => {
    const counterQr = counterQrFor(kind, id);
    return (
      <>
        {counterQr ? (
          <View
            style={{ gap: 4, alignItems: "flex-start", paddingVertical: 4 }}
          >
            <Text variant="bodySmall" color="textMuted">
              Redemption in progress — {counterQr.transactionNumber}
            </Text>
            <Button
              label="View Existing QR"
              size="sm"
              variant="outline"
              onPress={() => openCounterQr(counterQr.transactionId)}
            />
          </View>
        ) : null}
        <ReservationLinks
          reservations={reservationsFor(kind, id)}
          available={!unavailable && !counterQr}
          customerLabels={reservationCustomerLabels}
          onOpen={(fulfillmentId) => openFulfillment("details", fulfillmentId)}
        />
      </>
    );
  };
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
  // Product mapping details are informational. Fulfillment eligibility is checked separately.
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
    ({ benefit, itemStatus }) =>
      itemStatus.status === "AVAILABLE" && !counterQrFor("BENEFIT", benefit.id),
  );
  const selectableOffers = offerItems.filter(
    ({ offer, itemStatus }) =>
      itemStatus.status === "AVAILABLE" && !counterQrFor("OFFER", offer.id),
  );
  const redeemSectionBenefits = benefitItems;
  const redeemSectionOffers = offerItems.filter(
    ({ offer, itemStatus }) =>
      (itemStatus.status !== "NOT_APPLICABLE" &&
        itemStatus.status !== "INACTIVE") ||
      reservationsFor("OFFER", offer.id).length > 0 ||
      !!counterQrFor("OFFER", offer.id),
  );
  const redeemSectionTitle =
    redeemSectionBenefits.length && redeemSectionOffers.length
      ? "Redeem Benefits & Offers"
      : redeemSectionOffers.length
        ? "Redeem Offers"
        : "Redeem Benefits";
  const redeemSectionSummary = [
    redeemSectionBenefits.length
      ? `${redeemSectionBenefits.length} Benefit${redeemSectionBenefits.length === 1 ? "" : "s"}`
      : null,
    redeemSectionOffers.length
      ? `${redeemSectionOffers.length} Offer${redeemSectionOffers.length === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const offersTabItems = offerItems.filter(
    ({ offer, itemStatus }) =>
      (itemStatus.status !== "NOT_APPLICABLE" &&
        itemStatus.status !== "INACTIVE") ||
      reservationsFor("OFFER", offer.id).length > 0 ||
      !!counterQrFor("OFFER", offer.id),
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
  const eligibilityScope = JSON.stringify([
    organization.id,
    subscription?.id,
    customerUserId,
  ]);
  const eligibilityItems = JSON.stringify(
    [
      ...selectableBenefits.map(({ benefit }) => `BENEFIT:${benefit.id}`),
      ...selectableOffers.map(({ offer }) => `OFFER:${offer.id}`),
    ].sort(),
  );
  const [itemStores, setItemStores] = useState<{
    scope: string;
    values: Record<string, FulfillmentStoreName[]>;
  }>();
  const currentItemStores =
    itemStores?.scope === eligibilityScope ? itemStores.values : {};
  const showStoreEligibility =
    effectiveTab === "card" || effectiveTab === "offers";
  useEffect(() => {
    if (
      !focused ||
      !showStoreEligibility ||
      isPreviewMode ||
      isHistoricalSubscription ||
      !customerUserId ||
      !subscription?.id
    )
      return;
    const subscriptionId = subscription.id;
    const keys = JSON.parse(eligibilityItems) as string[];
    let live = true;
    setItemStores({ scope: eligibilityScope, values: {} });
    void (async () => {
      // Bound concurrent calls while reusing the same Store policy and pricing checks as the basket.
      for (let offset = 0; live && offset < keys.length; offset += 4) {
        const results = await Promise.allSettled(
          keys.slice(offset, offset + 4).map(async (key) => {
            const isBenefit = key.startsWith("BENEFIT:");
            const id = key.slice(key.indexOf(":") + 1);
            const result = await customerTransactionApi.fulfillmentStores(
              organization.id,
              {
                subscriptionId,
                benefitIds: isBenefit ? [id] : [],
                offerIds: isBenefit ? [] : [id],
              },
            );
            return result.success
              ? { [key]: result.data.map(({ id, name }) => ({ id, name })) }
              : {};
          }),
        );
        if (!live) return;
        const values = Object.assign(
          {},
          ...results.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
          ),
        );
        setItemStores((previous) => ({
          scope: eligibilityScope,
          values: { ...previous?.values, ...values },
        }));
      }
    })();
    return () => {
      live = false;
    };
  }, [
    customerUserId,
    eligibilityItems,
    eligibilityScope,
    focused,
    isHistoricalSubscription,
    isPreviewMode,
    organization.id,
    showStoreEligibility,
    subscription?.id,
  ]);

  const itemStoreLabel = (key: string) => {
    const eligible = currentItemStores[key];
    return (
      eligible &&
      (eligible.length
        ? `Eligible Stores: ${eligible.map(({ name }) => name).join(", ")}`
        : "No eligible Store")
    );
  };
  const redeemOfferAvailability = (offer: Offer) =>
    isPreviewMode
      ? offerAvailabilityText(offer)
      : [offer.availabilityText, itemStoreLabel(`OFFER:${offer.id}`)]
          .filter(Boolean)
          .join("\n");
  const [storeCheck, setStoreCheck] = useState<{
    key: string;
    pending?: boolean;
    message?: string;
  }>();
  const basketKey = (scope: "ALL" | "OFFERS") =>
    JSON.stringify([
      eligibilityScope,
      scope,
      scope === "ALL"
        ? selectableBenefits
            .filter(({ benefit }) => selectedBenefitIds.has(benefit.id))
            .map(({ benefit }) => benefit.id)
        : [],
      selectableOffers
        .filter(({ offer }) => selectedOfferIds.has(offer.id))
        .map(({ offer }) => offer.id),
    ]);
  const basketKeys = { ALL: basketKey("ALL"), OFFERS: basketKey("OFFERS") };
  const activeBasket = useRef({
    focused,
    keys: basketKeys,
    tab: effectiveTab,
    itemStores: currentItemStores,
  });
  activeBasket.current = {
    focused,
    keys: basketKeys,
    tab: effectiveTab,
    itemStores: currentItemStores,
  };
  const pendingStoreCheck = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      pendingStoreCheck.current = undefined;
    },
    [],
  );
  const checkFor = (scope: "ALL" | "OFFERS") =>
    storeCheck?.key === basketKeys[scope] ? storeCheck : undefined;
  const openRedemptionSelection = async (scope: "ALL" | "OFFERS") => {
    if (!subscription || isPreviewMode || isHistoricalSubscription) return;
    const selectedBenefits =
      scope === "ALL"
        ? selectableBenefits
            .map(({ benefit }) => benefit)
            .filter((item) => selectedBenefitIds.has(item.id))
        : [];
    const selectedOffers = selectableOffers
      .map(({ offer }) => offer)
      .filter((item) => selectedOfferIds.has(item.id));
    if (!selectedBenefits.length && !selectedOffers.length) return;
    const key = basketKeys[scope];
    if (pendingStoreCheck.current === key) return;
    pendingStoreCheck.current = key;
    setStoreCheck({ key, pending: true });
    const benefitIds = selectedBenefits.map((item) => item.id);
    const offerIds = selectedOffers.map((item) => item.id);
    const labels: [string, string][] = [
      ...selectedBenefits.map((item): [string, string] => [
        "BENEFIT:" + item.id,
        item.displayName ?? item.benefitName,
      ]),
      ...selectedOffers.map((item): [string, string] => [
        "OFFER:" + item.id,
        item.offerName,
      ]),
    ];
    const isCurrent = () =>
      pendingStoreCheck.current === key &&
      activeBasket.current.focused &&
      activeBasket.current.tab === effectiveTab &&
      activeBasket.current.keys[scope] === key;
    try {
      const result = await customerTransactionApi.fulfillmentStores(
        organization.id,
        { subscriptionId: subscription.id, benefitIds, offerIds },
      );
      if (!isCurrent()) return;
      if (!result.success)
        throw new Error("Could not check Store availability. Try again.");
      if (!result.data.length) {
        setStoreCheck({
          key,
          message: storeConflictMessage(
            labels,
            activeBasket.current.itemStores,
          ),
        });
        return;
      }
      setStoreCheck(undefined);
      refreshOnFulfillmentReturn.current = true;
      router.push({
        pathname: "/business/fulfillment",
        params: {
          org: organization.id,
          subscription: subscription.id,
          view: "selection",
          benefits: benefitIds.join(","),
          offers: offerIds.join(","),
          labels: JSON.stringify(Object.fromEntries(labels)),
          storeNames: JSON.stringify(storeNamesById),
          storeAddresses: JSON.stringify(
            Object.fromEntries(
              stores.map(({ id, address }) => [
                id,
                [address?.line1, address?.city, address?.region]
                  .filter(Boolean)
                  .join(", "),
              ]),
            ),
          ),
          storeImage: resolvedBranding.logoUrl ?? "",
          artwork: JSON.stringify(
            Object.fromEntries(
              selectedOffers
                .filter(({ promotionImageUrl }) => promotionImageUrl)
                .map(({ id, promotionImageUrl }) => [
                  `OFFER:${id}`,
                  promotionImageUrl,
                ]),
            ),
          ),
        },
      });
    } catch {
      if (isCurrent())
        setStoreCheck({
          key,
          message: "Could not check Store availability. Try again.",
        });
    } finally {
      if (pendingStoreCheck.current === key) {
        pendingStoreCheck.current = undefined;
        setStoreCheck((previous) =>
          previous?.key === key && previous.pending ? undefined : previous,
        );
      }
    }
  };
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

  const renderPromotionCard = (
    promo: NonNullable<typeof exp.heroPromotion>,
  ) => (
    <Card padding="none" style={{ overflow: "hidden", borderRadius: 22 }}>
      <HeroImage
        uri={heroImageUrl?.trim() || promo.imageUrl}
        borderRadius={theme.radius.lg}
        backgroundColor={theme.colors.surfaceAlt}
      />
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

  const joinPlan = (membership: MembershipProduct, plan: SubscriptionPlan) => {
    const offer = membershipOfferForProduct(membership.id);
    trackActivity("BUY_MEMBERSHIP_CLICKED", {
      organizationId: organization.id,
      membershipProductId: membership.id,
    });

    if (offer && onUseMembershipPurchaseOffer) {
      onUseMembershipPurchaseOffer(
        offer.offerId,
        offer.displayName,
        membership.id,
        plan.id,
      );
    } else {
      onJoin(membership.id, plan.id);
    }
  };

  const detailsOffer = detailsProduct
    ? membershipOfferForProduct(detailsProduct.id)
    : undefined;
  const detailsCanJoin =
    !!detailsPlan &&
    !!availableDetailsProduct?.plans.some((plan) => plan.id === detailsPlan.id);
  const planPrice = (plan: SubscriptionPlan) =>
    formatTransactionMoney(plan.price.amountMinor, plan.price.currency) ??
    "Price unavailable";
  const overviewBenefits = isPlanExploration
    ? historyBenefits.filter((benefit) =>
        detailsProduct?.benefitIds.includes(benefit.id),
      )
    : exp.benefits;
  const planOffers =
    isPlanExploration && detailsProduct && detailsPlan
      ? regularOffers.filter(
          (offer) =>
            !offer.membershipProductId ||
            offer.membershipProductId === detailsProduct.id,
        )
      : [];
  const planPurchaseOffers =
    isPlanExploration && detailsProduct && detailsPlan
      ? membershipPurchaseOffers.filter((offer) =>
          offer.applicableMembershipProductIds.includes(detailsProduct.id),
        )
      : [];
  const participatingStores = (benefit: Benefit) => {
    const availability = benefit.storeAvailability;
    return availability
      ? stores
          .filter(
            (store) =>
              availability.mode === "ALL_STORES" ||
              availability.storeIds.includes(store.id),
          )
          .map((store) => store.name)
      : undefined;
  };
  const availableMembershipsSection =
    !isPreviewMode &&
    !isPlanExploration &&
    (availableMemberships.length > 0 || showAvailableMembershipsFirst) ? (
      <Section
        titleColor={pageTextColor}
        title={t("experience.availableMemberships")}
      >
        <View style={{ gap: theme.spacing.md }}>
          {!availableMemberships.length && (
            <Text variant="bodySmall" color="textMuted">
              No other published memberships are available.
            </Text>
          )}
          {availableMemberships.map((membership) => {
            const offer = membershipOfferForProduct(membership.id);
            const name =
              membership.displayName ?? membership.membershipProductName;
            return (
              <View key={membership.id} style={{ gap: theme.spacing.sm }}>
                {membership.plans.map((plan) => {
                  const savings = compactPotentialSavingsLabel(
                    plan.potentialSavings,
                  );
                  const price = planPrice(plan);
                  const duration = getSubscriptionPeriodLabel(plan);
                  return (
                    <Card
                      key={plan.id}
                      testID={`experience-available-${membership.id}-${plan.id}`}
                      padding="none"
                    >
                      <View style={{ position: "relative" }}>
                        <Pressable
                          accessibilityRole="button"
                          focusable
                          accessibilityLabel={`${name}, ${plan.subscriptionPlanName}, ${price}, ${duration}${savings ? `, ${savings}` : ""}`}
                          accessibilityHint="Opens membership details"
                          testID={`experience-open-membership-${plan.id}`}
                          onPress={() =>
                            setSelectedAvailablePlan({ membership, plan })
                          }
                          style={({ pressed }) => [
                            StyleSheet.absoluteFillObject,
                            {
                              backgroundColor: pressed
                                ? theme.colors.primarySoft
                                : "transparent",
                            },
                          ]}
                        />
                        <View
                          pointerEvents="box-none"
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: theme.spacing.sm,
                            padding: theme.spacing.lg,
                          }}
                        >
                          <View
                            pointerEvents="none"
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                            style={{
                              flex: 1,
                              minWidth: 140,
                              gap: theme.spacing.xs,
                            }}
                          >
                            <Text variant="bodyStrong">
                              {name} · {plan.subscriptionPlanName}
                            </Text>
                            {membership.description && (
                              <Text variant="bodySmall" color="textMuted">
                                {membership.description}
                              </Text>
                            )}
                            <Text variant="bodySmall" color="primary">
                              {price} · {duration}
                            </Text>
                            {savings && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <MaterialCommunityIcons
                                  name="piggy-bank"
                                  size={22}
                                  color="#E88BA7"
                                />
                                <Text
                                  variant="bodySmall"
                                  style={{ flexShrink: 1 }}
                                >
                                  {savings}
                                </Text>
                              </View>
                            )}
                            {offer && (
                              <Text variant="label" color="primary">
                                {offer.displayName}
                              </Text>
                            )}
                          </View>
                          <View pointerEvents="auto" collapsable={false}>
                            <Button
                              label={
                                offer ? "Join with Offer" : t("experience.join")
                              }
                              size="sm"
                              onPress={() => joinPlan(membership, plan)}
                              disabled={Boolean(
                                offer && !onUseMembershipPurchaseOffer,
                              )}
                              testID={`experience-join-${plan.id}`}
                            />
                          </View>
                        </View>
                      </View>
                    </Card>
                  );
                })}
                {offer && (
                  <View
                    style={{ gap: theme.spacing.xs, alignItems: "flex-start" }}
                  >
                    <Button
                      label={
                        membershipOfferQrLoadingProductId === membership.id
                          ? "Generating QR…"
                          : "Show QR at Store"
                      }
                      size="sm"
                      variant="outline"
                      disabled={membershipOfferQrLoadingProductId !== null}
                      onPress={() => {
                        void issueMembershipPurchaseOfferQr(
                          offer.offerId,
                          membership.id,
                        );
                      }}
                      testID={`experience-membership-offer-${offer.offerId}-qr`}
                    />
                    <Text variant="caption" color="textMuted">
                      QR expires 5 minutes after it is generated.
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </Section>
    ) : null;

  const renderExperienceOffer = (
    offer: Offer,
    itemStatus?: ReturnType<typeof statusFor>,
  ) => (
    <DecorativeThemeFrame
      key={offer.id}
      imageUrl={resolvedBranding.decoration?.cardBackgroundImageUrl ?? null}
      primaryColor={theme.colors.primary}
      accentColor={theme.colors.accent}
      variant="content"
      decoration={resolvedBranding.decoration}
    >
      <OfferCard
        products={offer.products}
        decorative={Boolean(
          resolvedBranding.decoration?.cardBackgroundImageUrl &&
          resolvedBranding.decoration?.cardTreatment === "IMAGE_OVERLAY",
        )}
        offerId={offer.id}
        testID={`experience-offer-${offer.id}`}
        title={offer.offerName}
        description={offer.description}
        advertisedSavings={offer.advertisedSavings}
        imageUrl={offer.promotionImageUrl}
        badge={offer.badgeText}
        availabilityText={
          itemStatus ? redeemOfferAvailability(offer) : offer.availabilityText
        }
        disclaimerText={offer.disclaimerText}
        applicableProducts={offer.products?.map(
          (product) => product.productName || product.productCode,
        )}
        discountPercentage={offer.discountPercentage}
        ctaLabel={
          !itemStatus || counterQrFor("OFFER", offer.id)
            ? undefined
            : isPreviewMode
              ? offer.ctaLabel
              : !isHistoricalSubscription && itemStatus.status === "AVAILABLE"
                ? selectedOfferIds.has(offer.id)
                  ? "Remove from redemption"
                  : "Add to redemption"
                : entitlementUnavailableLabel(
                    itemStatus.status,
                    itemStatus.displayReason,
                    reservationsFor("OFFER", offer.id).length > 0,
                  )
        }
        ctaDisabled={
          !!itemStatus &&
          !isPreviewMode &&
          (isHistoricalSubscription || itemStatus.status !== "AVAILABLE")
        }
        usageRules={offerUsageRules?.filter(
          (rule) => rule.offerId === offer.id,
        )}
        onPress={
          itemStatus?.status === "AVAILABLE" &&
          !isPreviewMode &&
          !isHistoricalSubscription &&
          !counterQrFor("OFFER", offer.id)
            ? () => toggleOffer(offer.id)
            : undefined
        }
      />
      {itemStatus
        ? renderReservations(
            "OFFER",
            offer.id,
            itemStatus.status !== "AVAILABLE",
          )
        : null}
    </DecorativeThemeFrame>
  );

  const CardTab = (
    <View style={{ gap: theme.spacing.lg }} testID="experience-tab-card">
      {renderTabPreviewLink("card")}
      {displayAvailableMembershipsFirst && availableMembershipsSection}

      {/* W277: published season scene is independent of the disabled legacy
          decorative hero mode. It ends before the membership cards begin. */}
      {themeExperience.enabled && themeExperience.featureEnabled ? (
        <View
          style={{
            marginHorizontal: -theme.spacing.lg,
            overflow: "hidden",
            backgroundColor: customerBackground,
          }}
        >
          <ThemeFeatureSection
            config={themeExperience}
            primaryColor={theme.colors.primary}
            accentColor={theme.colors.accent}
            sessionKey={`theme:${organization.id}`}
          />
        </View>
      ) : null}

      {isPlanExploration && (!detailsProduct || !detailsPlan) ? (
        <Section titleColor={pageTextColor} title="Membership Details">
          <Text variant="bodySmall" color="textMuted">
            This published membership plan is no longer available.
          </Text>
        </Section>
      ) : isPlanExploration ||
        exp.membership ||
        (isHistoricalSubscription && subscription) ? (
        <Section
          titleColor={pageTextColor}
          title={
            isPlanExploration
              ? "Membership Details"
              : isHistoricalSubscription
                ? "Previous Membership"
                : t("experience.yourMemberships")
          }
        >
          <View
            style={
              themeExperience.enabled && themeExperience.membershipAccentEnabled
                ? {
                    borderWidth: 2,
                    borderColor: theme.colors.accent,
                    borderRadius: 20,
                    padding: 3,
                  }
                : undefined
            }
          >
            <MembershipCard
              decoration={undefined}
              decorationImageUrl={undefined}
              decorationBackgroundColor={customerBackground}
              testID={
                isPlanExploration
                  ? "experience-published-membership-card"
                  : isHistoricalSubscription
                    ? "experience-previous-membership"
                    : "experience-membership-card"
              }
              showPotentialSavings={isPlanExploration || !!subscription}
              potentialSavings={
                isPlanExploration
                  ? detailsPlan?.potentialSavings
                  : selectedPlanSavings
              }
              showActualSavings={
                !isPlanExploration && !isPreviewMode && !!subscription
              }
              actualSavingsValues={actualSavings.complete}
              partialSavingsValues={actualSavings.partial}
              actualSavingsMessage={
                customerUserId ? actualSavingsMessage : "Savings unavailable"
              }
              onViewSavingsHistory={
                !isPlanExploration &&
                !isPreviewMode &&
                exp.showActivity &&
                subscription
                  ? () => handleTabChange("history", subscription.id)
                  : undefined
              }
              organizationName={exp.displayName}
              tier={
                isPlanExploration && detailsProduct && detailsPlan
                  ? `${detailsProduct.displayName ?? detailsProduct.membershipProductName} · ${detailsPlan.subscriptionPlanName}`
                  : (exp.membership?.tier ??
                    product?.displayName ??
                    product?.membershipProductName ??
                    "Membership")
              }
              validUntil={
                exp.membership?.validUntilLabel ??
                (subscription ? formatDate(subscription.endDate) : "—")
              }
              status={subscriptionStatus}
              publishedPlan={
                isPlanExploration && detailsPlan
                  ? {
                      price: planPrice(detailsPlan),
                      duration: getSubscriptionPeriodLabel(detailsPlan),
                    }
                  : undefined
              }
              cardStyle={cardStyle}
              logoUrl={
                membershipLogoUrl ?? resolvedConfiguration.branding.logoUrl
              }
            >
              {isPlanExploration && detailsProduct && detailsPlan && (
                <View
                  style={{ alignItems: "flex-start", gap: theme.spacing.sm }}
                >
                  {(detailsPlan.description || detailsProduct.description) && (
                    <Text variant="bodySmall" color="textSecondary">
                      {detailsPlan.description || detailsProduct.description}
                    </Text>
                  )}
                  {detailsCanJoin && (
                    <Button
                      label={
                        detailsOffer ? "Join with Offer" : t("experience.join")
                      }
                      size="sm"
                      onPress={() => joinPlan(detailsProduct, detailsPlan)}
                      disabled={Boolean(
                        detailsOffer && !onUseMembershipPurchaseOffer,
                      )}
                      testID={`experience-details-join-${detailsPlan.id}`}
                    />
                  )}
                </View>
              )}
              {!isPlanExploration && isHistoricalSubscription && (
                <View style={{ gap: theme.spacing.sm }}>
                  <Text variant="bodySmall" color="textSecondary">
                    This membership is no longer active.
                  </Text>
                  {product &&
                    selectedPlan &&
                    availableMemberships.some(
                      (item) =>
                        item.id === product.id &&
                        item.plans.some((plan) => plan.id === selectedPlan.id),
                    ) && (
                      <Button
                        label="Repurchase"
                        size="sm"
                        onPress={() => {
                          const purchaseOffer = membershipOfferForProduct(
                            product.id,
                          );
                          if (purchaseOffer && onUseMembershipPurchaseOffer) {
                            onUseMembershipPurchaseOffer(
                              purchaseOffer.offerId,
                              purchaseOffer.displayName,
                              product.id,
                              selectedPlan.id,
                            );
                          } else {
                            onJoin(product.id, selectedPlan.id);
                          }
                        }}
                        testID="experience-repurchase-membership"
                      />
                    )}
                </View>
              )}
            </MembershipCard>
          </View>
        </Section>
      ) : isPreviewMode ? (
        <Section
          titleColor={pageTextColor}
          title={t("experience.yourMemberships")}
        >
          <MembershipCard
            decoration={resolvedBranding.decoration}
            decorationImageUrl={
              resolvedBranding.decoration?.cardBackgroundImageUrl
            }
            decorationBackgroundColor={customerBackground}
            testID="experience-preview-membership-card"
            showPotentialSavings={!!selectedPlan}
            potentialSavings={selectedPlanSavings}
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

      {(isPlanExploration
        ? detailsPlan
        : !isHistoricalSubscription &&
          (previewSection === "benefits" ||
            (!exp.membership?.active && exp.membership))) &&
      overviewBenefits.length ? (
        <Section
          titleColor={pageTextColor}
          title={
            isPlanExploration
              ? "Included Benefits"
              : t("experience.yourBenefits")
          }
        >
          <Card padding="lg">
            <View style={{ gap: 18 }}>
              {overviewBenefits.map((b) => (
                <View key={b.id} style={{ gap: 4 }}>
                  <BenefitItem
                    products={b.products}
                    imageUrl={b.imageUrl}
                    testID={`experience-benefit-${b.id}`}
                    title={b.displayName ?? b.benefitName}
                    subtitle={b.description}
                    advertisedSavings={b.advertisedSavings}
                    disclaimerText={b.disclaimerText}
                    eligibleProducts={b.products?.map(
                      (product) => product.productName || product.productCode,
                    )}
                    participatingStores={
                      isPlanExploration ? participatingStores(b) : undefined
                    }
                    productStoreAvailability={
                      isPlanExploration
                        ? undefined
                        : b.products?.map((eligible) => ({
                            productId: eligible.productId,
                            productName:
                              eligible.productName || eligible.productCode,
                            availability: benefitProductAvailability(
                              b.id,
                              eligible.productId,
                            ),
                          }))
                    }
                    icon={benefitIconForType(b.benefitTypeId)}
                    usageRules={
                      benefitUsageRules?.filter(
                        (rule) => rule.benefitId === b.id,
                      ) ?? (isPlanExploration ? [] : undefined)
                    }
                  />
                  {!isPlanExploration && !isPreviewMode
                    ? renderReservations(
                        "BENEFIT",
                        b.id,
                        statusFor("BENEFIT", b.id).status !== "AVAILABLE",
                      )
                    : null}
                </View>
              ))}
            </View>
          </Card>
        </Section>
      ) : null}

      {isPlanExploration &&
        (planOffers.length > 0 || planPurchaseOffers.length > 0) && (
          <Section
            titleColor={pageTextColor}
            title={t("experience.todaysPerks")}
          >
            <View style={{ gap: theme.spacing.sm }}>
              {planPurchaseOffers.map((offer) => (
                <Card key={offer.offerId} padding="md">
                  <Text variant="bodyStrong">{offer.displayName}</Text>
                </Card>
              ))}
              {planOffers.map((offer) => renderExperienceOffer(offer))}
            </View>
          </Section>
        )}

      {!isPreviewMode && !isPlanExploration && subscription ? (
        <CustomerActiveOrders
          orders={activity?.orders ?? []}
          reservations={activity?.reservations ?? []}
          pendingPayment={
            pendingFulfillmentPayment?.subscriptionId === subscription.id
              ? pendingFulfillmentPayment
              : null
          }
          itemNames={Object.fromEntries([
            ...benefits.map((item) => [
              "BENEFIT:" + item.id,
              item.displayName ?? item.benefitName,
            ]),
            ...exp.offers.map((item) => ["OFFER:" + item.id, item.offerName]),
          ])}
          onOrder={(id) => openFulfillment("details", id)}
          onPayment={(id) => openFulfillment("payment", id)}
        />
      ) : null}
      {!isPlanExploration &&
      !isHistoricalSubscription &&
      exp.membership?.active &&
      previewSection !== "benefits" &&
      (redeemSectionBenefits.length || redeemSectionOffers.length) ? (
        <View style={customerSectionContent}>
          <Section titleColor={pageTextColor} title={redeemSectionTitle}>
            <Card padding="sm" testID="experience-redeem-benefits">
              <View style={{ gap: theme.spacing.sm }}>
                <Text
                  variant="caption"
                  color="textMuted"
                  style={{ textAlign: "right" }}
                >
                  {redeemSectionSummary}
                </Text>
                {redeemSectionBenefits.map(({ benefit: b, itemStatus }) => {
                  const counterQr = counterQrFor("BENEFIT", b.id);
                  const reserved = reservationsFor("BENEFIT", b.id).length > 0;
                  const selectable =
                    itemStatus.status === "AVAILABLE" && !counterQr;
                  const selected = selectable && selectedBenefitIds.has(b.id);
                  const unavailableLabel = counterQr
                    ? undefined
                    : entitlementUnavailableLabel(
                        itemStatus.status,
                        itemStatus.displayReason,
                        reserved,
                      );
                  const storeDetails = itemStoreLabel(`BENEFIT:${b.id}`);
                  const names = currentItemStores[`BENEFIT:${b.id}`]?.map(
                    ({ name }) => name,
                  );
                  const storeSummary = names?.length
                    ? names.slice(0, 2).join(", ") +
                      (names.length > 2 ? ` +${names.length - 2} more` : "")
                    : storeDetails;
                  return (
                    <View
                      key={b.id}
                      style={{
                        gap: 4,
                        padding: theme.spacing.sm,
                        borderWidth: 1,
                        borderRadius: theme.radius.md,
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          gap: theme.spacing.sm,
                        }}
                      >
                        <BenefitItem
                          compact
                          products={b.products}
                          imageUrl={b.imageUrl}
                          testID={`experience-benefit-${b.id}`}
                          title={b.displayName ?? b.benefitName}
                          subtitle={b.description}
                          advertisedSavings={b.advertisedSavings}
                          disclaimerText={b.disclaimerText}
                          eligibleProducts={b.products?.map(
                            (p) => p.productName || p.productCode,
                          )}
                          productStoreAvailability={b.products?.map((p) => ({
                            productId: p.productId,
                            productName: p.productName || p.productCode,
                            availability: benefitProductAvailability(
                              b.id,
                              p.productId,
                            ),
                          }))}
                          icon={benefitIconForType(b.benefitTypeId)}
                          storeSummary={storeSummary || undefined}
                          storeDetails={storeDetails || undefined}
                          usageRules={benefitUsageRules?.filter(
                            (rule) => rule.benefitId === b.id,
                          )}
                        />
                        <View style={{ alignItems: "center", gap: 2 }}>
                          <Pressable
                            testID={`experience-redeem-benefit-${b.id}`}
                            accessibilityRole="checkbox"
                            accessibilityLabel={`Select ${b.displayName ?? b.benefitName}`}
                            accessibilityState={{
                              checked: selected,
                              disabled: !selectable || isPreviewMode,
                            }}
                            disabled={!selectable || isPreviewMode}
                            onPress={() => toggleBenefit(b.id)}
                            hitSlop={8}
                          >
                            <Ionicons
                              name={
                                !selectable && (reserved || counterQr)
                                  ? "lock-closed-outline"
                                  : selected
                                    ? "checkbox"
                                    : "square-outline"
                              }
                              size={24}
                              color={
                                selected
                                  ? theme.colors.primary
                                  : theme.colors.textMuted
                              }
                            />
                          </Pressable>
                          <Text variant="caption" color="primary">
                            Benefit
                          </Text>
                        </View>
                      </View>
                      {unavailableLabel && !reserved ? (
                        <Text variant="caption" color="textMuted">
                          {unavailableLabel}
                        </Text>
                      ) : null}
                      {renderReservations("BENEFIT", b.id, !selectable)}
                    </View>
                  );
                })}
                {redeemSectionOffers.map(({ offer, itemStatus }) => {
                  const counterQr = counterQrFor("OFFER", offer.id);
                  const reserved =
                    reservationsFor("OFFER", offer.id).length > 0;
                  const selectable =
                    itemStatus.status === "AVAILABLE" && !counterQr;
                  const selected = selectable && selectedOfferIds.has(offer.id);
                  const unavailableLabel = counterQr
                    ? undefined
                    : entitlementUnavailableLabel(
                        itemStatus.status,
                        itemStatus.displayReason,
                        reserved,
                      );
                  const names = currentItemStores[`OFFER:${offer.id}`]?.map(
                    ({ name }) => name,
                  );
                  const storeSummary = names?.length
                    ? names.slice(0, 2).join(", ") +
                      (names.length > 2 ? ` +${names.length - 2} more` : "")
                    : itemStoreLabel(`OFFER:${offer.id}`);
                  return (
                    <View
                      key={offer.id}
                      style={{
                        gap: 4,
                        padding: theme.spacing.sm,
                        borderWidth: 1,
                        borderRadius: theme.radius.md,
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          gap: theme.spacing.sm,
                        }}
                      >
                        <OfferCard
                          compact
                          products={offer.products}
                          offerId={offer.id}
                          testID={`experience-redeem-offer-${offer.id}`}
                          title={offer.offerName}
                          description={offer.description}
                          advertisedSavings={offer.advertisedSavings}
                          imageUrl={offer.promotionImageUrl}
                          badge={offer.badgeText}
                          availabilityText={redeemOfferAvailability(offer)}
                          compactAvailabilityText={[
                            offer.availabilityText,
                            storeSummary,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          disclaimerText={offer.disclaimerText}
                          applicableProducts={offer.products?.map(
                            (p) => p.productName || p.productCode,
                          )}
                          discountPercentage={offer.discountPercentage}
                          usageRules={offerUsageRules?.filter(
                            (rule) => rule.offerId === offer.id,
                          )}
                        />
                        <View style={{ alignItems: "center", gap: 2 }}>
                          <Pressable
                            testID={`experience-redeem-offer-${offer.id}-cta`}
                            accessibilityRole="checkbox"
                            accessibilityLabel={`Select ${offer.offerName}`}
                            accessibilityState={{
                              checked: selected,
                              disabled: !selectable || isPreviewMode,
                            }}
                            disabled={!selectable || isPreviewMode}
                            onPress={() => toggleOffer(offer.id)}
                            hitSlop={8}
                          >
                            <Ionicons
                              name={
                                !selectable && (reserved || counterQr)
                                  ? "lock-closed-outline"
                                  : selected
                                    ? "checkbox"
                                    : "square-outline"
                              }
                              size={24}
                              color={
                                selected
                                  ? theme.colors.primary
                                  : theme.colors.textMuted
                              }
                            />
                          </Pressable>
                          <Text variant="caption" color="primary">
                            Offer
                          </Text>
                        </View>
                      </View>
                      {unavailableLabel && !reserved ? (
                        <Text variant="caption" color="textMuted">
                          {unavailableLabel}
                        </Text>
                      ) : null}
                      {renderReservations("OFFER", offer.id, !selectable)}
                    </View>
                  );
                })}

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
                    <Button
                      label={
                        checkFor("ALL")?.pending
                          ? "Checking Stores…"
                          : `Redeem Selected${selectedCount ? ` (${selectedCount})` : ""}`
                      }
                      disabled={selectedCount === 0 || checkFor("ALL")?.pending}
                      onPress={() => {
                        void openRedemptionSelection("ALL");
                      }}
                      testID="experience-redeem-selected"
                    />
                  </View>
                ) : null}
                {checkFor("ALL")?.message ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    variant="bodySmall"
                    color="danger"
                  >
                    {checkFor("ALL")?.message}
                  </Text>
                ) : null}
              </View>
            </Card>
          </Section>
        </View>
      ) : null}

      {isPreviewMode &&
      product?.plans.some(
        (plan) => plan.id !== selectedPlan?.id && plan.potentialSavings,
      ) ? (
        <View style={{ gap: theme.spacing.xs }}>
          {product.plans.map((plan) =>
            plan.id !== selectedPlan?.id && plan.potentialSavings ? (
              <View key={plan.id} style={{ gap: theme.spacing.xs }}>
                <Text variant="bodySmall">
                  {plan.subscriptionPlanName} ·{" "}
                  {potentialSavingsLabel(plan.potentialSavings)}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {potentialSavingsAssumptions(plan.potentialSavings)}
                </Text>
              </View>
            ) : null,
          )}
        </View>
      ) : null}

      {!displayAvailableMembershipsFirst && availableMembershipsSection ? (
        <View ref={availableMembershipsRef} collapsable={false}>
          {availableMembershipsSection}
        </View>
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
      <View
        style={[
          { gap: theme.spacing.lg },
          !isPreviewMode && customerSectionContent,
        ]}
        testID="experience-tab-offers"
      >
        {renderTabPreviewLink("offers")}

        <Section titleColor={pageTextColor} title={t("experience.todaysPerks")}>
          <View style={{ gap: theme.spacing.md }}>
            {offersTabItems.length ? (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="label" color="textSecondary">
                  OTHER OFFERS
                </Text>
                {offersTabItems.map(({ offer, itemStatus }) =>
                  renderExperienceOffer(offer, itemStatus),
                )}
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
                  flexDirection: "column",
                  alignItems: "stretch",
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
                    checkFor("OFFERS")?.pending
                      ? "Checking Stores…"
                      : `Redeem Selected${selectedOfferCount ? ` (${selectedOfferCount})` : ""}`
                  }
                  disabled={
                    selectedOfferCount === 0 || checkFor("OFFERS")?.pending
                  }
                  onPress={() => {
                    void openRedemptionSelection("OFFERS");
                  }}
                  testID="experience-offers-redeem-selected"
                />
                {checkFor("OFFERS")?.message ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    variant="bodySmall"
                    color="danger"
                  >
                    {checkFor("OFFERS")?.message}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </Section>
      </View>
    );
  })();

  const HistoryTab = (() => {
    const redemptions = isPreviewMode ? historyRedemptions : scopedRedemptions;
    const redemptionsById = new Map(
      redemptions.map((entry) => [entry.id, entry]),
    );
    const historyBenefitsById = new Map(
      historyBenefits.map((benefit) => [benefit.id, benefit]),
    );
    const canPageOrders = orders.key === orderScope && hasMoreOrders;
    const fulfillmentEntries =
      fulfillmentHistory.key === fulfillmentHistoryScope
        ? fulfillmentHistory.rows
        : [];
    const canPageFulfillment =
      fulfillmentHistory.key === fulfillmentHistoryScope &&
      fulfillmentHistory.hasMore;
    const linkedFulfillmentIds = new Set(
      fulfillmentEntries.flatMap((item) =>
        [item.commerceId, item.redemptionId].filter((id): id is string => !!id),
      ),
    );
    const orderGroups = groupCustomerOrders(
      orders.key === orderScope
        ? orders.rows.filter((order) => {
            if (
              order.transactionType === "COUNTER_REDEMPTION" &&
              (linkedFulfillmentIds.has(order.transactionId) ||
                (!!order.canonicalOrderId &&
                  linkedFulfillmentIds.has(order.canonicalOrderId)))
            ) {
              return false;
            }
            const attributedId =
              order.subscriptionId ??
              // Older history responses have no canonical order ID. An omitted
              // subscription on a canonical row can mean the evidence conflicted.
              (!order.canonicalOrderId &&
              order.actualSavings?.verificationState === "VERIFIED"
                ? order.actualSavings.subscriptionId
                : undefined);
            return (
              !historySubscriptionId || attributedId === historySubscriptionId
            );
          })
        : [],
    );
    const sortedActivity = [...exp.activity].sort((a, b) => {
      const redemptionA = redemptionsById.get(a.id);
      const redemptionB = redemptionsById.get(b.id);

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
        const benefit = historyBenefitsById.get(highestBenefitId);
        topBenefit = benefit?.displayName ?? benefit?.benefitName;
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

        {subscription &&
        subscription.id === historySubscriptionId &&
        !isPreviewMode ? (
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
                  Purchased: {formatDate(subscription.subscriptionDate)}
                </Text>
                <Text variant="bodySmall" color="textMuted">
                  Start: {formatDate(subscription.startDate)}
                </Text>
                <Text variant="bodySmall" color="textMuted">
                  Original end: {formatDate(subscription.endDate)}
                </Text>
                <MembershipAgreementHistoryLink
                  agreementText={
                    acceptedAgreements.find(
                      (a) => a.subscriptionId === subscription.id,
                    )?.agreementText
                  }
                />
              </View>
            </Card>
          </Section>
        ) : null}

        {!isPreviewMode ? (
          <View style={{ gap: theme.spacing.md }}>
            {[
              {
                title: "Current Orders",
                entries: orderGroups.current,
                fulfillments: fulfillmentEntries.filter(
                  (item) => !fulfillmentIsTerminal(item.status),
                ),
                empty: "No current orders.",
              },
              {
                title: "Past Orders",
                entries: orderGroups.past,
                fulfillments: fulfillmentEntries.filter((item) =>
                  fulfillmentIsTerminal(item.status),
                ),
                empty: "No past orders.",
              },
            ].map(({ title, entries, fulfillments, empty }) => (
              <Section key={title} titleColor={pageTextColor} title={title}>
                <View style={{ gap: theme.spacing.sm }}>
                  {!ordersLoading &&
                  !ordersError &&
                  !fulfillmentHistoryLoading &&
                  !fulfillmentHistoryFailure &&
                  !entries.length &&
                  !fulfillments.length ? (
                    <Text variant="bodySmall" color="textMuted">
                      {canPageOrders || canPageFulfillment
                        ? "No matching orders in the pages loaded."
                        : empty}
                    </Text>
                  ) : null}
                  {fulfillments.map((item) => (
                    <ProfileThemeCard key={item.id}>
                      <CustomerFulfillmentSummary
                        item={item}
                        onOpen={() => openFulfillment("details", item.id)}
                      />
                    </ProfileThemeCard>
                  ))}
                  {entries.map((order) => {
                    const saved =
                      order.transactionType === "COUNTER_REDEMPTION" &&
                      order.status === "COMPLETED" &&
                      order.actualSavings?.transactionId === order.transactionId
                        ? verifiedSavingsMoney(order.actualSavings)
                        : undefined;
                    return (
                      <ProfileThemeCard
                        key={`${order.transactionType}-${order.transactionId}`}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            gap: theme.spacing.md,
                            alignItems: "center",
                          }}
                        >
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text variant="bodyStrong">
                              {order.itemDescription ||
                                (order.transactionType === "REFUND"
                                  ? "Refund"
                                  : order.transactionType ===
                                      "COUNTER_REDEMPTION"
                                    ? "Benefit / Offer redemption"
                                    : transactionTypeLabel(
                                        order.transactionType,
                                      ))}
                            </Text>

                            <Text variant="caption" color="textMuted">
                              {[
                                customerOrderReference(order),
                                order.organizationName,
                                order.storeName &&
                                order.storeName !== order.organizationName
                                  ? order.storeName
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </Text>

                            <Text variant="caption" color="textMuted">
                              {[
                                transactionSummary(order),
                                new Date(order.occurredAt).toLocaleDateString(),
                              ].join(" · ")}
                            </Text>
                            {saved && (
                              <Text variant="label" color="success">
                                Saved {saved}
                              </Text>
                            )}
                          </View>
                          <View style={{ alignItems: "flex-end", gap: 5 }}>
                            <Text variant="bodyStrong">
                              {formatTransactionMoney(
                                order.totalMinor,
                                order.currencyCode,
                              ) ?? "Amount unavailable"}
                            </Text>
                            {order.receiptAvailable && order.receiptId ? (
                              <Pressable
                                accessibilityRole="button"
                                onPress={() => void openOrderReceipt(order)}
                              >
                                <Text variant="label" color="primary">
                                  View Receipt
                                </Text>
                              </Pressable>
                            ) : transactionReceiptCaption(order) ? (
                              <Text variant="caption" color="textMuted">
                                {transactionReceiptCaption(order)}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </ProfileThemeCard>
                    );
                  })}
                </View>
              </Section>
            ))}
            {(ordersLoading || fulfillmentHistoryLoading) && (
              <Text variant="bodySmall" color="textMuted">
                Loading orders…
              </Text>
            )}
            {(ordersError || fulfillmentHistoryFailure) && (
              <Text variant="bodySmall" color="danger">
                {ordersError ?? "Unable to load fulfillment history."}
              </Text>
            )}
            {receiptError && (
              <Text variant="bodySmall" color="danger">
                {receiptError}
              </Text>
            )}
            {ordersError || fulfillmentHistoryFailure ? (
              <Button
                label="Retry orders"
                variant="secondary"
                onPress={() => {
                  setOrderOffset(0);
                  setHistoryRefresh((current) => current + 1);
                }}
              />
            ) : (canPageOrders || canPageFulfillment) &&
              !ordersLoading &&
              !fulfillmentHistoryLoading ? (
              <Button
                label="Load older orders"
                variant="secondary"
                onPress={() => {
                  if (canPageOrders) setOrderOffset((offset) => offset + 25);
                  if (canPageFulfillment)
                    setFulfillmentOffset((offset) => offset + 25);
                }}
              />
            ) : null}
          </View>
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
                const redemption = redemptionsById.get(activity.id);

                const benefit = redemption
                  ? historyBenefitsById.get(redemption.benefitId)
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
                              {benefit?.displayName ??
                                benefit?.benefitName ??
                                activity.title}
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
            <Section
              titleColor={pageTextColor}
              title={t("experience.yourMemberships")}
            >
              <MembershipCard
                decoration={resolvedBranding.decoration}
                decorationImageUrl={
                  resolvedBranding.decoration?.cardBackgroundImageUrl
                }
                decorationBackgroundColor={customerBackground}
                testID="experience-preview-membership-card"
                showPotentialSavings={!!selectedPlan}
                potentialSavings={selectedPlanSavings}
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
              {product?.plans.map((plan) =>
                plan.id !== selectedPlan?.id && plan.potentialSavings ? (
                  <View key={plan.id} style={{ gap: theme.spacing.xs }}>
                    <Text variant="bodySmall">
                      {plan.subscriptionPlanName} ·{" "}
                      {potentialSavingsLabel(plan.potentialSavings)}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {potentialSavingsAssumptions(plan.potentialSavings)}
                    </Text>
                  </View>
                ) : null,
              )}
            </Section>
          </View>
        );

      case "benefits":
        return (
          <View
            style={{ gap: theme.spacing.lg }}
            testID="experience-preview-section-benefits"
          >
            <Section
              titleColor={pageTextColor}
              title={t("experience.yourBenefits")}
            >
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
                            products={b.products}
                            imageUrl={b.imageUrl}
                            key={b.id}
                            testID={`experience-preview-benefit-${b.id}`}
                            title={b.displayName ?? b.benefitName}
                            subtitle={b.description}
                            advertisedSavings={b.advertisedSavings}
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
            <Section
              titleColor={pageTextColor}
              title={t("experience.locations")}
            >
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
            <Section
              titleColor={pageTextColor}
              title={t("experience.preferences")}
            >
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
            <Section
              titleColor={pageTextColor}
              title={t("experience.referral")}
            >
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

  const renderedContent = isPlanExploration
    ? CardTab
    : previewSection
      ? individualSectionContent
      : tabContent;

  const scrollHeader =
    Platform.OS === "web" && isMobileLayout && scrollableMobileWebHeader;
  const headerHeroUri = resolveAssetUrl(
    heroImageUrl?.trim() || exp.heroPromotion?.imageUrl,
  );
  const showHeaderSavings =
    !isPreviewMode &&
    !previewSection &&
    !!customerUserId &&
    effectiveTab === "card";

  const businessHeader = (
    <View
      style={{
        position: "relative",
        overflow: "hidden",
        backgroundColor: customerBackground,
        width: "100%",
      }}
    >
      {headerHeroUri ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <Image
            source={{ uri: headerHeroUri }}
            resizeMode="cover"
            style={{
              width: "100%",
              height: "100%",
              opacity: 0.12,
            }}
          />
        </View>
      ) : null}

      <View
        style={{
          ...(!isPreviewMode && showStoreEligibility
            ? redemptionContent
            : undefined),
          paddingHorizontal: scrollHeader ? 0 : theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        {true && (
          <Pressable
            onPress={onExit}
            testID="experience-back"
            accessibilityRole="button"
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
              {publicDiscoveryNavigation
                ? isPlanExploration
                  ? "Back to memberships"
                  : "Back to Memgine"
                : t("experience.back")}
            </Text>
          </Pressable>
        )}
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          ...(!isPreviewMode && showStoreEligibility
            ? redemptionContent
            : undefined),
          gap: theme.spacing.md,
          paddingHorizontal: scrollHeader ? 0 : theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        <BrandLogo
          logoUrl={membershipLogoUrl ?? resolvedConfiguration.branding.logoUrl}
          monogram={exp.monogram}
          size={46}
          fit="cover"
          testID="experience-brand-logo"
        />

        <View
          style={{
            flex: 1,
            minWidth: 0,
            paddingRight: showHeaderSavings ? 112 : 0,
          }}
        >
          <Text variant="h2" color="text" style={{ color: pageTextColor }}>
            {exp.displayName}
          </Text>
          <Text
            variant="caption"
            color="textMuted"
            style={{ color: pageTextColor }}
          >
            {tagline?.trim() || exp.tagline}
          </Text>
        </View>

        {!showHeaderSavings ? (
          <ThemeHeaderDecoration
            config={themeExperience}
            compact={scrollHeader}
            accentColor={theme.colors.accent}
          />
        ) : null}

        {showHeaderSavings ? (
          <View
            style={{
              position: "absolute",
              right: scrollHeader ? 0 : theme.spacing.lg,
              top: theme.spacing.sm + 5,
              zIndex: 2,
            }}
          >
            <BusinessSavingsBanner
              businessName={exp.displayName}
              savings={currentBusinessSavings?.data}
              loading={
                !currentBusinessSavings ||
                (!currentBusinessSavings.data && !currentBusinessSavings.error)
              }
              backgroundColor={theme.colors.surface}
              borderColor={theme.colors.border}
              textColor={theme.colors.text}
              accentColor={theme.colors.primary}
              onHistory={() => handleTabChange("history")}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
  const showMembershipExplore =
    hasActiveCustomerMembership &&
    !isPlanExploration &&
    !previewSection &&
    !historySelector &&
    effectiveTab === "card" &&
    exploreMembershipCount > 0;
  const handleExploreMemberships = () => {
    const target = availableMembershipsRef.current;
    const scroll = mainScroll.current;

    if (!target || !scroll) return;

    const contentNode = scroll.getInnerViewNode();

    if (!contentNode) return;

    target.measureLayout(
      contentNode,
      (_x, y) => {
        scroll.scrollTo({
          y: Math.max(0, y - theme.spacing.sm),
          animated: true,
        });
      },
      () => {
        scroll.scrollToEnd({ animated: true });
      },
    );
  };
  return (
    <BusinessThemeScope theme={customerTheme}>
      <View
        style={{
          flex: 1,
          backgroundColor: customerBackground,
          paddingTop: insets.top,
        }}
      >
        {!scrollHeader && businessHeader}
        <ScrollView
          ref={mainScroll}
          style={{
            flex: 1,
            minWidth: 0,
            width: "100%",
          }}
          contentContainerStyle={{
            ...(!isPreviewMode && showStoreEligibility
              ? Platform.OS === "web"
                ? {
                    width: "100%",
                    maxWidth: undefined,
                    alignSelf: "stretch" as const,
                  }
                : redemptionContent
              : undefined),

            padding: theme.spacing.lg,
            paddingTop: scrollHeader ? 0 : theme.spacing.sm,
            paddingBottom: insets.bottom + 90,
            gap: theme.spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          {scrollHeader && businessHeader}
          {!previewSection ? (
            <AnnouncementDisplay
              configuration={announcementConfiguration}
              fallbackBackground={theme.colors.accent}
              paddingHorizontal={theme.spacing.md}
              paddingVertical={theme.spacing.sm}
              themeExperience={themeExperience}
            />
          ) : null}
          {!isPlanExploration && customerActionError ? (
            <Card padding="md">
              <Text variant="bodySmall" color="textMuted">
                {customerActionError}
              </Text>
            </Card>
          ) : null}
          {!isPlanExploration &&
          (historySelector
            ? selectorMemberships.length > 0
            : selectorMemberships.length > 1 || showMembershipExplore) &&
          effectiveTab !== "profile" &&
          previewSection !== "profile" ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.sm,
                minWidth: 0,
                width: "100%",
              }}
            >
              <ScrollView
                horizontal
                style={{
                  flex: 1,
                  minWidth: 0,
                }}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  gap: theme.spacing.sm,
                  alignItems: "center",
                }}
                testID="experience-membership-selector"
              >
                {historySelector && (
                  <Pressable
                    testID="experience-history-all-orders"
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: historySubscriptionId === null,
                    }}
                    onPress={() => {
                      setHistorySubscriptionId(null);
                      setShowAllHistory(false);
                    }}
                    style={{
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: 8,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: historySubscriptionId
                        ? theme.colors.border
                        : theme.colors.primary,
                      backgroundColor: historySubscriptionId
                        ? theme.colors.background
                        : theme.colors.primarySoft,
                    }}
                  >
                    <Text
                      variant="label"
                      color={historySubscriptionId ? "textMuted" : "primary"}
                    >
                      All Orders
                    </Text>
                  </Pressable>
                )}
                {selectorMemberships.map((m) => {
                  const selected =
                    m.subscription.id ===
                    (historySelector
                      ? historySubscriptionId
                      : selectedSubscriptionId);

                  const plan = m.product.plans.find(
                    (item) => item.id === m.subscription.subscriptionPlanId,
                  );

                  const productLabel =
                    m.product.displayName ?? m.product.membershipProductName;

                  const label = plan?.subscriptionPlanName
                    ? `${productLabel} · ${plan.subscriptionPlanName}`
                    : productLabel;
                  const repeatedPlan =
                    historySelector &&
                    selectorMemberships.some(
                      (other) =>
                        other.subscription.id !== m.subscription.id &&
                        other.subscription.subscriptionPlanId ===
                          m.subscription.subscriptionPlanId,
                    );

                  return (
                    <Pressable
                      key={m.subscription.id}
                      testID={`experience-membership-option-${m.subscription.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        if (historySelector) {
                          setHistorySubscriptionId(m.subscription.id);
                          setShowAllHistory(false);
                        }
                        onSelectSubscription(m.subscription.id);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: theme.spacing.md,
                        paddingVertical: 8,
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        maxWidth: isMobileLayout ? 220 : 320,
                        flexShrink: 0,
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
                          selected
                            ? theme.colors.primary
                            : theme.colors.textMuted
                        }
                      />

                      <Text
                        variant="label"
                        color={selected ? "primary" : "textMuted"}
                        numberOfLines={1}
                        style={{
                          flexShrink: 1,
                          minWidth: 0,
                        }}
                      >
                        {repeatedPlan
                          ? `${label} · ${m.subscription.subscriptionNumber}`
                          : label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {showMembershipExplore ? (
                <MembershipExploreHighlighter
                  count={exploreMembershipCount}
                  onPress={handleExploreMemberships}
                />
              ) : null}
            </View>
          ) : null}

          {renderedContent}
        </ScrollView>

        {!isPlanExploration && !hideTabBar ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              paddingBottom: insets.bottom,
            }}
          >
            <View style={{ ...redemptionContent, flexDirection: "row" }}>
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

        {selectedAvailablePlan ? (
          <MembershipPlanDetailsModal
            visible
            onClose={() => setSelectedAvailablePlan(null)}
            organizationName={exp.displayName}
            membership={selectedAvailablePlan.membership}
            plan={selectedAvailablePlan.plan}
            benefits={historyBenefits}
            usageRules={benefitUsageRules}
            stores={stores}
          />
        ) : null}

        <TransactionReceiptViewer
          receipt={orderReceipt}
          visible={orderReceipt !== null}
          onClose={() => setOrderReceipt(null)}
          afterReceipt={
            receiptSavings ? (
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  paddingTop: theme.spacing.sm,
                }}
              >
                <Text variant="bodyStrong">You Saved on This Redemption</Text>
                <Text variant="bodySmall" color="success">
                  {receiptSavings}
                </Text>
              </View>
            ) : undefined
          }
        />

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
