import { useMemo, useState } from "react";

import { Modal as RNModal, Pressable, StyleSheet, View } from "react-native";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

import { useTheme } from "@/src/providers";

import { FieldLabel } from "./FieldLabel";
import { Text } from "./Text";

export type DateInputProps = {
  label?: string;
  value?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  minimumDate?: string;
  maximumDate?: string;
  onChange: (value?: string) => void;
  error?: string;
  testID?: string;
};

function toDate(value?: string): Date {
  if (!value) {
    return new Date();
  }

  const parsed = parseISO(value);

  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function DateInput({
  label,
  value,
  required = false,
  disabled = false,
  placeholder = "Select date",
  minimumDate,
  maximumDate,
  onChange,
  error,
}: DateInputProps) {
  const theme = useTheme();

  const [open, setOpen] = useState(false);

  const [month, setMonth] = useState(() => startOfMonth(toDate(value)));

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), {
          weekStartsOn: 0,
        }),
        end: endOfWeek(endOfMonth(month), {
          weekStartsOn: 0,
        }),
      }),
    [month],
  );

  const selected = value ? toDate(value) : undefined;

  const min = minimumDate ? toDate(minimumDate) : undefined;

  const max = maximumDate ? toDate(maximumDate) : undefined;

  const selectDate = (date: Date) => {
    if (min && date < min) {
      return;
    }

    if (max && date > max) {
      return;
    }

    onChange(format(date, "yyyy-MM-dd"));

    setOpen(false);
  };

  const displayValue = value
    ? format(toDate(value), "dd MMM yyyy")
    : placeholder;

  return (
    <View style={styles.container}>
      {label ? <FieldLabel label={label} required={required} /> : null}

      <Pressable
        disabled={disabled}
        onPress={() => {
          setMonth(startOfMonth(toDate(value)));
          setOpen(true);
        }}
        style={[
          styles.input,
          {
            borderColor: error ? "#DC2626" : theme.colors.border,

            backgroundColor: disabled
              ? theme.colors.surfaceAlt
              : theme.colors.surface,

            opacity: disabled ? theme.states.disabledOpacity : 1,
          },
        ]}
      >
        <Text variant="body" color={value ? "text" : "textMuted"}>
          {displayValue}
        </Text>

        <Text variant="body" color="textMuted">
          ▾
        </Text>
      </Pressable>

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}

      <RNModal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.calendar,
              {
                backgroundColor: theme.colors.surface,
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.calendarHeader}>
              <Pressable onPress={() => setMonth(subMonths(month, 1))}>
                <Text variant="title" color="text">
                  ‹
                </Text>
              </Pressable>

              <Text variant="title" color="text">
                {format(month, "MMMM yyyy")}
              </Text>

              <Pressable onPress={() => setMonth(addMonths(month, 1))}>
                <Text variant="title" color="text">
                  ›
                </Text>
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <Text
                  key={`${day}-${index}`}
                  variant="caption"
                  color="textMuted"
                >
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.days}>
              {days.map((day) => {
                const disabledDay = (min && day < min) || (max && day > max);

                const isSelected = selected && isSameDay(day, selected);

                return (
                  <Pressable
                    key={day.toISOString()}
                    disabled={Boolean(disabledDay)}
                    onPress={() => selectDate(day)}
                    style={[
                      styles.day,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : "transparent",

                        opacity: disabledDay ? 0.35 : 1,
                      },
                    ]}
                  >
                    <Text
                      variant="bodySmall"
                      color={isSelected ? "background" : "text"}
                    >
                      {format(day, "d")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => setOpen(false)}
              style={[
                styles.closeButton,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                },
              ]}
            >
              <Text variant="body" color="text">
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </RNModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },

  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  calendar: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 14,
    padding: 18,
    gap: 14,
  },

  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  weekRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },

  days: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  day: {
    width: "14.2857%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },

  closeButton: {
    minHeight: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
