import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { MembershipPotentialSavings } from "@/src/core/domain/entities";
import { potentialSavingsDisplay } from "@/src/core/domain/savings-display";
import { CardStyle, type Status } from "@/src/core";
import type { BrandingDecorationConfig } from "@/src/core/branding-decoration.types";
import { BrandLogo } from "../BrandLogo";
import { Modal } from "../Modal";
import { Text } from "../Text";
import { DecorativeThemeSurface } from "./DecorativeThemeSurface";
import {
  DecorativeContentThemeScope,
  useDecorativeContentTheme,
} from "./DecorativeContentTheme";

type MembershipCardProps = {
  organizationName: string;
  logoUrl?: string;
  tier: string;
  validUntil: string;
  publishedPlan?: { price: string; duration: string };
  status?: Status | null;
  cardStyle?: CardStyle;
  testID?: string;
  showPotentialSavings?: boolean;
  potentialSavings?: MembershipPotentialSavings | null;
  showActualSavings?: boolean;
  actualSavingsValues?: readonly string[];
  partialSavingsValues?: readonly string[];
  actualSavingsMessage?: string;
  onViewSavingsHistory?: () => void;
  children?: ReactNode;
  decoration?: BrandingDecorationConfig | null;
  decorationImageUrl?: string | null;
  decorationBackgroundColor?: string;
};

/** Presentation only; membership entitlement and payment logic remain elsewhere. */
export function MembershipCard({
  organizationName,
  logoUrl,
  tier,
  validUntil,
  publishedPlan,
  status,
  cardStyle = CardStyle.MODERN,
  testID,
  showPotentialSavings = false,
  potentialSavings,
  showActualSavings = false,
  actualSavingsValues = [],
  partialSavingsValues = [],
  actualSavingsMessage,
  onViewSavingsHistory,
  children,
  decoration,
  decorationImageUrl,
  decorationBackgroundColor,
}: MembershipCardProps) {
  const initial = organizationName.trim().charAt(0).toUpperCase();
  const active = status?.statusCode === "ACTIVE";
  const decorative =
    !!decoration &&
    decoration.style !== "NONE" &&
    decoration.cardTreatment !== "SOLID";
  const imageOverlay =
    decorative &&
    decoration?.cardTreatment === "IMAGE_OVERLAY" &&
    !!decorationImageUrl;
  const theme = useDecorativeContentTheme(imageOverlay);
  const surface =
    cardStyle === CardStyle.CLASSIC
      ? theme.colors.primarySoft
      : cardStyle === CardStyle.MINIMAL
        ? theme.colors.background
        : theme.colors.card;
  const [savingsDetailsOpen, setSavingsDetailsOpen] = useState(false);
  const savings = potentialSavingsDisplay(potentialSavings);
  const showAccentBar = cardStyle !== CardStyle.MINIMAL;
  const tileStyle: ViewStyle = {
    flexGrow: 1,
    flexBasis: 108,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  };
  const actualTileStyle = {
    ...tileStyle,
    backgroundColor: theme.colors.primarySoft,
  };
  const actualTileContent = (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.xs,
        }}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" aria-hidden={true}>
          <Circle
            cx={13}
            cy={5}
            r={3}
            fill="#FDD67C"
            stroke="#74451E"
            strokeWidth={1.2}
          />
          <Path
            d="M5 12c0-3 3-5 8-5 1 0 2 .1 3 .5l3-2v4l2 2h2v5h-3l-2 2v3h-3v-2H9v2H6v-4c-2-1-3-3-3-5H1"
            fill="#F9A8B2"
            stroke="#833F56"
            strokeWidth={1.25}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Circle cx={17} cy={11.5} r={0.9} fill="#643448" />
          <Path
            d="M10 9h4"
            stroke="#833F56"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        </Svg>
        <Text variant="caption" style={{ flexShrink: 1 }}>
          Actual Savings
        </Text>
      </View>
      {actualSavingsValues.map((value) => (
        <Text key={value} variant="bodyStrong">
          {value}
        </Text>
      ))}
      {partialSavingsValues.length > 0 && (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color="textMuted">Verified savings so far</Text>
          {partialSavingsValues.map((value) => (
            <Text key={value} variant="bodyStrong">{value}</Text>
          ))}
        </View>
      )}
      {actualSavingsMessage && (
        <Text variant="bodySmall">{actualSavingsMessage}</Text>
      )}
      {onViewSavingsHistory && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text variant="caption" style={{ flexShrink: 1 }}>
            View history
          </Text>
          <Ionicons
            name="chevron-forward"
            size={12}
            color={theme.colors.text}
          />
        </View>
      )}
    </>
  );

  const card = (
    <View
      style={[
        {
          borderRadius: decorative ? 15 : theme.radius.lg,
          borderWidth: decorative ? 0 : 1,
          borderColor:
            cardStyle === CardStyle.CLASSIC
              ? theme.colors.primarySoft
              : theme.colors.border,
          backgroundColor: imageOverlay ? "rgba(255,255,255,0.94)" : surface,
          overflow: "hidden",
          minHeight: 172,
        },
        decorative
          ? undefined
          : cardStyle === CardStyle.MINIMAL
            ? theme.shadows.sm
            : theme.shadows.md,
      ]}
    >
      {showAccentBar ? (
        <View style={{ height: 6, backgroundColor: theme.colors.primary }} />
      ) : null}
      <View
        style={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          flex: 1,
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing.sm,
              flex: 1,
              minWidth: 0,
            }}
          >
            <BrandLogo
              logoUrl={logoUrl}
              monogram={initial}
              fit="cover"
              size={40}
              borderRadius={theme.radius.md}
            />
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textMuted">
                MEMBERSHIP
              </Text>
              <Text variant="bodyStrong" color="text" numberOfLines={2}>
                {organizationName}
              </Text>
            </View>
          </View>
          {!publishedPlan && <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: active
                ? theme.colors.successSoft
                : theme.colors.surfaceAlt,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: theme.radius.pill,
            }}
          >
            <Ionicons
              name={active ? "checkmark-circle" : "time-outline"}
              size={14}
              color={active ? theme.colors.success : theme.colors.textMuted}
            />
            <Text variant="caption" color={active ? "success" : "textMuted"}>
              {status?.statusName ?? "—"}
            </Text>
          </View>}
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="display" color="text" numberOfLines={2}>
            {tier || "Membership"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons
              name="calendar-outline"
              size={15}
              color={theme.colors.textMuted}
            />
            <Text variant="bodySmall" color="textMuted">
              {publishedPlan ? `${publishedPlan.price} · ${publishedPlan.duration}` : `Valid until ${validUntil}`}
            </Text>
          </View>
        </View>
        {(showPotentialSavings || showActualSavings) && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: theme.spacing.sm,
              width: "100%",
              maxWidth: 440,
            }}
          >
            {showPotentialSavings && (
              <Pressable
                testID={testID ? `${testID}-potential-savings` : undefined}
                onPress={() => setSavingsDetailsOpen(true)}
                accessibilityRole="button"
                accessibilityHint="Opens the explanation of how savings are reported"
                style={({ pressed }) => [
                  tileStyle,
                  {
                    backgroundColor: theme.colors.surfaceAlt,
                    opacity: pressed ? theme.states.pressedOpacity : 1,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.xs,
                  }}
                >
                  <Text variant="caption" style={{ flexShrink: 1 }}>
                    Potential Savings
                  </Text>
                  <Ionicons
                    name="information-circle-outline"
                    size={15}
                    color={theme.colors.text}
                  />
                </View>
                <Text variant={savings ? "bodyStrong" : "bodySmall"}>
                  {savings?.amount ?? "Estimate unavailable"}
                </Text>
                {savings && (
                  <Text variant="caption" color="textMuted">
                    Over {savings.period}
                  </Text>
                )}
              </Pressable>
            )}
            {showActualSavings &&
              (onViewSavingsHistory ? (
                <Pressable
                  testID={testID ? `${testID}-savings-history` : undefined}
                  accessibilityRole="button"
                  accessibilityHint="Opens this business’s customer history"
                  onPress={onViewSavingsHistory}
                  style={({ pressed }) => [
                    actualTileStyle,
                    {
                      opacity: pressed ? theme.states.pressedOpacity : 1,
                    },
                  ]}
                >
                  {actualTileContent}
                </Pressable>
              ) : (
                <View style={actualTileStyle}>{actualTileContent}</View>
              ))}
          </View>
        )}
        {children}
      </View>
      {savingsDetailsOpen && (
        <Modal
          visible
          onClose={() => setSavingsDetailsOpen(false)}
          title="About savings"
          scrollable
        >
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="bodySmall">
              Potential Savings is an estimate of how much you could save by
              using eligible membership benefits during your membership term.
              Savings are not guaranteed.
            </Text>
            {!publishedPlan && <Text variant="bodySmall">
              Actual Savings reflects savings earned through completed
              redemptions, adjusted for applicable reversals.
            </Text>}
          </View>
        </Modal>
      )}
    </View>
  );

  if (!decorative) return <View testID={testID}>{card}</View>;
  return (
    <DecorativeThemeSurface
      testID={testID}
      kind="membership"
      decoration={decoration}
      backgroundImageUrl={decorationImageUrl}
      primaryColor={theme.colors.primary}
      accentColor={theme.colors.accent}
      backgroundColor={decorationBackgroundColor ?? theme.colors.background}
    >
      <DecorativeContentThemeScope enabled={imageOverlay}>
        {card}
      </DecorativeContentThemeScope>
    </DecorativeThemeSurface>
  );
}
