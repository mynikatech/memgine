import { useState } from "react";

import {
  KeyboardTypeOptions,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

import { useTheme } from "@/src/providers";

import { FieldLabel } from "./FieldLabel";
import { Text } from "./Text";

export type InputProps = {
  label?: string;
  required?: boolean;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  error?: string;
  testID?: string;
  maxLength?: number;
  editable?: boolean;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoCorrect?: boolean;
  returnKeyType?: TextInputProps["returnKeyType"];
  onFocus?: () => void;
  onBlur?: () => void;
};

export function Input({
  label,
  required = false,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  error,
  testID,
  maxLength,
  editable = true,
  autoCapitalize,
  autoCorrect,
  returnKeyType,
  onFocus,
  onBlur,
}: InputProps) {
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
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        maxLength={maxLength}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        returnKeyType={returnKeyType}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        style={{
          borderWidth: 1,
          borderColor,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 12,
          fontSize: theme.typography.body.fontSize,
          color: theme.colors.text,
          backgroundColor: theme.colors.background,
          minHeight: 48,
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
