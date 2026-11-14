import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { toQR } from "toqr";

import { useTheme } from "@/src/providers";

import { Text } from "../Text";

/**
 * Renders a scannable QR code using SVG.
 *
 * A single SVG coordinate system prevents module alignment
 * and flex-wrap rounding differences across Web, Android
 * and iOS.
 *
 * The original QR payload and generation algorithm are
 * preserved.
 */
type QrPlaceholderProps = {
  size?: number;
  caption?: string;
  value?: string;
  testID?: string;
};

const QR_QUIET_ZONE = 4;

export function QrPlaceholder({
  size = 180,
  caption,
  value,
  testID,
}: QrPlaceholderProps) {
  const theme = useTheme();

  const qr = useMemo(() => {
    if (!value) {
      return null;
    }

    const matrix = toQR(value);
    const dimension = Math.sqrt(matrix.length);

    if (!Number.isInteger(dimension) || dimension <= 0) {
      return null;
    }

    const totalDimension = dimension + QR_QUIET_ZONE * 2;

    const commands: string[] = [];

    for (let row = 0; row < dimension; row++) {
      for (let col = 0; col < dimension; col++) {
        const index = row * dimension + col;

        if (matrix[index]) {
          const x = col + QR_QUIET_ZONE;
          const y = row + QR_QUIET_ZONE;

          commands.push(`M${x} ${y}h1v1h-1z`);
        }
      }
    }

    return {
      totalDimension,
      path: commands.join(" "),
    };
  }, [value]);

  // Allow for the surrounding one-pixel border.
  const renderSize = Math.max(1, size - 2);

  return (
    <View
      testID={testID}
      style={{
        alignItems: "center",
        gap: theme.spacing.sm,
      }}
    >
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
        {qr ? (
          <View
            accessible
            accessibilityLabel="Redemption QR code"
            style={{
              width: renderSize,
              height: renderSize,
              backgroundColor: "#FFFFFF",
            }}
          >
            <Svg
              width={renderSize}
              height={renderSize}
              viewBox={`0 0 ${qr.totalDimension} ${qr.totalDimension}`}
            >
              <Rect
                x={0}
                y={0}
                width={qr.totalDimension}
                height={qr.totalDimension}
                fill="#FFFFFF"
              />

              <Path d={qr.path} fill="#000000" />
            </Svg>
          </View>
        ) : (
          <Ionicons
            name="qr-code-outline"
            size={size * 0.62}
            color={theme.colors.text}
          />
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
