import { Image, Pressable, View } from "react-native";
import { useEffect, useState } from "react";

import { OfferFrequencyType, type OfferUsageRule } from "@/src/core";
import { services } from "@/src/core";
import { useTheme } from "@/src/providers";

import { Badge } from "../Badge";
import { Button } from "../Button";
import { Card } from "../Card";
import { Text } from "../Text";

type OfferCardProps = {
  offerId?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  badge?: string;
  availabilityText?: string;
  discountPercentage?: number;
  ctaLabel?: string;
  onPress?: () => void;
  usageRules?: OfferUsageRule[];
  testID?: string;
};

const DAY_LABELS: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

function formatDays(days?: string[]): string | undefined {
  if (!days?.length) return undefined;

  const normalized = days
    .map((day) => day.trim().toUpperCase().slice(0, 3))
    .filter((day) => DAY_LABELS[day]);

  if (!normalized.length) return undefined;

  const unique = Array.from(new Set(normalized));

  if (unique.length === 7) return "Every day";

  const ordered = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const selectedIndexes = ordered
    .map((day, index) => (unique.includes(day) ? index : -1))
    .filter((index) => index >= 0);

  const isContiguous = selectedIndexes.every(
    (index, position) =>
      position === 0 || index === selectedIndexes[position - 1] + 1,
  );

  return isContiguous
    ? selectedIndexes.map((index) => DAY_LABELS[ordered[index]]).join("–")
    : selectedIndexes.map((index) => DAY_LABELS[ordered[index]]).join(", ");
}

function formatTime(value?: string): string | undefined {
  if (!value) return undefined;

  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;

  const hour = Number(match[1]);
  const minute = match[2];
  if (hour < 0 || hour > 23) return value;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return minute === "00"
    ? `${displayHour} ${suffix}`
    : `${displayHour}:${minute} ${suffix}`;
}

function formatFrequency(
  frequencyType: OfferFrequencyType,
  interval: number,
): string | undefined {
  const safeInterval = Math.max(1, interval || 1);

  switch (frequencyType) {
    case OfferFrequencyType.DAILY:
      return safeInterval === 1 ? "day" : `${safeInterval} days`;
    case OfferFrequencyType.WEEKLY:
      return safeInterval === 1 ? "week" : `${safeInterval} weeks`;
    case OfferFrequencyType.MONTHLY:
      return safeInterval === 1 ? "month" : `${safeInterval} months`;
    case OfferFrequencyType.YEARLY:
      return safeInterval === 1 ? "year" : `${safeInterval} years`;
    case OfferFrequencyType.ONE_TIME:
      return undefined;
    default:
      return undefined;
  }
}

function formatUsageRule(rule: OfferUsageRule): string[] {
  const limit = Math.max(1, rule.usageLimit || 1);
  const frequency = formatFrequency(rule.frequencyType, rule.frequencyInterval);
  const lines: string[] = [];

  if (frequency) {
    lines.push(
      limit === 1
        ? `1 redemption per ${frequency}`
        : `${limit} redemptions per ${frequency}`,
    );
  } else {
    lines.push(limit === 1 ? "One redemption" : `Up to ${limit} redemptions`);
  }

  const days = formatDays(rule.applicableDays);
  const hasTimeWindow = Boolean(rule.windowStartTime && rule.windowEndTime);

  if (days && hasTimeWindow) {
    lines.push(
      `${days} · ${formatTime(rule.windowStartTime)}–${formatTime(rule.windowEndTime)}`,
    );
  } else if (days) {
    lines.push(days);
  } else if (hasTimeWindow) {
    lines.push(
      `${formatTime(rule.windowStartTime)}–${formatTime(rule.windowEndTime)}`,
    );
  }

  return lines;
}

export function OfferCard({
  offerId,
  title,
  description,
  imageUrl,
  badge,
  availabilityText,
  discountPercentage,
  ctaLabel,
  onPress,
  usageRules: usageRulesOverride,
  testID,
}: OfferCardProps) {
  const theme = useTheme();
  const [usageRules, setUsageRules] = useState<OfferUsageRule[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (usageRulesOverride !== undefined) {
      setUsageRules(usageRulesOverride.filter((rule) => !rule.isDeleted));
      return () => {
        cancelled = true;
      };
    }

    const loadUsageRules = async () => {
      if (!offerId) {
        setUsageRules([]);
        return;
      }

      try {
        const rules = await services.offerUsageRule.listByOffer(offerId);

        if (!cancelled) {
          setUsageRules(rules.filter((rule) => !rule.isDeleted));
        }
      } catch {
        if (!cancelled) {
          setUsageRules([]);
        }
      }
    };

    void loadUsageRules();

    return () => {
      cancelled = true;
    };
  }, [offerId, usageRulesOverride]);

  const usageLines = usageRules.flatMap(formatUsageRule);

  const content = (
    <Card
      testID={testID}
      padding="lg"
      style={{
        overflow: "hidden",
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: theme.spacing.md,
        }}
      >
        {imageUrl ? (
          <View
            style={{
              width: 88,
              height: 72,
              borderRadius: theme.radius.md,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.surfaceAlt,
              flexShrink: 0,
            }}
          >
            <Image
              source={{ uri: imageUrl }}
              resizeMode="contain"
              style={{
                width: "100%",
                height: "100%",
              }}
              accessibilityLabel={`${title} offer`}
            />
          </View>
        ) : null}

        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: theme.spacing.sm,
            }}
          >
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              {badge ? <Badge label={badge} tone="brand" /> : null}

              <Text variant="bodyStrong" color="text">
                {title}
              </Text>
            </View>

            {discountPercentage !== undefined ? (
              <Badge label={`${discountPercentage}% OFF`} tone="brand" />
            ) : null}
          </View>

          {description ? (
            <Text variant="bodySmall" color="textSecondary">
              {description}
            </Text>
          ) : null}

          {availabilityText ? (
            <Text variant="caption" color="textMuted">
              {availabilityText}
            </Text>
          ) : null}

          {usageLines.length ? (
            <View
              testID={testID ? `${testID}-usage-rules` : undefined}
              style={{
                marginTop: theme.spacing.xs,
                paddingTop: theme.spacing.sm,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
                gap: 2,
              }}
            >
              {usageLines.map((line, index) => (
                <Text
                  key={`${line}-${index}`}
                  variant="caption"
                  color="textSecondary"
                >
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {ctaLabel ? (
            onPress ? (
              <Button
                label={ctaLabel}
                size="sm"
                onPress={onPress}
                testID={testID ? `${testID}-cta` : undefined}
              />
            ) : (
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.primarySoft,
                }}
              >
                <Text variant="label" color="primary">
                  {ctaLabel}
                </Text>
              </View>
            )
          ) : null}
        </View>
      </View>
    </Card>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        opacity: pressed ? theme.states.pressedOpacity : 1,
      })}
    >
      {content}
    </Pressable>
  );
}
