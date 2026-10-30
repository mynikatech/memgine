import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { CardStyle, type Status } from "@/src/core";
import type { BrandingDecorationConfig } from "@/src/core/branding-decoration.types";
import { BrandLogo } from "../BrandLogo";
import { Text } from "../Text";
import { DecorativeThemeSurface } from "./DecorativeThemeSurface";
import { FestiveMotif, festivePalette } from "./FestiveArtwork";
import type { FestiveThemeId } from "./FestiveThemeSurface";
import {
  DecorativeContentThemeScope,
  useDecorativeContentTheme,
} from "./DecorativeContentTheme";

type MembershipCardProps = {
  organizationName: string;
  logoUrl?: string;
  tier: string;
  validUntil: string;
  status?: Status | null;
  cardStyle?: CardStyle;
  testID?: string;
  decoration?: BrandingDecorationConfig | null;
  decorationImageUrl?: string | null;
  decorationBackgroundColor?: string;
  festiveTheme?: FestiveThemeId;
};

/** Presentation only; membership entitlement and payment logic remain elsewhere. */
export function MembershipCard({
  organizationName,
  logoUrl,
  tier,
  validUntil,
  status,
  cardStyle = CardStyle.MODERN,
  testID,
  decoration,
  decorationImageUrl,
  decorationBackgroundColor,
  festiveTheme = "CLASSIC",
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
  const showAccentBar = cardStyle !== CardStyle.MINIMAL;
  const festive = festiveTheme !== "CLASSIC";
  const festiveBackground = festiveTheme === "CHRISTMAS" ? "#A91422" : festive ? festivePalette[festiveTheme].ribbon : surface;
  const festiveForeground = "#FFF8EC";

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
          backgroundColor: festive ? festiveBackground : imageOverlay ? "rgba(255,255,255,0.94)" : surface,
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
      {festive ? <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 38, overflow: "hidden" }}>
        <View style={{ position: "absolute", left: -8, top: -13 }}><FestiveMotif theme={festiveTheme} size={46} opacity={0.5} /></View>
        <View style={{ position: "absolute", right: -8, top: -13, transform: [{ scaleX: -1 }] }}><FestiveMotif theme={festiveTheme} size={46} opacity={0.5} /></View>
      </View> : null}
      {showAccentBar ? (
        <View style={{ height: 6, backgroundColor: festive ? festivePalette[festiveTheme].gold : theme.colors.primary }} />
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
              <Text variant="caption" color="textMuted" style={festive ? { color: festiveForeground } : undefined}>
                MEMBERSHIP
              </Text>
              <Text variant="bodyStrong" color="text" numberOfLines={2} style={festive ? { color: festiveForeground } : undefined}>
                {organizationName}
              </Text>
            </View>
          </View>
          <View
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
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="display" color="text" numberOfLines={2} style={festive ? { color: festiveForeground } : undefined}>
            {tier || "Membership"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons
              name="calendar-outline"
              size={15}
              color={festive ? festiveForeground : theme.colors.textMuted}
            />
            <Text variant="bodySmall" color="textMuted" style={festive ? { color: festiveForeground } : undefined}>
              Valid until {validUntil}
            </Text>
          </View>
        </View>
      </View>
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
