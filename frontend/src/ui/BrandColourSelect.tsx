import { useState } from "react";

import { Pressable, View } from "react-native";

import { useTheme } from "@/src/providers";

import { Input } from "./Input";
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

function normalizeHexColour(value?: string): string | undefined {
  const match = value?.trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toUpperCase()}` : undefined;
}

const CUSTOM_COLOUR_HUES = [
  0, 18, 36, 52, 72, 96, 132, 158, 180, 202, 220, 240, 262, 282, 304, 326, 344,
];
const CUSTOM_COLOUR_LIGHTNESSES = [32, 42, 52, 62, 72];

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const hueSector = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSector % 2) - 1));
  const match = normalizedLightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSector < 1) {
    red = chroma;
    green = secondary;
  } else if (hueSector < 2) {
    red = secondary;
    green = chroma;
  } else if (hueSector < 3) {
    green = chroma;
    blue = secondary;
  } else if (hueSector < 4) {
    green = secondary;
    blue = chroma;
  } else if (hueSector < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  const channel = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase();
}

const CUSTOM_COLOUR_SWATCHES = CUSTOM_COLOUR_LIGHTNESSES.flatMap((lightness) =>
  CUSTOM_COLOUR_HUES.map((hue) => hslToHex(hue, 82, lightness)),
);

type ColourPickerMode = "presets" | "custom";

export function BrandColourSelect({
  label,
  value,
  onChange,
  palette = MEMGINE_COLOUR_PALETTE,
  testID,
}: BrandColourSelectProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ColourPickerMode>("presets");
  const [customColour, setCustomColour] = useState("");

  const normalizedValue = normalizeHexColour(value);

  const selected = palette.find(
    (colour) => colour.value.toUpperCase() === normalizedValue,
  );

  const isStoredCustomColour = Boolean(normalizedValue && !selected);
  const displayName =
    selected?.name ??
    (normalizedValue ? `Custom · ${normalizedValue}` : "Please select");
  const swatchColour = selected?.value ?? normalizedValue;
  const normalizedCustomColour = normalizeHexColour(customColour);

  const openSelector = () => {
    setCustomColour(normalizedValue ?? "");
    setMode(isStoredCustomColour ? "custom" : "presets");
    setOpen(true);
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>

      <Pressable
        testID={testID}
        onPress={openSelector}
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
              backgroundColor: swatchColour ?? theme.colors.surfaceAlt,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          />

          <Text variant="body" color={swatchColour ? "text" : "textMuted"}>
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
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            padding: 3,
            marginBottom: theme.spacing.md,
            backgroundColor: theme.colors.surfaceAlt,
          }}
        >
          {(["presets", "custom"] as ColourPickerMode[]).map((item) => {
            const active = mode === item;
            const tabLabel = item === "presets" ? "Presets" : "Custom";

            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setMode(item)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 38,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: theme.radius.sm,
                  backgroundColor: active
                    ? theme.colors.background
                    : "transparent",
                  opacity: pressed ? theme.states.pressedOpacity : 1,
                })}
              >
                <Text
                  variant="bodySmall"
                  color={active ? "text" : "textSecondary"}
                  style={{ fontWeight: active ? "600" : "400" }}
                >
                  {tabLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === "presets" ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: theme.spacing.md,
            }}
          >
            {palette.map((colour) => {
              const isSelected = colour.value.toUpperCase() === normalizedValue;

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
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="bodySmall" color="textSecondary">
              Choose a colour visually, or enter an exact HEX colour.
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: theme.spacing.xs,
                maxWidth: 356,
              }}
            >
              {CUSTOM_COLOUR_SWATCHES.map((colour) => {
                const isSelected = normalizedCustomColour === colour;

                return (
                  <Pressable
                    key={colour}
                    accessibilityLabel={`Use custom colour ${colour}`}
                    accessibilityRole="button"
                    onPress={() => setCustomColour(colour)}
                    style={({ pressed }) => ({
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      borderWidth: isSelected ? 3 : 1,
                      borderColor: isSelected
                        ? theme.colors.text
                        : theme.colors.border,
                      backgroundColor: colour,
                      opacity: pressed ? theme.states.pressedOpacity : 1,
                    })}
                  />
                );
              })}
            </View>

            <Input
              label="Exact HEX colour (optional)"
              value={customColour}
              onChangeText={setCustomColour}
              placeholder="#123456"
              autoCapitalize="characters"
              maxLength={7}
              error={
                customColour.trim() && !normalizedCustomColour
                  ? "Use a six-digit HEX colour, for example #123456."
                  : undefined
              }
              testID={testID ? `${testID}-custom` : undefined}
            />

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: theme.spacing.sm,
              }}
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
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor:
                      normalizedCustomColour ?? theme.colors.surfaceAlt,
                  }}
                />

                <Text variant="bodySmall" color="textSecondary">
                  {normalizedCustomColour ?? "Select a colour"}
                </Text>
              </View>

              <Pressable
                disabled={!normalizedCustomColour}
                onPress={() => {
                  if (!normalizedCustomColour) {
                    return;
                  }

                  onChange(normalizedCustomColour);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  minHeight: 40,
                  justifyContent: "center",
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.primary,
                  opacity: !normalizedCustomColour
                    ? theme.states.disabledOpacity
                    : pressed
                      ? theme.states.pressedOpacity
                      : 1,
                })}
              >
                <Text variant="bodySmall" color="onPrimary">
                  Apply custom colour
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}
