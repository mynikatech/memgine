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
  numberOfLines?: number;
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

  /**
   * Minimum width of the complete desktop table.
   *
   * If the columns require more space, the columns determine
   * the table width.
   *
   * If the requested minimum is larger than the sum of the
   * column widths, the additional space is distributed equally
   * across the data columns.
   *
   * The Actions column is never expanded.
   */
  minTableWidth?: number;
};

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  actions = [],
  emptyMessage = "No records found.",
  onRowPress,
  minTableWidth = 720,
}: DataTableProps<T>) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const isMobile = width < 700;

  /* ---------------------------------------------------------------
   * Empty state
   * --------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------
   * Mobile
   *
   * Keep the existing card-based mobile experience.
   * --------------------------------------------------------------- */

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
                        minWidth: 0,
                        alignItems: "flex-end",
                      }}
                    >
                      {column.render ? (
                        column.render(item)
                      ) : (
                        <Text variant="body" color="text" numberOfLines={1}>
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

  /* ---------------------------------------------------------------
   * Desktop table width
   *
   * First establish the natural width of every column.
   *
   * Then, if minTableWidth is larger, distribute the additional
   * width across DATA columns only.
   *
   * Actions remains fixed at 150px.
   * --------------------------------------------------------------- */

  const actionsWidth = actions.length > 0 ? 150 : 0;

  const baseColumnWidths = columns.map((column) => column.width ?? 180);

  const baseColumnsWidth = baseColumnWidths.reduce(
    (total, columnWidth) => total + columnWidth,
    0,
  );

  const baseTableWidth = baseColumnsWidth + actionsWidth;

  const tableWidth = Math.max(minTableWidth, baseTableWidth);

  const extraWidth =
    tableWidth > baseTableWidth ? tableWidth - baseTableWidth : 0;

  const extraWidthPerColumn =
    columns.length > 0 ? extraWidth / columns.length : 0;

  const getColumnWidth = (index: number) =>
    baseColumnWidths[index] + extraWidthPerColumn;

  /* ---------------------------------------------------------------
   * Desktop
   * --------------------------------------------------------------- */

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={true}
      style={styles.horizontalScroll}
      contentContainerStyle={{
        minWidth: tableWidth,
      }}
    >
      <View
        style={[
          styles.table,
          {
            width: tableWidth,
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        {/* =========================================================
            HEADER
            ========================================================= */}

        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          {columns.map((column, index) => (
            <View
              key={column.key}
              style={[
                styles.cell,
                styles.fixedCell,
                {
                  width: getColumnWidth(index),
                },
              ]}
            >
              <Text variant="label" color="textSecondary" numberOfLines={1}>
                {column.title}
              </Text>
            </View>
          ))}

          {actions.length > 0 ? (
            <View
              style={[
                styles.cell,
                styles.fixedCell,
                {
                  width: actionsWidth,
                },
              ]}
            >
              <Text variant="label" color="textSecondary" numberOfLines={1}>
                Actions
              </Text>
            </View>
          ) : null}
        </View>

        {/* =========================================================
            ROWS
            ========================================================= */}

        {data.map((item) => {
          const rowContent = (
            <>
              {columns.map((column, index) => (
                <View
                  key={column.key}
                  style={[
                    styles.cell,
                    styles.fixedCell,
                    {
                      width: getColumnWidth(index),
                    },
                  ]}
                >
                  {column.render ? (
                    column.render(item)
                  ) : (
                    <Text variant="body" color="text" numberOfLines={1}>
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
                    styles.fixedCell,
                    styles.actionsCell,
                    {
                      width: actionsWidth,
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
                      <Text
                        variant="bodySmall"
                        color="primary"
                        numberOfLines={1}
                      >
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
  horizontalScroll: {
    width: "100%",
  },

  table: {
    borderWidth: 1,
    overflow: "hidden",
    alignSelf: "flex-start",
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

  /*
   * Prevent the browser from shrinking columns.
   *
   * This is critical for the desktop table.
   */
  fixedCell: {
    flexShrink: 0,
  },

  cell: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
    overflow: "hidden",
  },

  actionsCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
