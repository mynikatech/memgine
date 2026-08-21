import { Ionicons } from "@expo/vector-icons";
import { Slot, usePathname, useRouter } from "expo-router";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COUNTER_ROUTES } from "@/src/constants/navigation";
import { COLORS, RADIUS, SPACING } from "@/src/theme/colors";

/**
 * Counter shell — a standalone, responsive Counter experience,
 * independent of the customer/mobile viewport.
 *
 * - Wide (web/desktop): persistent left sidebar + content.
 * - Narrow (tablet/mobile): compact top bar + full-width content.
 *
 * Counter is the store-operational application used at a business location.
 * Staff are users/actors of the application; "Counter" is the application
 * boundary and route namespace.
 */
export default function CounterLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();

  const isWide = width >= 900;

  const go = (href: (typeof COUNTER_ROUTES)[number]["href"]) => {
    router.push(href as never);
  };
  const Nav = ({ horizontal }: { horizontal?: boolean }) => (
    <View style={horizontal ? styles.navRow : styles.nav}>
      {COUNTER_ROUTES.map((route) => {
        const active = pathname === route.href;

        return (
          <Pressable
            key={route.name}
            testID={`counter-nav-${route.name}`}
            onPress={() => go(route.href)}
            style={[
              horizontal ? styles.navPill : styles.navItem,
              active &&
                (horizontal ? styles.navPillActive : styles.navItemActive),
            ]}
          >
            <Ionicons
              name={route.icon}
              size={horizontal ? 16 : 20}
              color={active ? COLORS.accent : COLORS.textMuted}
            />

            <Text style={[styles.navLabel, active && styles.navLabelActive]}>
              {route.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const Brand = ({ compact }: { compact?: boolean }) => (
    <View style={styles.brand}>
      <View style={styles.brandMark}>
        <Ionicons
          name="pricetags-outline"
          size={compact ? 16 : 20}
          color={COLORS.background}
        />
      </View>

      <View>
        <Text style={styles.brandName}>Memgine</Text>
        <Text style={styles.brandSub}>Counter</Text>
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          flexDirection: isWide ? "row" : "column",
        },
      ]}
      testID="counter-shell"
    >
      {isWide ? (
        <View style={styles.sidebar} testID="counter-sidebar">
          <Brand />
          <Nav />

          <Text style={styles.footer}>Counter</Text>
        </View>
      ) : (
        <View style={styles.topbar} testID="counter-topbar">
          <Brand compact />
          <Nav horizontal />
        </View>
      )}

      <View style={styles.content} testID="counter-content">
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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

  topbar: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    gap: SPACING.xs,
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

  navRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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

  navPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },

  navPillActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },

  navLabel: {
    fontSize: 14,
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
