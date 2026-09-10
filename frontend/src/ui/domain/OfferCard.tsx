import { Image, Pressable, View } from "react-native";

import { useTheme } from "@/src/providers";

import { Badge } from "../Badge";
import { Button } from "../Button";
import { Card } from "../Card";
import { Text } from "../Text";

/**
 * OfferCard — reusable mobile-first presentation of an organization offer.
 *
 * The offer image is rendered with "contain" so customer-facing artwork is
 * not cropped. The card keeps each offer visually separate and supports the
 * canonical Offer fields without coupling the component to business data.
 */
type OfferCardProps = {
  title: string;
  description?: string;
  imageUrl?: string;
  badge?: string;
  availabilityText?: string;
  discountPercentage?: number;
  ctaLabel?: string;
  onPress?: () => void;
  testID?: string;
};

export function OfferCard({
  title,
  description,
  imageUrl,
  badge,
  availabilityText,
  discountPercentage,
  ctaLabel,
  onPress,
  testID,
}: OfferCardProps) {
  const theme = useTheme();

  const content = (
    <Card
      testID={testID}
      padding="lg"
      style={{
        overflow: "hidden",
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: theme.spacing.md,
        }}
      >
        {imageUrl ? (
          <View
            style={{
              width: 88,
              height: 72,
              borderRadius: theme.radius.md,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.surfaceAlt,
              flexShrink: 0,
            }}
          >
            <Image
              source={{ uri: imageUrl }}
              resizeMode="contain"
              style={{
                width: "100%",
                height: "100%",
              }}
              accessibilityLabel={`${title} offer`}
            />
          </View>
        ) : null}

        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: theme.spacing.sm,
            }}
          >
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              {badge ? <Badge label={badge} tone="brand" /> : null}

              <Text variant="bodyStrong" color="text">
                {title}
              </Text>
            </View>

            {discountPercentage !== undefined ? (
              <Badge label={`${discountPercentage}% OFF`} tone="brand" />
            ) : null}
          </View>

          {description ? (
            <Text variant="bodySmall" color="textSecondary">
              {description}
            </Text>
          ) : null}

          {availabilityText ? (
            <Text variant="caption" color="textMuted">
              {availabilityText}
            </Text>
          ) : null}

          {ctaLabel ? (
            onPress ? (
              <Button
                label={ctaLabel}
                size="sm"
                onPress={onPress}
                testID={testID ? `${testID}-cta` : undefined}
              />
            ) : (
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.primarySoft,
                }}
              >
                <Text variant="label" color="primary">
                  {ctaLabel}
                </Text>
              </View>
            )
          ) : null}
        </View>
      </View>
    </Card>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        opacity: pressed ? theme.states.pressedOpacity : 1,
      })}
    >
      {content}
    </Pressable>
  );
}
