import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { BusinessThemeScope } from "@/src/providers";
import { buildTheme } from "@/src/theme/theme";
import { Text } from "@/src/ui";

type Props = {
  merchantName?: string;
  branding?: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
  } | null;
  heading?: string;
  subtitle?: string;
  payment: ReactNode;
  summary: ReactNode;
};

/** One responsive shell for Join and mobile browser checkout.
 * Wallets are deliberately not rendered until there is a functioning integration.
 * This component never receives card data or computes prices.
 */
export function CollectCheckoutLayout({
  merchantName,
  branding,
  heading = "Complete your payment",
  subtitle = "Enter your details to complete your membership purchase.",
  payment,
  summary,
}: Props) {
  const { width } = useWindowDimensions();
  const desktop = width >= 800;
  const theme = buildTheme(
    branding
      ? {
          primaryColor: branding.primaryColor ?? undefined,
          secondaryColor: branding.secondaryColor ?? undefined,
          accentColor: branding.accentColor ?? undefined,
        }
      : undefined,
  );
  const paymentPanel = (
    <View style={{ flex: desktop ? 1.2 : undefined, minWidth: 0, gap: 18 }}>
      <View style={{ gap: 5 }}>
        <Text variant="h2">{heading}</Text>
        <Text variant="bodySmall" color="textMuted">
          Choose how you would like to pay.
        </Text>
      </View>
      {/* Wallets remain hidden until the SDK integration is verified. */}
      <View style={{ gap: 10 }}>{payment}</View>
      <Text variant="bodySmall" color="textMuted">
        Card information is handled securely by Poynt.
      </Text>
    </View>
  );

  const summaryPanel = (
    <View
      style={{
        flex: desktop ? 0.88 : undefined,
        minWidth: 0,
        borderLeftWidth: desktop ? 1 : 0,
        borderBottomWidth: desktop ? 0 : 1,
        borderColor: theme.colors.border,
        paddingLeft: desktop ? 24 : 0,
        paddingBottom: desktop ? 0 : 20,
        gap: 12,
      }}
    >
      <Text variant="h2">Order summary</Text>
      {summary}
    </View>
  );

  return (
    <BusinessThemeScope theme={theme}>
    <View
      style={{
        width: "100%",
        maxWidth: 1040,
        alignSelf: "center",
        gap: 18,
        paddingVertical: 12,
      }}
    >
      <View style={{ gap: 5 }}>
        {merchantName ? (
          <Text variant="bodyStrong" color="primary">
            {merchantName}
          </Text>
        ) : null}
        <Text variant="h2" color="primary">Secure membership checkout</Text>
        <Text variant="bodySmall" color="textMuted">
          {subtitle}
        </Text>
      </View>
      <View
        style={{
          flexDirection: desktop ? "row" : "column",
          gap: desktop ? 32 : 20,
          width: "100%",
          padding: desktop ? 28 : 18,
          borderRadius: 18,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.primary,
        }}
      >
        {desktop ? (
          <>
            {paymentPanel}
            {summaryPanel}
          </>
        ) : (
          <>
            {summaryPanel}
            {paymentPanel}
          </>
        )}
      </View>
    </View>
    </BusinessThemeScope>
  );
}
