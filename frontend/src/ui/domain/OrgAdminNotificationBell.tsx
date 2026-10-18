import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { services } from "@/src/core/services/service-registry";
import { COLORS, RADIUS } from "@/src/theme/colors";

export function OrgAdminNotificationBell({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const notifications = await services.inAppNotifications.list();
      setUnreadCount(
        notifications.filter(
          (notification) =>
            notification.organizationId === organizationId && !notification.readAt,
        ).length,
      );
    } catch {
      // The inbox presents its own error state. A count failure must not block admin navigation.
      setUnreadCount(0);
    }
  }, [organizationId]);

  useFocusEffect(
    useCallback(() => {
      void loadUnreadCount();
    }, [loadUnreadCount]),
  );

  return (
    <Pressable
      accessibilityLabel="Notifications"
      onPress={() =>
        router.push(APP_ROUTES.orgAdmin.notifications(organizationId) as never)
      }
      style={styles.button}
    >
      <Ionicons
        name="notifications-outline"
        size={20}
        color={COLORS.textMuted}
      />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 1,
    right: 1,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },
  badgeText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: "700",
  },
});
