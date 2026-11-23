import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { formatBusinessSavingsMoney } from "@/src/core/domain/savings-display";
import type { BusinessActualSavings } from "@/src/data/api/customer-data-api";
import { Modal, Text } from "@/src/ui";

export function BusinessSavingsBanner({
  businessName,
  savings,
  loading,
  onHistory,
  backgroundColor,
  borderColor,
  textColor,
  accentColor,
}: {
  businessName: string;
  savings?: BusinessActualSavings;
  loading: boolean;
  onHistory: () => void;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const totals = savings?.totals ?? [];
  const primary =
    totals.length === 1
      ? totals[0]
      : savings?.activePlanCurrencyCode
        ? totals.find(
            (total) => total.currencyCode === savings.activePlanCurrencyCode,
          )
        : undefined;
  const amount = primary
    ? formatBusinessSavingsMoney(
        primary.verifiedNetSavingsMinor,
        primary.currencyCode,
      )
    : undefined;
  const label =
    savings?.coverageState === "PARTIAL"
      ? "Verified savings so far"
      : savings?.coverageState === "NO_REDEMPTION_HISTORY" &&
          !savings.activePlanCurrencyCode
        ? "Your Savings"
        : "You've Saved";
  const zero =
    savings?.coverageState === "NO_REDEMPTION_HISTORY" &&
    savings.activePlanCurrencyCode
      ? formatBusinessSavingsMoney(0, savings.activePlanCurrencyCode)
      : undefined;
  const value = loading
    ? "Loading savings…"
    : !savings || savings.coverageState === "UNAVAILABLE"
      ? "Savings unavailable"
      : (amount ??
        zero ??
        (totals.length > 1
          ? totals
              .map(
                (total) =>
                  formatBusinessSavingsMoney(
                    total.verifiedNetSavingsMinor,
                    total.currencyCode,
                  ) ?? "Unavailable",
              )
              .join(" · ")
          : totals.length === 1
            ? "Savings unavailable"
            : savings.coverageState === "PARTIAL"
              ? "Savings history incomplete"
              : "Start saving with your memberships"));
  const otherTotals = primary
    ? totals.filter((total) => total.currencyCode !== primary.currencyCode)
    : [];

  return (
    <>
      <View
        style={{
          backgroundColor,
          borderWidth: 1,
          borderColor,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 80,
        }}
        testID="business-savings-banner"
      >
        <MaterialCommunityIcons name="piggy-bank" size={30} color="#E88BA7" />
        <View style={{ flex: 1 }}>
          <Text variant="caption" style={{ color: textColor }}>
            {label}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Text variant="title" style={{ color: accentColor }}>
              {value}
            </Text>
            {amount && primary && primary.verifiedNetSavingsMinor > 0 ? (
              <MaterialCommunityIcons
                name="trending-up"
                size={25}
                color={accentColor}
              />
            ) : null}
          </View>
          {otherTotals.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
              <Text variant="caption" style={{ color: textColor }}>
                {otherTotals
                  .map(
                    (total) =>
                      formatBusinessSavingsMoney(
                        total.verifiedNetSavingsMinor,
                        total.currencyCode,
                      ) ?? "Unavailable",
                  )
                  .join(" · ")}
                {" in other " +
                  (otherTotals.length === 1 ? "currency" : "currencies")}
              </Text>
            </Pressable>
          ) : null}
          <Text variant="caption" style={{ color: textColor }}>
            Across your memberships at this business
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View savings details"
          onPress={() => setOpen(true)}
        >
          <Text variant="label" style={{ color: accentColor }}>
            View Details
          </Text>
        </Pressable>
      </View>
      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title="Your savings"
        scrollable
        testID="business-savings-details"
      >
        <Text variant="title">{businessName}</Text>
        {totals.map((total) => (
          <Text key={total.currencyCode} variant="body">
            {total.coverageState === "PARTIAL"
              ? "Verified savings so far: "
              : "Savings: "}
            {formatBusinessSavingsMoney(
              total.verifiedNetSavingsMinor,
              total.currencyCode,
            ) ?? "Unavailable"}
          </Text>
        ))}
        {savings?.coverageState === "PARTIAL" ? (
          <Text variant="bodySmall">
            Some savings history is incomplete. Verified amounts are shown so
            far.
          </Text>
        ) : null}
        {(savings?.memberships ?? []).map((membership, index) => (
          <View
            key={`${membership.subscriptionId}:${membership.currencyCode ?? index}`}
            style={{ marginTop: 8 }}
          >
            <Text variant="label">
              {membership.membershipName} · {membership.planName}
            </Text>
            <Text variant="bodySmall">
              {membership.verifiedRedemptionCount &&
              membership.currencyCode &&
              membership.verifiedNetSavingsMinor != null
                ? `${membership.coverageState === "PARTIAL" ? "Verified savings so far: " : ""}${formatBusinessSavingsMoney(membership.verifiedNetSavingsMinor, membership.currencyCode) ?? "Unavailable"}`
                : membership.coverageState === "NO_REDEMPTION_HISTORY"
                  ? "No completed redemptions yet"
                  : "Savings history incomplete"}
            </Text>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setOpen(false);
            onHistory();
          }}
          style={{ marginTop: 16 }}
        >
          <Text variant="label" color="primary">
            View savings and redemption history
          </Text>
        </Pressable>
      </Modal>
    </>
  );
}
