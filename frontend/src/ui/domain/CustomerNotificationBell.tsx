import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { services } from "@/src/core";
import { useTheme } from "@/src/providers";

/** Server-backed notification entry point for customer headers. */
export function CustomerNotificationBell() {
  const router = useRouter();
  const theme = useTheme();
  const [count, setCount] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    services.inAppNotifications.unreadCount()
      .then((value) => { if (active) setCount(value); })
      .catch(() => { if (active) setCount(0); });
    return () => { active = false; };
  }, []));

  return (
    <Pressable
      accessibilityLabel="Notifications"
      testID="customer-notifications-bell"
      onPress={() => router.push("/customer/notifications")}
      style={{ padding: theme.spacing.xs }}
    >
      <Ionicons name="notifications-outline" size={24} color={theme.colors.text} />
      {count > 0 ? (
        <View style={{ position: "absolute", right: 0, top: 0, minWidth: 16, height: 16,
          borderRadius: 8, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{count > 99 ? "99+" : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
