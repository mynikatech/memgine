import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "../Text";

/**
 * QrPlaceholder — VISUAL placeholder only. Real QR generation/scanning is out
 * of scope; this represents the QR area from the approved visual direction.
 */
type QrPlaceholderProps = {
  size?: number;
  caption?: string;
  testID?: string;
};

export function QrPlaceholder({ size = 150, caption, testID }: QrPlaceholderProps) {
  const theme = useTheme();
  return (
    <View testID={testID} style={{ alignItems: "center", gap: theme.spacing.sm }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: theme.radius.md,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="qr-code-outline" size={size * 0.62} color={theme.colors.text} />
      </View>
      {caption ? (
        <Text variant="caption" color="textMuted">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
