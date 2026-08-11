import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme/colors";

type IoniconName = keyof typeof Ionicons.glyphMap;

type PlaceholderProps = {
  title: string;
  description: string;
  icon: IoniconName;
  testID?: string;
};

/**
 * Shared placeholder body for the navigation shells.
 * Real screens are built in a later stage.
 */
export default function Placeholder({ title, description, icon, testID }: PlaceholderProps) {
  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={COLORS.accent} />
      </View>
      <Text style={styles.title} testID={`${testID}-title`}>
        {title}
      </Text>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Placeholder</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textMuted,
    textAlign: "center",
    maxWidth: 320,
  },
  badge: {
    marginTop: SPACING.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textMuted,
    letterSpacing: 0.3,
  },
});
