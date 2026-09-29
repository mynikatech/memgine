import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { toQR } from "toqr";

import { useTheme } from "@/src/providers";

import { Text } from "../Text";

/**
 * Uses the existing QR presentation surface. When a value is supplied it
 * renders a scannable QR matrix; without one it preserves the legacy icon.
 */
type QrPlaceholderProps = {
  size?: number;
  caption?: string;
  value?: string;
  testID?: string;
};

export function QrPlaceholder({ size = 150, caption, value, testID }: QrPlaceholderProps) {
  const theme = useTheme();
  const matrix = value ? toQR(value) : null;
  const dimension = matrix ? Math.sqrt(matrix.length) : 0;
  const quietZone = matrix ? 4 : 0;
  const moduleSize = matrix ? size / (dimension + quietZone * 2) : 0;
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
        {matrix ? (
          <View
            accessibilityLabel="Redemption QR code"
            style={{
              width: size,
              height: size,
              padding: quietZone * moduleSize,
              flexDirection: "row",
              flexWrap: "wrap",
            }}
          >
            {Array.from(matrix).map((module, index) => (
              <View
                key={index}
                style={{
                  width: moduleSize,
                  height: moduleSize,
                  backgroundColor: module ? "#000000" : "#FFFFFF",
                }}
              />
            ))}
          </View>
        ) : (
          <Ionicons name="qr-code-outline" size={size * 0.62} color={theme.colors.text} />
        )}
      </View>
      {caption ? (
        <Text variant="caption" color="textMuted">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
