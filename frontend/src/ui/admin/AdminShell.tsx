import { Ionicons } from "@expo/vector-icons";
import { Slot, usePathname, useRouter } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import type { AdminRoute } from "@/src/constants/navigation";
import { COLORS, RADIUS, SPACING } from "@/src/theme/colors";

/**
 * AdminShell — a reusable, desktop-first responsive admin layout shared by the
 * Org Admin and Platform Admin role groups. Renders a left sidebar (wide) or a
 * compact top bar (narrow) + `<Slot />` content. Nav items are passed in per
 * role, so the sidebar is defined once and never duplicated.
 */
type Props = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: AdminRoute[];
};

export function AdminShell({ title, subtitle, icon, items }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const Brand = () => (
    <View style={styles.brand}>
      <View style={styles.brandMark}>
        <Ionicons name={icon} size={20} color={COLORS.background} />
      </View>
      <View>
        <Text style={styles.brandName}>{title}</Text>
        <Text style={styles.brandSub}>{subtitle}</Text>
      </View>
    </View>
  );
  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>(
    {
      "/settings": true,
    },
  );

  const Nav = ({ horizontal }: { horizontal?: boolean }) => (
    <View style={horizontal ? styles.navRow : styles.nav}>
      {items.map((item) => {
        const hasChildren = item.children && item.children.length > 0;

        const childActive = item.children?.some(
          (child) => pathname === child.href,
        );

        const active = pathname === item.href || !!childActive;

        const expanded = expandedRoutes[item.href] ?? false;

        const toggleExpanded = () => {
          if (!hasChildren) {
            router.push(item.href as never);
            return;
          }

          setExpandedRoutes((current) => ({
            ...current,
            [item.href]: !expanded,
          }));
        };

        return (
          <View key={item.href}>
            <Pressable
              testID={`admin-nav-${item.href}`}
              onPress={toggleExpanded}
              style={[
                horizontal ? styles.navPill : styles.navItem,
                active &&
                  (horizontal ? styles.navPillActive : styles.navItemActive),
              ]}
            >
              <Ionicons
                name={item.icon}
                size={horizontal ? 16 : 20}
                color={active ? COLORS.accent : COLORS.textMuted}
              />

              <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                {item.title}
              </Text>

              {hasChildren ? (
                <Ionicons
                  name={
                    expanded ? "chevron-up-outline" : "chevron-down-outline"
                  }
                  size={16}
                  color={active ? COLORS.accent : COLORS.textMuted}
                />
              ) : null}
            </Pressable>

            {hasChildren && expanded ? (
              <View style={horizontal ? styles.subNavRow : styles.subNav}>
                {item.children?.map((child) => {
                  const childIsActive = pathname === child.href;

                  return (
                    <Pressable
                      key={child.href}
                      testID={`admin-nav-${child.href}`}
                      onPress={() => router.push(child.href as never)}
                      style={[
                        horizontal ? styles.subNavPill : styles.subNavItem,
                        childIsActive &&
                          (horizontal
                            ? styles.subNavPillActive
                            : styles.subNavItemActive),
                      ]}
                    >
                      <Ionicons
                        name={child.icon}
                        size={horizontal ? 14 : 18}
                        color={childIsActive ? COLORS.accent : COLORS.textMuted}
                      />

                      <Text
                        style={[
                          styles.navLabel,
                          childIsActive && styles.navLabelActive,
                        ]}
                      >
                        {child.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, flexDirection: isWide ? "row" : "column" },
      ]}
      testID="admin-shell"
    >
      {isWide ? (
        <View style={styles.sidebar} testID="admin-sidebar">
          <Brand />
          <Nav />
          <Text style={styles.footer}>Memgine Admin</Text>
        </View>
      ) : (
        <View style={styles.topbar} testID="admin-topbar">
          <Brand />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Nav horizontal />
          </ScrollView>
        </View>
      )}
      <View style={styles.content} testID="admin-content">
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
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
  brandName: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  brandSub: { fontSize: 12, color: COLORS.textMuted },
  nav: { gap: 4 },
  navRow: { flexDirection: "row", gap: 8, paddingBottom: 4 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
  },
  navItemActive: { backgroundColor: COLORS.accentSoft },
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
  navLabel: { fontSize: 14, fontWeight: "500", color: COLORS.textMuted },
  navLabelActive: { color: COLORS.accent, fontWeight: "700" },
  footer: { marginTop: "auto", fontSize: 12, color: COLORS.textMuted },
  content: { flex: 1, backgroundColor: COLORS.background },
  subNav: {
    marginLeft: 32,
    gap: 2,
    marginBottom: 4,
  },

  subNavItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
  },

  subNavItemActive: {
    backgroundColor: COLORS.accentSoft,
  },

  subNavRow: {
    flexDirection: "row",
    gap: 6,
  },

  subNavPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
  },

  subNavPillActive: {
    backgroundColor: COLORS.accentSoft,
  },
});
