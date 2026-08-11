import { View } from "react-native";

import { useTheme } from "@/src/providers";

import { Badge } from "../Badge";
import { Card } from "../Card";
import { Text } from "../Text";

/** OfferCard — reusable branded presentation of an organization offer. */
type OfferCardProps = {
  title: string;
  description?: string;
  badge?: string;
  testID?: string;
};

export function OfferCard({ title, description, badge, testID }: OfferCardProps) {
  const theme = useTheme();
  return (
    <Card testID={testID} padding="lg">
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodyStrong" color="text">
            {title}
          </Text>
          {description ? (
            <Text variant="bodySmall" color="textMuted">
              {description}
            </Text>
          ) : null}
        </View>
        {badge ? <Badge label={badge} tone="brand" /> : null}
      </View>
    </Card>
  );
}
