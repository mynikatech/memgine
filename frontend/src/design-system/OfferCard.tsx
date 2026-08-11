import { Text, View } from "react-native";

import { useTheme } from "@/src/business";

import { Card } from "./Card";

type OfferCardProps = {
  title: string;
  description: string;
  badge?: string;
  validUntil?: string;
  testID?: string;
};

export function OfferCard({ title, description, badge, validUntil, testID }: OfferCardProps) {
  const { colors, radius, fontSize, fontWeight } = useTheme();
  return (
    <Card testID={testID}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
            {title}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>{description}</Text>
          {validUntil ? (
            <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 8 }}>
              Valid until {validUntil}
            </Text>
          ) : null}
        </View>
        {badge ? (
          <View
            style={{
              backgroundColor: colors.primarySoft,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: radius.pill,
            }}
          >
            <Text style={{ color: colors.primary, fontSize: fontSize.xs, fontWeight: fontWeight.semibold }}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
