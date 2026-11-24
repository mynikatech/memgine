import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { formatBusinessSavingsMoney } from "@/src/core/domain/savings-display";
import type { BusinessActualSavings } from "@/src/data/api/customer-data-api";
import { Modal, Text } from "@/src/ui";

function badgeMoney(minor: number, currency: string): string | undefined {
  const formatted = formatBusinessSavingsMoney(minor, currency);
  if (!formatted) return undefined;

  if (currency === "CAD" || currency === "USD") {
    return formatted
      .replace(/\s+(CAD|USD)$/, "")
      .replace(/^(?:CA\$|US\$)/, "$");
  }

  return formatted;
}

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

  const noHistory = savings?.coverageState === "NO_REDEMPTION_HISTORY";

  const amount =
    primary &&
    badgeMoney(primary.verifiedNetSavingsMinor, primary.currencyCode);

  const zero =
    noHistory && savings?.activePlanCurrencyCode
      ? badgeMoney(0, savings.activePlanCurrencyCode)
      : undefined;

  const value =
    loading || !savings || savings.coverageState === "UNAVAILABLE"
      ? undefined
      : (amount ?? zero);

  const badgeLabel = loading
    ? "Savings…"
    : !savings || savings.coverageState === "UNAVAILABLE"
      ? "Savings —"
      : value
        ? savings.coverageState === "PARTIAL"
          ? `Verified ${value}`
          : `${value}`
        : "Your Savings";

  return (
    <>
      <Pressable
        testID="business-savings-banner"
        accessibilityRole="button"
        accessibilityLabel={`${badgeLabel}. View savings details`}
        accessibilityHint="Opens your verified savings by membership"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-end",
          gap: 4,
          paddingHorizontal: 8,
          minHeight: 36,
          minWidth: 105,
          maxWidth: 150,
          borderRadius: 24,
          borderWidth: 1.5,
          borderColor: accentColor || borderColor,
          backgroundColor,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <MaterialCommunityIcons name="piggy-bank" size={22} color="#E88BA7" />
        <Text
          variant="bodyStrong"
          numberOfLines={1}
          style={{
            color: accentColor,
            fontSize: 14,
            fontWeight: "700",
            flexShrink: 0,
          }}
        >
          {badgeLabel}
        </Text>
        <MaterialCommunityIcons
          name="chevron-down"
          size={14}
          color={accentColor}
        />
      </Pressable>

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

        {savings?.coverageState === "UNAVAILABLE" ? (
          <Text variant="bodySmall">
            Savings information is currently unavailable.
          </Text>
        ) : null}

        {noHistory ? (
          <Text variant="bodySmall">No completed redemptions yet.</Text>
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
                ? `${
                    membership.coverageState === "PARTIAL"
                      ? "Verified savings so far: "
                      : ""
                  }${
                    formatBusinessSavingsMoney(
                      membership.verifiedNetSavingsMinor,
                      membership.currencyCode,
                    ) ?? "Unavailable"
                  }`
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
          <Text variant="label" style={{ color: accentColor }}>
            View savings and redemption history
          </Text>
        </Pressable>
      </Modal>
    </>
  );
}
