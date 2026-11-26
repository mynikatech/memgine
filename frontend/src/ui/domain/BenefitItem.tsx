import type { AdvertisedSavings } from "@/src/core/domain/entities";
import { advertisedSavingsLabel } from "@/src/core/domain/savings-display";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import type { BenefitUsageRule } from "@/src/core";
import { services } from "@/src/core";
import { useTheme } from "@/src/providers";
import { Modal } from "../Modal";
import { Text } from "../Text";
import { resolveAssetUrl } from "@/src/data/api/asset-url";

export type DisplayProduct = {
  productId: string;
  productName: string;
  productCode: string;
  imageUrl?: string | null;
};

type IoniconName = keyof typeof Ionicons.glyphMap;
/** Shared thumbnail with ordered image fallbacks; no additional API calls. */
export function ProductThumbnail({
  urls,
  label,
  icon = "gift-outline",
  size = 56,
  height = size,
}: {
  urls: (string | null | undefined)[];
  label: string;
  icon?: IoniconName;
  size?: number;
  height?: number;
}) {
  const theme = useTheme();
  const candidates = Array.from(
    new Set(
      urls
        .map((url) => resolveAssetUrl(url ?? undefined))
        .filter((url): url is string => Boolean(url)),
    ),
  );
  const key = JSON.stringify(candidates);
  const [failure, setFailure] = useState<{ key: string; urls: string[] }>({
    key: "",
    urls: [],
  });
  const uri = candidates.find(
    (url) => failure.key !== key || !failure.urls.includes(url),
  );
  return (
    <View
      style={{
        width: size,
        height,
        flexShrink: 0,
        borderRadius: theme.radius.md,
        overflow: "hidden",
        backgroundColor: theme.colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri ? (
        <Image
          key={uri}
          source={{ uri }}
          accessibilityLabel={label}
          resizeMode="cover"
          style={{ width: "100%", height: "100%" }}
          onError={() =>
            setFailure((previous) => ({
              key,
              urls: [...(previous.key === key ? previous.urls : []), uri],
            }))
          }
        />
      ) : (
        <Ionicons name={icon} size={22} color={theme.colors.primary} />
      )}
    </View>
  );
}

/** Map a benefit type to a representative icon. */
export function benefitIconForType(benefitTypeId: string): IoniconName {
  switch (benefitTypeId) {
    case "benefit-type-discount":
      return "pricetag-outline";
    case "benefit-type-freebie":
      return "gift-outline";
    case "benefit-type-reward":
      return "ribbon-outline";
    case "benefit-type-perk":
      return "star-outline";
    default:
      return "gift-outline";
  }
}
/**
 * BenefitItem — customer-facing presentation of a single benefit.
 *
 * Usage rules are loaded from the existing Benefit Usage Rule service using
 * the benefit id encoded by the current customer renderer's testID. This
 * keeps existing callers backward-compatible while allowing the customer
 * benefit card to show the persisted rules without changing the parent
 * renderer's contract.
 */
type BenefitItemProps = {
  compact?: boolean;
  storeSummary?: string;
  storeDetails?: string;
  title: string;
  subtitle?: string;
  advertisedSavings?: AdvertisedSavings | null;
  disclaimerText?: string;
  eligibleProducts?: string[];
  products?: DisplayProduct[];
  imageUrl?: string | null;
  productStoreAvailability?: Array<{
    productId: string;
    productName: string;
    availability: string;
  }>;
  participatingStores?: string[];
  icon?: IoniconName;
  usageRules?: BenefitUsageRule[];
  testID?: string;
};
const DAY_LABELS: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};
const DAY_SHORT_LABELS: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};
function getBenefitId(testID?: string): string | undefined {
  const match = testID?.match(/^experience-(?:preview-)?benefit-(.+)$/);
  return match?.[1];
}
function formatFrequency(rule: BenefitUsageRule): string {
  switch (rule.frequencyType) {
    case "ONE_TIME":
      return "One-time benefit";
    case "DAILY":
      return rule.frequencyInterval === 1
        ? "Once per day"
        : `Every ${rule.frequencyInterval} days`;
    case "WEEKLY":
      return rule.frequencyInterval === 1
        ? "Once per week"
        : `Every ${rule.frequencyInterval} weeks`;
    case "MONTHLY":
      return rule.frequencyInterval === 1
        ? "Once per month"
        : `Every ${rule.frequencyInterval} months`;
    case "YEARLY":
      return rule.frequencyInterval === 1
        ? "Once per year"
        : `Every ${rule.frequencyInterval} years`;
    default:
      return "Usage restricted";
  }
}
function formatLimit(rule: BenefitUsageRule): string {
  if (rule.frequencyType === "ONE_TIME") {
    return `Up to ${rule.usageLimit} redemption${
      rule.usageLimit === 1 ? "" : "s"
    }`;
  }
  const period =
    rule.frequencyType === "DAILY"
      ? rule.frequencyInterval === 1
        ? "day"
        : `${rule.frequencyInterval} days`
      : rule.frequencyType === "WEEKLY"
        ? rule.frequencyInterval === 1
          ? "week"
          : `${rule.frequencyInterval} weeks`
        : rule.frequencyType === "MONTHLY"
          ? rule.frequencyInterval === 1
            ? "month"
            : `${rule.frequencyInterval} months`
          : rule.frequencyInterval === 1
            ? "year"
            : `${rule.frequencyInterval} years`;
  return `Up to ${rule.usageLimit} redemption${
    rule.usageLimit === 1 ? "" : "s"
  } per ${period}`;
}
function formatTime(value?: string): string {
  if (!value) return "";
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}
function formatDays(days?: string[]): string {
  if (!days?.length) return "";
  const ordered = Object.keys(DAY_LABELS).filter((day) => days.includes(day));
  if (ordered.length === 7) return "Monday–Sunday";
  return ordered.map((day) => DAY_LABELS[day] ?? day).join(", ");
}
function formatShortDays(days?: string[]): string {
  if (!days?.length) return "";
  const ordered = Object.keys(DAY_SHORT_LABELS).filter((day) =>
    days.includes(day),
  );
  if (ordered.length === 7) return "Mon–Sun";
  return ordered.map((day) => DAY_SHORT_LABELS[day] ?? day).join(", ");
}
function formatTimeZone(timeZone?: string): string {
  if (!timeZone) return "";
  const friendlyNames: Record<string, string> = {
    "America/Toronto": "Toronto time",
    "America/Vancouver": "Vancouver time",
    "America/Edmonton": "Edmonton time",
    "America/Winnipeg": "Winnipeg time",
    "America/Halifax": "Halifax time",
    "America/St_Johns": "St. John's time",
    "America/New_York": "New York time",
    "America/Chicago": "Chicago time",
    "America/Denver": "Denver time",
    "America/Los_Angeles": "Los Angeles time",
    "America/Phoenix": "Phoenix time",
    "America/Anchorage": "Alaska time",
    "Pacific/Honolulu": "Hawaii time",
    "Europe/London": "London time",
    "Europe/Paris": "Paris time",
    "Europe/Berlin": "Berlin time",
    "Europe/Rome": "Rome time",
    "Europe/Madrid": "Madrid time",
    "Asia/Dubai": "Dubai time",
    "Asia/Kolkata": "India time",
    "Asia/Singapore": "Singapore time",
    "Asia/Tokyo": "Tokyo time",
    "Australia/Sydney": "Sydney time",
    "Pacific/Auckland": "Auckland time",
  };
  return friendlyNames[timeZone] ?? timeZone.replace(/_/g, " ");
}
export function formatUsage(rule: BenefitUsageRule): string {
  if (rule.frequencyType === "ONE_TIME") {
    return `One-time benefit${
      rule.usageLimit > 1 ? ` · Up to ${rule.usageLimit} times` : ""
    }`;
  }
  const unit =
    rule.frequencyType === "DAILY"
      ? rule.frequencyInterval === 1
        ? "day"
        : `${rule.frequencyInterval} days`
      : rule.frequencyType === "WEEKLY"
        ? rule.frequencyInterval === 1
          ? "week"
          : `${rule.frequencyInterval} weeks`
        : rule.frequencyType === "MONTHLY"
          ? rule.frequencyInterval === 1
            ? "month"
            : `${rule.frequencyInterval} months`
          : rule.frequencyInterval === 1
            ? "year"
            : `${rule.frequencyInterval} years`;
  if (rule.usageLimit === 1) {
    return `Once per ${unit}`;
  }
  return `Up to ${rule.usageLimit} times per ${unit}`;
}
export function formatAvailability(rule: BenefitUsageRule): string {
  const parts: string[] = [];
  const days = formatShortDays(rule.applicableDays);
  if (days) parts.push(`Available ${days}`);
  if (rule.windowStartTime || rule.windowEndTime) {
    const start = formatTime(rule.windowStartTime) || "any time";
    const end = formatTime(rule.windowEndTime) || "any time";
    parts.push(`${start}–${end}`);
  }
  return parts.join(" · ");
}
export function BenefitItem({
  compact = false,
  storeSummary,
  storeDetails,
  title,
  subtitle,
  advertisedSavings,
  disclaimerText,
  eligibleProducts,
  products,
  imageUrl,
  productStoreAvailability,
  participatingStores,
  icon = "gift-outline",
  usageRules: usageRulesOverride,
  testID,
}: BenefitItemProps) {
  const theme = useTheme();
  const savingsLabel = advertisedSavingsLabel(advertisedSavings, "use");
  const benefitId = getBenefitId(testID);
  const [rules, setRules] = useState<BenefitUsageRule[]>([]);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (usageRulesOverride !== undefined) {
      setRuleError(null);
      setRules(usageRulesOverride.filter((rule) => !rule.isDeleted));
      return () => {
        cancelled = true;
      };
    }
    const loadRules = async () => {
      if (!benefitId) {
        setRules([]);
        setRuleError(null);
        return;
      }
      try {
        const result = await services.benefitUsageRule.listByBenefit(benefitId);
        if (!cancelled) {
          setRules(result);
          setRuleError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRules([]);
          setRuleError(
            error instanceof Error
              ? error.message
              : "Unable to load usage rules.",
          );
        }
      }
    };
    void loadRules();
    return () => {
      cancelled = true;
    };
  }, [benefitId, usageRulesOverride]);
  const primaryRule = rules[0];
  const ruleSummary = primaryRule ? formatUsage(primaryRule) : "";
  const availability = primaryRule ? formatAvailability(primaryRule) : "";
  const hasDetails = Boolean(
    compact ||
    primaryRule ||
    savingsLabel ||
    participatingStores?.length ||
    subtitle ||
    disclaimerText ||
    eligibleProducts?.length ||
    productStoreAvailability?.length ||
    products?.length,
  );
  const handlePress = () => {
    if (hasDetails) {
      setDetailsOpen(true);
    }
  };
  return (
    <>
      <Pressable
        testID={testID}
        onPress={handlePress}
        disabled={!hasDetails}
        accessibilityRole={hasDetails ? "button" : undefined}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: compact ? "flex-start" : "center",
          gap: compact ? theme.spacing.sm : theme.spacing.md,
          ...(compact ? { flex: 1, minWidth: 0 } : {}),
          opacity: pressed ? theme.states.pressedOpacity : 1,
        })}
      >
        <ProductThumbnail
          urls={[
            imageUrl,
            ...(products?.length === 1 ? [products[0].imageUrl] : []),
          ]}
          label={title}
          icon={icon}
          size={compact ? 56 : 40}
        />
        <View
          style={{ flex: 1, minWidth: 0, gap: compact ? 1 : theme.spacing.xs }}
        >
          <Text variant="bodyStrong" color="text">
            {title}
          </Text>
          {compact && savingsLabel ? (
            <Text variant="caption" color="primary">
              {savingsLabel}
            </Text>
          ) : null}
          {ruleSummary ? (
            <Text variant="bodySmall" color="textSecondary">
              {!compact && subtitle
                ? `${subtitle} — ${ruleSummary}`
                : ruleSummary}
            </Text>
          ) : !compact && subtitle ? (
            <Text variant="bodySmall" color="textMuted">
              {subtitle}
            </Text>
          ) : null}
          {!compact && disclaimerText?.trim() ? (
            <Text variant="caption" color="textMuted">
              Terms: {disclaimerText.trim()}
            </Text>
          ) : null}
          {!compact && eligibleProducts?.length ? (
            <Text variant="caption" color="textSecondary">
              Choose from: {eligibleProducts.join(", ")}
            </Text>
          ) : null}
          {availability ? (
            <Text variant="caption" color="textMuted">
              {availability}
            </Text>
          ) : null}
          {compact && storeSummary ? (
            <Text variant="caption" color="textMuted">
              {storeSummary}
            </Text>
          ) : null}
          {!compact && ruleError ? (
            <Text variant="caption" color="textMuted">
              {ruleError}
            </Text>
          ) : null}
        </View>
        {hasDetails ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={theme.colors.textMuted}
          />
        ) : null}
      </Pressable>
      {hasDetails ? (
        <Modal
          visible={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          title={title}
          scrollable
          testID={testID ? `${testID}-details` : undefined}
        >
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="bodyStrong" color="text">
              How this benefit works
            </Text>
            {subtitle ? (
              <Text variant="bodySmall" color="text">
                {subtitle}
              </Text>
            ) : null}
            {disclaimerText?.trim() ? (
              <Text variant="caption" color="textMuted">
                Terms: {disclaimerText.trim()}
              </Text>
            ) : null}
            {storeDetails ? (
              <Text variant="bodySmall" color="text">
                {storeDetails}
              </Text>
            ) : null}
            {eligibleProducts?.length &&
            !productStoreAvailability?.length &&
            !products?.length ? (
              <Text variant="bodySmall" color="text">
                Choose from: {eligibleProducts.join(", ")}
              </Text>
            ) : null}
            {ruleError ? (
              <Text variant="caption" color="textMuted">
                {ruleError}
              </Text>
            ) : null}
            {savingsLabel && (
              <Text variant="label" color="primary">
                {savingsLabel}
              </Text>
            )}
            {primaryRule ? (
              <View style={{ gap: theme.spacing.sm }}>
                <View>
                  <Text variant="caption" color="textMuted">
                    Usage
                  </Text>
                  <Text variant="bodySmall" color="text">
                    {formatUsage(primaryRule)}
                  </Text>
                </View>
                <View>
                  <Text variant="caption" color="textMuted">
                    Available
                  </Text>
                  <Text variant="bodySmall" color="text">
                    {formatDays(primaryRule.applicableDays) || "Every day"}
                  </Text>
                </View>
                <View>
                  <Text variant="caption" color="textMuted">
                    Time
                  </Text>
                  <Text variant="bodySmall" color="text">
                    {primaryRule.windowStartTime || primaryRule.windowEndTime
                      ? `${formatTime(primaryRule.windowStartTime) || "Any time"}–${
                          formatTime(primaryRule.windowEndTime) || "Any time"
                        }`
                      : "Any time"}
                  </Text>
                </View>
                <View>
                  <Text variant="caption" color="textMuted">
                    Time zone
                  </Text>
                  <Text variant="bodySmall" color="text">
                    {formatTimeZone(primaryRule.timeZone) ||
                      "Business local time"}
                  </Text>
                </View>
              </View>
            ) : null}
            {participatingStores?.length ? (
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="bodyStrong" color="text">
                  Participating Stores
                </Text>
                <Text variant="bodySmall" color="text">
                  {participatingStores.join(", ")}
                </Text>
              </View>
            ) : null}
            {products?.length || productStoreAvailability?.length ? (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="bodyStrong" color="text">
                  Eligible Products
                  {productStoreAvailability?.length ? " & Stores" : ""}
                </Text>
                {(products?.length
                  ? products
                  : (productStoreAvailability ?? [])
                ).map((product) => {
                  const detail = productStoreAvailability?.find(
                    (item) => item.productId === product.productId,
                  );
                  const imageUrl = products?.find(
                    (item) => item.productId === product.productId,
                  )?.imageUrl;
                  return (
                    <View
                      key={product.productId}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: theme.spacing.sm,
                      }}
                    >
                      <ProductThumbnail
                        urls={[imageUrl]}
                        label={product.productName}
                        icon={icon}
                        size={48}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="bodySmall" color="text">
                          {product.productName}
                        </Text>
                        {detail?.availability ? (
                          <Text variant="caption" color="textMuted">
                            {detail.availability}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        </Modal>
      ) : null}
    </>
  );
}
