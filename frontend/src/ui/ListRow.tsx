import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "./Text";

type IoniconName = keyof typeof Ionicons.glyphMap;

type ListRowProps = {
  label: string;
  value?: string;
  icon?: IoniconName;
  onPress?: () => void;
  right?: ReactNode;
  showChevron?: boolean;
  testID?: string;
};

/** Reusable settings/list row (label + optional value/icon/chevron). */
export function ListRow({
  label,
  value,
  icon,
  onPress,
  right,
  showChevron = true,
  testID,
}: ListRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        opacity: pressed && onPress ? 0.7 : 1,
      })}
    >
      {icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={18} color={theme.colors.textSecondary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="body" color="text">
          {label}
        </Text>
      </View>
      {value ? (
        <Text variant="bodySmall" color="textMuted">
          {value}
        </Text>
      ) : null}
      {right}
      {onPress && showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      ) : null}
    </Pressable>
  );
}
