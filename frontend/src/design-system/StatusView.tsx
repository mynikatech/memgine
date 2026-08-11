import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Text, View } from "react-native";

import { useTheme } from "@/src/business";

import { Button } from "./Button";

type StatusState = "loading" | "empty" | "error";

type StatusViewProps = {
  state: StatusState;
  title?: string;
  message?: string;
  onRetry?: () => void;
  testID?: string;
};

export function StatusView({ state, title, message, onRetry, testID }: StatusViewProps) {
  const { colors, spacing, fontSize, fontWeight } = useTheme();
  return (
    <View testID={testID} style={{ alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: 12 }}>
      {state === "loading" ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Ionicons
          name={state === "error" ? "alert-circle-outline" : "file-tray-outline"}
          size={40}
          color={colors.textMuted}
        />
      )}
      {title ? (
        <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
          {title}
        </Text>
      ) : null}
      {message ? (
        <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" }}>{message}</Text>
      ) : null}
      {state === "error" && onRetry ? (
        <Button
          label="Try again"
          variant="secondary"
          onPress={onRetry}
          testID={testID ? `${testID}-retry` : undefined}
        />
      ) : null}
    </View>
  );
}
