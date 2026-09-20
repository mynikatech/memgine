import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";

import { useAuth, useTheme, useTranslation } from "@/src/providers";

/**
 * Customer shell — mobile-first bottom tabs. Frozen navigation: Home / My Cards
 * / Profile. Active tint comes from the active business brand via the theme.
 */
export default function CustomerLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { loading, session } = useAuth();

  if (!loading && !session) return <Redirect href="/customer-login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          title: t("customer.yourMemberships"),
          tabBarButtonTestID: "customer-tab-cards",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "card" : "card-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("customer.profile"),
          tabBarButtonTestID: "customer-tab-profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null, title: "Notifications" }} />
    </Tabs>
  );
}
