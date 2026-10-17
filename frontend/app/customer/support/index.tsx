import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { services } from "@/src/core/services/service-registry";
import type { CustomerSupportRequest } from "@/src/data/api/customer-support-api";
import { Screen } from "@/src/layout";
import { useCustomerContext, useTheme } from "@/src/providers";
import { Badge, Button, Card, Header, StateView, Text } from "@/src/ui";

const PAGE_SIZE = 50;

export default function CustomerSupportInbox() {
  const router = useRouter();
  const theme = useTheme();
  const { landing } = useCustomerContext();
  const [rows, setRows] = useState<CustomerSupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (offset = 0) => {
    setError(null);
    try {
      const next = await services.customerSupport.list(PAGE_SIZE, offset);
      setRows((current) => (offset === 0 ? next : [...current, ...next]));
      setHasMore(next.length === PAGE_SIZE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load support requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const businessName = (organizationId: string) => {
    const match = landing?.discoverableOrganizations.find(
      (organization) => organization.organizationId === organizationId,
    );
    return match?.displayName || match?.name || "Business";
  };

  if (loading) {
    return <Screen><StateView kind="loading" title="Loading support requests" /></Screen>;
  }

  return (
    <Screen
      header={<Header title="Support Requests" subtitle="Help across all your businesses" right={<Button label="New request" size="sm" onPress={() => router.push(APP_ROUTES.customer.newSupportRequest() as never)} />} />}
      contentStyle={{ maxWidth: 920, width: "100%", alignSelf: "center" }}
    >
      <View style={{ gap: theme.spacing.md }}>
        {error ? <StateView kind="error" title="Unable to load support requests" message={error} actionLabel="Try again" onAction={() => { setLoading(true); void load(); }} /> : null}
        {!error && rows.length === 0 ? (
          <StateView
            kind="empty"
            title="No support requests yet"
            message="You haven't raised any support requests yet. Need help with a business or membership? Create a request."
            actionLabel="Create a request"
            onAction={() => router.push(APP_ROUTES.customer.newSupportRequest() as never)}
          />
        ) : null}
        {rows.map((request) => (
          <Pressable
            key={request.supportRequestId}
            onPress={() => router.push(APP_ROUTES.customer.supportRequest(request.supportRequestId) as never)}
          >
            <Card style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: "row", gap: theme.spacing.sm, alignItems: "center", flexWrap: "wrap" }}>
                <Badge label={request.status.replaceAll("_", " ")} tone={request.status === "RESOLVED" ? "success" : request.status === "CLOSED" ? "neutral" : "info"} />
                <Text variant="caption" color="textMuted">{request.ticketNumber}</Text>
              </View>
              <Text variant="bodyStrong" color="text">{request.subject}</Text>
              <Text variant="bodySmall" color="textSecondary">{businessName(request.organizationId)} · {request.category.replaceAll("_", " ")} · {request.issueType.replaceAll("_", " ")}</Text>
              <Text variant="bodySmall" color="textMuted" numberOfLines={2}>{request.description}</Text>
              <Text variant="caption" color="textMuted">Updated {new Date(request.updatedAt).toLocaleString()}</Text>
            </Card>
          </Pressable>
        ))}
        {hasMore && !error ? <Button label="Load more" variant="secondary" onPress={() => void load(rows.length)} /> : null}
      </View>
    </Screen>
  );
}
