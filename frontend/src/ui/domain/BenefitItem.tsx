import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "../Text";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * BenefitItem — reusable PRESENTATION of a single benefit row. No redemption
 * behaviour; presentation only.
 */
type BenefitItemProps = {
  title: string;
  subtitle?: string;
  icon?: IoniconName;
  testID?: string;
};

export function BenefitItem({ title, subtitle, icon = "gift-outline", testID }: BenefitItemProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.primarySoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color="text">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
