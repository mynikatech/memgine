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
  // Reds / Pinks
  { name: "Red", value: "#DC2626" },
  { name: "Crimson", value: "#B91C1C" },
  { name: "Rose", value: "#E11D48" },
  { name: "Pink", value: "#DB2777" },
  { name: "Fuchsia", value: "#C026D3" },

  // Orange / Warm
  { name: "Orange", value: "#EA580C" },
  { name: "Tangerine", value: "#F97316" },
  { name: "Terracotta", value: "#C2410C" },
  { name: "Amber", value: "#D97706" },
  { name: "Gold", value: "#CA8A04" },
  { name: "Mustard", value: "#A16207" },

  // Greens
  { name: "Lime", value: "#65A30D" },
  { name: "Green", value: "#16A34A" },
  { name: "Emerald", value: "#059669" },
  { name: "Forest", value: "#166534" },

  // Teal / Cyan
  { name: "Teal", value: "#0F766E" },
  { name: "Sea Green", value: "#0D9488" },
  { name: "Turquoise", value: "#0891B2" },
  { name: "Cyan", value: "#06B6D4" },

  // Blues
  { name: "Sky Blue", value: "#0284C7" },
  { name: "Blue", value: "#2563EB" },
  { name: "Royal Blue", value: "#1D4ED8" },
  { name: "Indigo", value: "#4F46E5" },
  { name: "Navy", value: "#1E3A8A" },

  // Purples
  { name: "Violet", value: "#7C3AED" },
  { name: "Purple", value: "#9333EA" },
  { name: "Plum", value: "#7E22CE" },

  // Neutrals
  { name: "Slate", value: "#475569" },
  { name: "Charcoal", value: "#374151" },
  { name: "Brown", value: "#92400E" },
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
                  width: 88,
                  minHeight: 82,
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
