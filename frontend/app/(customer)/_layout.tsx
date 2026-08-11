import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { CUSTOMER_ROUTES } from "@/src/constants/navigation";
import { COLORS } from "@/src/theme/colors";

/**
 * Customer shell — optimized for the mobile/native experience.
 * Bottom-tab navigation: Home · My Cards · Profile.
 */
export default function CustomerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.background },
        headerTitleStyle: { color: COLORS.text, fontWeight: "700" },
        headerShadowVisible: false,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
        },
      }}
    >
      {CUSTOMER_ROUTES.map((route) => (
        <Tabs.Screen
          key={route.name}
          name={route.name}
          options={{
            title: route.title,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={route.icon} size={size} color={color} />
            ),
            tabBarButtonTestID: `customer-tab-${route.name}`,
          }}
        />
      ))}
    </Tabs>
  );
}
