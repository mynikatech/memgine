import { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { useTheme } from "@/src/providers";

import { Text } from "./Text";

export type DataTableColumn<T> = {
  key: string;
  title: string;
  width?: number;
  render?: (item: T) => ReactNode;
};

export type DataTableAction<T> = {
  label: string;
  onPress: (item: T) => void;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  actions?: DataTableAction<T>[];
  emptyMessage?: string;
  onRowPress?: (item: T) => void;
};

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  actions = [],
  emptyMessage = "No records found.",
  onRowPress,
}: DataTableProps<T>) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const isMobile = width < 700;

  if (data.length === 0) {
    return (
      <View
        style={[
          styles.empty,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <Text variant="body" color="textMuted">
          {emptyMessage}
        </Text>
      </View>
    );
  }

  /*
   * Mobile
   *
   * When explicit actions exist, the card itself is NOT a Pressable.
   * This prevents the View/Add buttons from being nested inside another
   * Pressable.
   */
  if (isMobile) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        {data.map((item) => {
          const content = (
            <View
              key={keyExtractor(item)}
              style={{
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.md,
              }}
            >
              <View style={{ gap: theme.spacing.sm }}>
                {columns.map((column) => (
                  <View key={column.key} style={styles.mobileRow}>
                    <Text
                      variant="caption"
                      color="textMuted"
                      style={{ flex: 1 }}
                    >
                      {column.title}
                    </Text>

                    <View
                      style={{
                        flex: 2,
                        alignItems: "flex-end",
                      }}
                    >
                      {column.render ? (
                        column.render(item)
                      ) : (
                        <Text variant="body" color="text">
                          {String(
                            (item as Record<string, unknown>)[column.key] ?? "",
                          )}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}

                {actions.length > 0 ? (
                  <View
                    style={[
                      styles.mobileActions,
                      {
                        borderTopColor: theme.colors.border,
                      },
                    ]}
                  >
                    {actions.map((action) => (
                      <Pressable
                        key={action.label}
                        onPress={() => action.onPress(item)}
                        hitSlop={8}
                        style={({ pressed }) => ({
                          paddingHorizontal: theme.spacing.md,
                          paddingVertical: theme.spacing.sm,
                          borderRadius: theme.radius.sm,
                          backgroundColor: pressed
                            ? theme.colors.surfaceAlt
                            : "transparent",
                        })}
                      >
                        <Text variant="bodySmall" color="primary">
                          {action.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          );

          if (!actions.length && onRowPress) {
            return (
              <Pressable
                key={keyExtractor(item)}
                onPress={() => onRowPress(item)}
                style={({ pressed }) => ({
                  opacity: pressed ? theme.states.pressedOpacity : 1,
                })}
              >
                {content}
              </Pressable>
            );
          }

          return content;
        })}
      </View>
    );
  }

  /*
   * Desktop
   *
   * The row is deliberately a View rather than a Pressable whenever
   * explicit actions are present.
   */
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View
        style={[
          styles.table,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          {columns.map((column) => (
            <View
              key={column.key}
              style={[
                styles.cell,
                {
                  width: column.width ?? 180,
                },
              ]}
            >
              <Text variant="label" color="textSecondary">
                {column.title}
              </Text>
            </View>
          ))}

          {actions.length > 0 ? (
            <View style={[styles.cell, { width: 150 }]}>
              <Text variant="label" color="textSecondary">
                Actions
              </Text>
            </View>
          ) : null}
        </View>

        {data.map((item) => {
          const rowContent = (
            <>
              {columns.map((column) => (
                <View
                  key={column.key}
                  style={[
                    styles.cell,
                    {
                      width: column.width ?? 180,
                    },
                  ]}
                >
                  {column.render ? (
                    column.render(item)
                  ) : (
                    <Text variant="body" color="text">
                      {String(
                        (item as Record<string, unknown>)[column.key] ?? "",
                      )}
                    </Text>
                  )}
                </View>
              ))}

              {actions.length > 0 ? (
                <View
                  style={[
                    styles.cell,
                    {
                      width: 150,
                      flexDirection: "row",
                      gap: theme.spacing.xs,
                    },
                  ]}
                >
                  {actions.map((action) => (
                    <Pressable
                      key={action.label}
                      onPress={() => action.onPress(item)}
                      hitSlop={8}
                      style={({ pressed }) => ({
                        paddingHorizontal: theme.spacing.sm,
                        paddingVertical: theme.spacing.xs,
                        borderRadius: theme.radius.sm,
                        backgroundColor: pressed
                          ? theme.colors.surfaceAlt
                          : "transparent",
                        opacity: pressed ? theme.states.pressedOpacity : 1,
                      })}
                    >
                      <Text variant="bodySmall" color="primary">
                        {action.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          );

          if (!actions.length && onRowPress) {
            return (
              <Pressable
                key={keyExtractor(item)}
                onPress={() => onRowPress(item)}
                style={({ pressed }) => [
                  styles.tableRow,
                  {
                    borderBottomColor: theme.colors.border,
                    backgroundColor: pressed
                      ? theme.colors.surfaceAlt
                      : theme.colors.card,
                  },
                ]}
              >
                {rowContent}
              </Pressable>
            );
          }

          return (
            <View
              key={keyExtractor(item)}
              style={[
                styles.tableRow,
                {
                  borderBottomColor: theme.colors.border,
                  backgroundColor: theme.colors.card,
                },
              ]}
            >
              {rowContent}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  table: {
    minWidth: 720,
    borderWidth: 1,
    overflow: "hidden",
  },

  header: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },

  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    minHeight: 64,
  },

  cell: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
  },

  empty: {
    minHeight: 160,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  mobileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  mobileActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 8,
  },
});
