import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "./Text";
import { useTheme } from "@/src/providers";

type CheckboxProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  testID?: string;
};

export function Checkbox({
  value,
  onValueChange,
  label,
  description,
  disabled = false,
  testID,
}: CheckboxProps) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.row,
        {
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: value ? theme.colors.primary : theme.colors.border,
            backgroundColor: value ? theme.colors.primary : theme.colors.card,
          },
        ]}
      >
        {value ? (
          <Text variant="bodyStrong" color="text">
            ✓
          </Text>
        ) : null}
      </View>

      <View style={styles.content}>
        <Text variant="bodyStrong" color="text">
          {label}
        </Text>

        {description ? (
          <Text variant="bodySmall" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  box: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },

  content: {
    flex: 1,
    gap: 4,
  },
});
