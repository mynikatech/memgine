import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { services } from "@/src/core/services/service-registry";
import type { AppNotification } from "@/src/data/api/notification-api";
import { useBusiness, useTheme } from "@/src/providers";
import { StateView, Text } from "@/src/ui";

function supportRequestId(notification: AppNotification): string | null {
  if (!notification.context) return null;
  try {
    const context = JSON.parse(notification.context) as {
      supportRequestId?: unknown;
    };
    return typeof context.supportRequestId === "string"
      ? context.supportRequestId
      : null;
  } catch {
    return null;
  }
}

export default function OrgAdminNotifications() {
  const { organization } = useBusiness();
  return <NotificationInbox organizationId={organization.id} />;
}

function NotificationInbox({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const theme = useTheme();
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const notifications = await services.inAppNotifications.list();
      setRows(
        notifications.filter(
          (notification) => notification.organizationId === organizationId,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      try {
        await services.inAppNotifications.markRead(notification.id);
        setRows((current) =>
          current.map((row) =>
            row.id === notification.id
              ? { ...row, readAt: new Date().toISOString() }
              : row,
          ),
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to mark notification as read.",
        );
        return;
      }
    }

    const requestId = supportRequestId(notification);
    if (requestId) {
      router.push(
        `${APP_ROUTES.orgAdmin.supportRequests(organizationId)}?requestId=${encodeURIComponent(requestId)}` as never,
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
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

      {loading ? (
        <StateView kind="loading" title="Loading notifications" />
      ) : error ? (
        <StateView
          kind="error"
          title="Unable to load notifications"
          message={error}
          actionLabel="Retry"
          onAction={() => void load()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
        >
          {rows.length === 0 ? (
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
                Support and operational updates for this organization appear here.
              </Text>
            </View>
          ) : null}

          {rows.map((notification) => (
            <Pressable
              key={notification.id}
              onPress={() => void openNotification(notification)}
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
      )}
    </View>
  );
}
