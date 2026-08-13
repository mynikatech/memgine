import { ScrollView, StyleSheet, Text, View } from "react-native";

import { COLORS, RADIUS, SPACING } from "@/src/theme/colors";

/** Simple admin placeholder page — title + note, no logic. */
export function AdminPlaceholder({ title }: { title: string }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="admin-placeholder">
      <Text style={styles.h1}>{title}</Text>
      <View style={styles.card}>
        <Text style={styles.muted}>
          {title} — coming soon. This is a placeholder page for the admin skeleton.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, gap: SPACING.sm, maxWidth: 900, width: "100%", alignSelf: "center" },
  h1: { fontSize: 24, fontWeight: "700", color: COLORS.text },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  muted: { fontSize: 14, color: COLORS.textMuted },
});
