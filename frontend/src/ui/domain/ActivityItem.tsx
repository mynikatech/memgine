import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "../Text";

type IoniconName = keyof typeof Ionicons.glyphMap;

/** ActivityItem — reusable presentation of a single history/activity entry. */
type ActivityItemProps = {
  title: string;
  subtitle?: string;
  icon?: IoniconName;
  testID?: string;
};

export function ActivityItem({ title, subtitle, icon = "checkmark-done-outline", testID }: ActivityItemProps) {
  const theme = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.successSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={18} color={theme.colors.success} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color="text">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
