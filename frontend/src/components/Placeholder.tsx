import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/business";
import { useTranslation } from "@/src/i18n";

type IoniconName = keyof typeof Ionicons.glyphMap;

type PlaceholderProps = {
  title: string;
  description: string;
  icon: IoniconName;
  testID?: string;
};

/**
 * Shared placeholder body for navigation shells not yet built out. Themed via
 * the active theme so it inherits business branding when one is selected.
 */
export default function Placeholder({ title, description, icon, testID }: PlaceholderProps) {
  const { colors, radius, spacing } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.md }]} testID={testID}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: colors.primarySoft, borderRadius: radius.lg, marginBottom: spacing.sm },
        ]}
      >
        <Ionicons name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.text, marginBottom: spacing.xs }]} testID={`${testID}-title`}>
        {title}
      </Text>
      <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text>
      <View
        style={[
          styles.badge,
          { marginTop: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm },
        ]}
      >
        <Text style={[styles.badgeText, { color: colors.textMuted }]}>{t("foundation.badge")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconWrap: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700" },
  description: { fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 320 },
  badge: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
});
