import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/src/providers";

import { Modal } from "./Modal";
import { Text } from "./Text";

export type ReferenceSelectItem = {
  id: string;
  name: string;
  callingCode?: string;
};

type ReferenceSelectProps = {
  label?: string;
  value: string;
  items: ReferenceSelectItem[];
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  testID?: string;
  renderItemLabel?: (item: ReferenceSelectItem) => string;
};

function defaultLabel(item: ReferenceSelectItem): string {
  if (item.callingCode) {
    return `${item.name} (${item.callingCode})`;
  }

  return item.name;
}

export function ReferenceSelect({
  label,
  value,
  items,
  onChange,
  placeholder = "Select",
  allowClear = false,
  disabled,
  testID,
  renderItemLabel = defaultLabel,
}: ReferenceSelectProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => items.find((item) => item.id === value),
    [items, value],
  );

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {label ? (
        <Text variant="label" color="textSecondary">
          {label}
        </Text>
      ) : null}

      <Pressable
        testID={testID}
        disabled={disabled}
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
          opacity: disabled
            ? theme.states.disabledOpacity
            : pressed
              ? theme.states.pressedOpacity
              : 1,
        })}
      >
        <Text variant="body" color={selected ? "text" : "textMuted"}>
          {selected ? renderItemLabel(selected) : placeholder}
        </Text>
        <Text variant="bodySmall" color="textMuted">
          ▾
        </Text>
      </Pressable>

      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title={label ?? "Select"}
        scrollable
        testID={testID ? `${testID}-modal` : undefined}
      >
        <View style={{ gap: theme.spacing.xs }}>
          {allowClear ? (
            <Pressable
              onPress={() => {
                onChange("");
                setOpen(false);
              }}
              style={({ pressed }) => ({
                minHeight: 48,
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: !value
                  ? theme.colors.primarySoft
                  : pressed
                    ? theme.colors.surfaceAlt
                    : "transparent",
                justifyContent: "center",
              })}
            >
              <Text variant="body" color={!value ? "primary" : "textMuted"}>
                {placeholder}
              </Text>
            </Pressable>
          ) : null}
          {items.map((item) => {
            const selectedItem = item.id === value;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  minHeight: 48,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radius.md,
                  backgroundColor: selectedItem
                    ? theme.colors.primarySoft
                    : pressed
                      ? theme.colors.surfaceAlt
                      : "transparent",
                  justifyContent: "center",
                })}
              >
                <Text variant="body" color={selectedItem ? "primary" : "text"}>
                  {renderItemLabel(item)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}
