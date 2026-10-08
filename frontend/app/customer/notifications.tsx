import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

import { services } from "@/src/core";
import type { AppNotification } from "@/src/data/api/notification-api";
import { useTheme } from "@/src/providers";
import { Text } from "@/src/ui";

export default function Notifications() {
  const router = useRouter();
  const theme = useTheme();

  const [rows, setRows] = useState<AppNotification[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      services.inAppNotifications
        .list()
        .then(setRows)
        .catch((e) => setError(e.message)),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Pressable
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{ padding: theme.spacing.xs }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </Pressable>

        <Text variant="h2" color="text">
          Notifications
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        {error ? (
          <Text variant="bodySmall" color="danger">
            {error}
          </Text>
        ) : null}

        {!error && rows.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              paddingVertical: theme.spacing.xl,
              gap: theme.spacing.sm,
            }}
          >
            <Ionicons
              name="notifications-outline"
              size={36}
              color={theme.colors.textMuted}
            />

            <Text variant="bodyStrong" color="text">
              No notifications yet
            </Text>

            <Text
              variant="bodySmall"
              color="textMuted"
              style={{ textAlign: "center" }}
            >
              Updates from your memberships and businesses will appear here.
            </Text>
          </View>
        ) : null}

        {rows.map((notification) => (
          <Pressable
            key={notification.id}
            onPress={async () => {
              if (!notification.readAt) {
                await services.inAppNotifications.markRead(notification.id);
                void load();
              }
            }}
            style={{
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: notification.readAt
                ? theme.colors.surface
                : theme.colors.primarySoft,
              gap: theme.spacing.xs,
            }}
          >
            <Text variant="bodyStrong" color="text">
              {notification.title}
            </Text>

            <Text variant="bodySmall" color="textMuted">
              {notification.message}
            </Text>

            <Text variant="caption" color="textMuted">
              {new Date(notification.createdAt).toLocaleString()}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
