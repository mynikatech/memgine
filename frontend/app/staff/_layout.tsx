import { Ionicons } from "@expo/vector-icons";
import { Slot, usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { STAFF_ROUTES } from "@/src/constants/navigation";
import { COLORS, RADIUS, SPACING } from "@/src/theme/colors";

/**
 * Staff shell — optimized for the desktop/web workstation experience.
 * Persistent left sidebar: Counter · Customers · Configuration.
 */
export default function StaffLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="staff-shell">
      <View style={styles.sidebar} testID="staff-sidebar">
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Ionicons name="pricetags-outline" size={20} color={COLORS.background} />
          </View>
          <View>
            <Text style={styles.brandName}>Memgine</Text>
            <Text style={styles.brandSub}>Staff Workstation</Text>
          </View>
        </View>

        <View style={styles.nav}>
          {STAFF_ROUTES.map((route) => {
            const active = pathname === route.href;
            return (
              <Pressable
                key={route.name}
                testID={`staff-nav-${route.name}`}
                onPress={() => router.push(route.href as never)}
                style={[styles.navItem, active && styles.navItemActive]}
              >
                <Ionicons
                  name={route.icon}
                  size={20}
                  color={active ? COLORS.accent : COLORS.textMuted}
                />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                  {route.title}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.footer}>Stage 1 · Foundation</Text>
      </View>

      <View style={styles.content} testID="staff-content">
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: COLORS.background,
  },
  sidebar: {
    width: 260,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: SPACING.lg,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
  },
  brandSub: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  nav: {
    gap: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
  },
  navItemActive: {
    backgroundColor: COLORS.accentSoft,
  },
  navLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.textMuted,
  },
  navLabelActive: {
    color: COLORS.accent,
    fontWeight: "700",
  },
  footer: {
    marginTop: "auto",
    fontSize: 12,
    color: COLORS.textMuted,
  },
  content: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
