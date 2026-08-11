import { View } from "react-native";

import { useTheme, useTranslation } from "@/src/providers";

import { Card } from "../Card";
import { Text } from "../Text";

/**
 * ReceiptSummary — reusable PRESENTATION foundation for a receipt / invoice
 * summary. Formats money via the localization provider. This is presentation
 * only — no invoice/transaction workflow is implemented.
 */
export type ReceiptLine = { label: string; amountMinor: number };

type ReceiptSummaryProps = {
  title?: string;
  lines: ReceiptLine[];
  totalMinor: number;
  testID?: string;
};

export function ReceiptSummary({ title, lines, totalMinor, testID }: ReceiptSummaryProps) {
  const theme = useTheme();
  const { t, formatMoney } = useTranslation();

  return (
    <Card testID={testID}>
      {title ? (
        <Text variant="title" color="text" style={{ marginBottom: theme.spacing.md }}>
          {title}
        </Text>
      ) : null}
      <View style={{ gap: theme.spacing.sm }}>
        {lines.map((line, index) => (
          <View
            key={index}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Text variant="bodySmall" color="textSecondary">
              {line.label}
            </Text>
            <Text variant="bodySmall" color="text">
              {formatMoney(line.amountMinor)}
            </Text>
          </View>
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: theme.spacing.md,
          paddingTop: theme.spacing.md,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <Text variant="bodyStrong" color="text">
          {t("receipt.total")}
        </Text>
        <Text variant="title" color="primary">
          {formatMoney(totalMinor)}
        </Text>
      </View>
    </Card>
  );
}
