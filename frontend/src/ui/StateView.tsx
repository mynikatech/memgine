import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";

import { useTheme } from "@/src/providers";

import { Button } from "./Button";
import { Text } from "./Text";

type StateKind = "loading" | "empty" | "error";

type StateViewProps = {
  kind: StateKind;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

/** Unified loading / empty / error presentation. */
export function StateView({ kind, title, message, actionLabel, onAction, testID }: StateViewProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing.xxl,
        gap: theme.spacing.md,
      }}
    >
      {kind === "loading" ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <Ionicons
          name={kind === "error" ? "alert-circle-outline" : "file-tray-outline"}
          size={40}
          color={theme.colors.textMuted}
        />
      )}
      {title ? (
        <Text variant="title" color="text">
          {title}
        </Text>
      ) : null}
      {message ? (
        <Text variant="bodySmall" color="textMuted" style={{ textAlign: "center" }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} testID={testID ? `${testID}-action` : undefined} />
      ) : null}
    </View>
  );
}
