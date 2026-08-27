import { useMemo, useState } from "react";

import { Pressable, View } from "react-native";

import { useTheme } from "@/src/providers";

import { FieldLabel } from "./FieldLabel";
import { Modal } from "./Modal";
import { Text } from "./Text";

export type ReferenceSelectItem = {
  id: string;
  name: string;
  callingCode?: string;
};

type ReferenceSelectProps<T> = {
  label?: string;
  required?: boolean;
  value: string;
  items: T[];
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  error?: string;
  testID?: string;

  /**
   * Returns the identifier used as the selected value.
   *
   * Defaults to reading `item.id`.
   */
  getItemId?: (item: T) => string;

  /**
   * Returns the text displayed for an item.
   *
   * Defaults to:
   * - item.name
   * - item.statusName
   * - item.code
   * - item.statusCode
   * - String(item.id)
   *
   * Prefer supplying this explicitly for domain-specific types.
   */
  renderItemLabel?: (item: T) => string;
};

function defaultItemId<T>(item: T): string {
  const candidate = item as { id?: unknown };

  return String(candidate.id ?? "");
}

function defaultItemLabel<T>(item: T): string {
  const candidate = item as {
    name?: unknown;
    statusName?: unknown;
    code?: unknown;
    statusCode?: unknown;
    id?: unknown;
    callingCode?: unknown;
  };

  if (candidate.name) {
    if (candidate.callingCode) {
      return `${String(candidate.name)} (${String(candidate.callingCode)})`;
    }

    return String(candidate.name);
  }

  if (candidate.statusName) {
    return String(candidate.statusName);
  }

  if (candidate.code) {
    return String(candidate.code);
  }

  if (candidate.statusCode) {
    return String(candidate.statusCode);
  }

  return String(candidate.id ?? "");
}

export function ReferenceSelect<T>({
  label,
  required = false,
  value,
  items,
  onChange,
  placeholder = "Select",
  allowClear = false,
  disabled,
  error,
  testID,
  getItemId = defaultItemId,
  renderItemLabel = defaultItemLabel,
}: ReferenceSelectProps<T>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => items.find((item) => getItemId(item) === value),
    [items, value, getItemId],
  );

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {label ? <FieldLabel label={label} required={required} /> : null}

      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minHeight: 48,
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.border,
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

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}

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
            const itemId = getItemId(item);
            const selectedItem = itemId === value;

            return (
              <Pressable
                key={itemId}
                onPress={() => {
                  onChange(itemId);
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
