import { useState } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/src/providers";

import { Modal } from "./Modal";
import { Text } from "./Text";

export type BrandColourItem = {
  name: string;
  value: string;
};

export type BrandColourSelectProps = {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  palette?: BrandColourItem[];
  testID?: string;
};

export const MEMGINE_COLOUR_PALETTE: BrandColourItem[] = [
  { name: "Teal", value: "#0F766E" },
  { name: "Blue", value: "#2563EB" },
  { name: "Indigo", value: "#4F46E5" },
  { name: "Purple", value: "#7C3AED" },
  { name: "Rose", value: "#E11D48" },
  { name: "Red", value: "#DC2626" },
  { name: "Orange", value: "#EA580C" },
  { name: "Terracotta", value: "#C2410C" },
  { name: "Amber", value: "#D97706" },
  { name: "Green", value: "#16A34A" },
  { name: "Emerald", value: "#059669" },
  { name: "Slate", value: "#475569" },
];

export function BrandColourSelect({
  label,
  value,
  onChange,
  palette = MEMGINE_COLOUR_PALETTE,
  testID,
}: BrandColourSelectProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const selected = palette.find(
    (colour) => colour.value.toUpperCase() === value?.toUpperCase(),
  );

  const displayName = selected?.name ?? "Please select";

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>

      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: 48,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          backgroundColor: theme.colors.background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: pressed ? theme.states.pressedOpacity : 1,
        })}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.sm,
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: selected?.value ?? theme.colors.surfaceAlt,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          />

          <Text variant="body" color={selected ? "text" : "textMuted"}>
            {displayName}
          </Text>
        </View>

        <Text variant="bodySmall" color="textMuted">
          ▾
        </Text>
      </Pressable>

      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        testID={testID ? `${testID}-modal` : undefined}
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.spacing.md,
          }}
        >
          {palette.map((colour) => {
            const isSelected =
              colour.value.toUpperCase() === value?.toUpperCase();

            return (
              <Pressable
                key={colour.value}
                onPress={() => {
                  onChange(colour.value);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  width: 96,
                  minHeight: 88,
                  borderRadius: theme.radius.md,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected
                    ? theme.colors.primary
                    : theme.colors.border,
                  backgroundColor: pressed
                    ? theme.colors.surfaceAlt
                    : theme.colors.background,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: theme.spacing.xs,
                })}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: colour.value,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                />

                <Text
                  variant="caption"
                  color={isSelected ? "primary" : "textSecondary"}
                >
                  {colour.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}
