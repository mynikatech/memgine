import { KeyboardTypeOptions, Text, TextInput, View } from "react-native";

import { useTheme } from "@/src/business";

type InputProps = {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  testID?: string;
};

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  testID,
}: InputProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.sm,
          paddingVertical: 12,
          fontSize: fontSize.md,
          color: colors.text,
          backgroundColor: colors.background,
          minHeight: 48,
        }}
      />
    </View>
  );
}
