import { Text, View } from "react-native";

import { useTheme } from "@/src/business";

export type TableColumn = { key: string; label: string; flex?: number };
export type TableRow = Record<string, string | number>;

type TableProps = {
  columns: TableColumn[];
  data: TableRow[];
  testID?: string;
};

export function Table({ columns, data, testID }: TableProps) {
  const { colors, radius, spacing, fontSize, fontWeight } = useTheme();
  return (
    <View
      testID={testID}
      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" }}
    >
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.surface,
          paddingVertical: 12,
          paddingHorizontal: spacing.sm,
        }}
      >
        {columns.map((col) => (
          <Text
            key={col.key}
            style={{
              flex: col.flex ?? 1,
              color: colors.textMuted,
              fontSize: fontSize.xs,
              fontWeight: fontWeight.semibold,
            }}
          >
            {col.label}
          </Text>
        ))}
      </View>
      {data.map((row, index) => (
        <View
          key={index}
          style={{
            flexDirection: "row",
            paddingVertical: 12,
            paddingHorizontal: spacing.sm,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: colors.border,
          }}
        >
          {columns.map((col) => (
            <Text
              key={col.key}
              style={{ flex: col.flex ?? 1, color: colors.text, fontSize: fontSize.sm }}
            >
              {String(row[col.key] ?? "")}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
