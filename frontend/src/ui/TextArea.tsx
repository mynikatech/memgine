import { useState } from "react";

import { TextInput, View } from "react-native";

import { useTheme } from "@/src/providers";

import { FieldLabel } from "./FieldLabel";
import { Text } from "./Text";

type TextAreaProps = {
  label?: string;
  required?: boolean;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  testID?: string;
  maxLength?: number;
};

export function TextArea({
  label,
  required = false,
  value,
  onChangeText,
  placeholder,
  error,
  testID,
  maxLength,
}: TextAreaProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.primary
      : theme.colors.border;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {label ? <FieldLabel label={label} required={required} /> : null}

      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        multiline
        textAlignVertical="top"
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          borderWidth: 1,
          borderColor,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          fontSize: theme.typography.body.fontSize,
          lineHeight: theme.typography.body.lineHeight,
          color: theme.colors.text,
          backgroundColor: theme.colors.background,
          minHeight: 104,
        }}
      />

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
