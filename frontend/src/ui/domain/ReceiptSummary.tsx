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
export type ReceiptMeta = { label: string; value: string };

type ReceiptSummaryProps = {
  title?: string;
  meta?: ReceiptMeta[];
  lines: ReceiptLine[];
  totalMinor: number;
  testID?: string;
};

export function ReceiptSummary({ title, meta, lines, totalMinor, testID }: ReceiptSummaryProps) {
  const theme = useTheme();
  const { t, formatMoney } = useTranslation();

  return (
    <Card testID={testID}>
      {title ? (
        <Text variant="title" color="text" style={{ marginBottom: theme.spacing.md }}>
          {title}
        </Text>
      ) : null}
      {meta && meta.length ? (
        <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
          {meta.map((m, index) => (
            <View
              key={index}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}
            >
              <Text variant="bodySmall" color="textMuted">
                {m.label}
              </Text>
              <Text variant="bodySmall" color="text" style={{ flexShrink: 1, textAlign: "right" }}>
                {m.value}
              </Text>
            </View>
          ))}
        </View>
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
