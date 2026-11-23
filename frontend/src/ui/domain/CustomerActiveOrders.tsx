import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { AppState, Pressable, View } from "react-native";
import { useTheme } from "@/src/providers";
import { Badge, Button, Card, Text } from "@/src/ui";
import { formatTransactionMoney } from "@/src/core/domain/savings-display";
import {
  CustomerDataApi,
  type CustomerEntitlementReservation,
  type CustomerFulfillment,
  type CustomerFulfillmentActivity,
  type CustomerFulfillmentPayment,
} from "@/src/data/api/customer-data-api";
import { localTime, read } from "./CustomerFulfillmentFlow";
import {
  redemptionContentWidth,
  reservationLabel,
} from "./fulfillment-presentation";

const api = new CustomerDataApi();

const statusLabel: Record<CustomerFulfillment["status"], string> = {
  PLACED: "Placed",
  PREPARING: "Preparing",
  READY: "Ready for pickup",
  CANCEL_REQUESTED: "Cancellation requested",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};

const paymentLabel: Record<string, string> = {
  PAID: "Paid",
  PAYMENT_RECEIVED: "Payment received",
  UNPAID: "Due at pickup",
  NO_PAYMENT_REQUIRED: "No payment due",
  PAYMENT_PENDING: "Payment pending",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_CANCELLED: "Payment cancelled",
};

export function useCustomerFulfillmentActivity(
  organizationId: string,
  subscriptionId: string | undefined,
  enabled: boolean,
  refreshKey: number,
) {
  const key = JSON.stringify([organizationId, subscriptionId]);
  const [state, setState] = useState<{
    key: string;
    data: CustomerFulfillmentActivity;
  }>();
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const listener = AppState.addEventListener("change", (value) =>
      setActive(value === "active"),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!enabled || !active || !subscriptionId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const data = await read(
          api.fulfillmentActivity(organizationId, subscriptionId),
        );
        if (!live) return;
        setState({ key, data });
        if (data.orders.length || data.reservations.length)
          timer = setTimeout(() => void refresh(), 60000);
      } catch {
        if (live) timer = setTimeout(() => void refresh(), 60000);
      }
    };
    void refresh();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [active, enabled, key, organizationId, refreshKey, subscriptionId]);
  useEffect(() => {
    if (state?.key !== key || !state.data.counterQrs?.length) return;
    const expires = Math.min(
      ...state.data.counterQrs.map(({ expiresAt }) => Date.parse(expiresAt)),
    );
    if (!Number.isFinite(expires)) return;
    const timer = setTimeout(
      () =>
        setState((current) =>
          current?.key === key
            ? {
                ...current,
                data: {
                  ...current.data,
                  counterQrs: current.data.counterQrs?.filter(
                    ({ expiresAt }) => Date.parse(expiresAt) > Date.now(),
                  ),
                },
              }
            : current,
        ),
      Math.max(0, expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [key, state]);
  return state?.key === key ? state.data : undefined;
}

export function ReservationLinks({
  reservations,
  available,
  customerLabels,
  onOpen,
}: {
  reservations: CustomerEntitlementReservation[];
  available: boolean;
  customerLabels: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();
  if (!reservations.length) return null;
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {reservations.map((entry) => (
          <Pressable
            key={entry.fulfillmentId}
            accessibilityRole="button"
            accessibilityLabel={"View reservation " + entry.referenceNumber}
            onPress={(event) => {
              event.stopPropagation();
              onOpen(entry.fulfillmentId);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              minHeight: 32,
              gap: 5,
              backgroundColor: theme.colors.surfaceAlt,
              borderRadius: theme.radius.md,
              paddingHorizontal: 10,
            }}
          >
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color={theme.colors.primary}
            />
            <Text variant="caption" color="primary">
              {reservationLabel(
                customerLabels[entry.fulfillmentId] ?? "Order",
                entry.referenceNumber,
              )}
              {entry.quantity > 1 ? ` · ${entry.quantity} uses` : ""}
            </Text>
          </Pressable>
        ))}
      </View>
      {available ? (
        <Text variant="caption" color="textMuted">
          You can redeem any remaining uses.
        </Text>
      ) : null}
    </View>
  );
}

export function CustomerActiveOrders({
  orders,
  reservations,
  itemNames,
  pendingPayment,
  onOrder,
  onPayment,
}: {
  orders: CustomerFulfillment[];
  reservations: CustomerEntitlementReservation[];
  itemNames: Record<string, string>;
  pendingPayment: CustomerFulfillmentPayment | null;
  onOrder: (id: string) => void;
  onPayment: (id: string) => void;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  if (!orders.length && !pendingPayment) return null;
  const label =
    orders[0]?.customerLabel ?? pendingPayment?.customerLabel ?? "Order";
  return (
    <View
      style={{
        width: "100%",
        maxWidth: redemptionContentWidth,
        alignSelf: "center",
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 12,
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          paddingVertical: 6,
        }}
      >
        <Ionicons
          name="bag-handle-outline"
          size={20}
          color={theme.colors.primary}
        />
        <Text variant="bodyStrong">
          Active {label}
          {orders.length === 1 ? "" : "s"} ({orders.length})
        </Text>
      </View>
      {orders.map((item) => {
        const open = expanded.has(item.id);
        const lines = item.lines ?? [];
        const amount = formatTransactionMoney(
          item.totalMinor,
          item.currencyCode,
        );
        const payment =
          paymentLabel[item.paymentState] ?? "Payment unconfirmed";
        const pickup = localTime(item.expectedCollectionAt, item.timezone);
        const close = localTime(item.collectionWindowEndsAt, item.timezone);
        return (
          <Card key={item.id} padding="md" elevation="none">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${item.customerLabel} ${item.referenceNumber}`}
              onPress={() =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                })
              }
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                minHeight: 44,
              }}
            >
              <View style={{ flex: 1, minWidth: 140, gap: 3 }}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {lines.length
                    ? lines
                        .map((line) => `${line.quantity} × ${line.name}`)
                        .join(", ")
                    : item.customerLabel}
                </Text>
                <Text variant="caption" color="textMuted">
                  {item.storeName} · {item.referenceNumber}
                </Text>
              </View>
              <Badge
                label={statusLabel[item.status]}
                tone={item.status === "READY" ? "success" : "neutral"}
              />
              <Ionicons
                name={open ? "chevron-up" : "chevron-down"}
                size={18}
                color={theme.colors.primary}
              />
            </Pressable>
            {open ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <Text variant="bodySmall">
                  {[payment, amount].filter(Boolean).join(" · ")}
                </Text>
                {pickup ? (
                  <Text variant="bodySmall">
                    Expected pickup {pickup}
                    {close ? " – " + close : ""}
                  </Text>
                ) : null}
                {item.lines?.map((line) => (
                  <Text variant="bodySmall" key={line.id}>
                    {line.quantity} × {line.name}
                  </Text>
                ))}
                {reservations
                  .filter((entry) => entry.fulfillmentId === item.id)
                  .map((entry) => (
                    <View
                      key={entry.itemType + ":" + entry.itemId}
                      style={{
                        flexDirection: "row",
                        gap: 5,
                        alignItems: "center",
                      }}
                    >
                      <Ionicons
                        name="lock-closed-outline"
                        color={theme.colors.primary}
                        size={14}
                      />
                      <Text variant="caption">
                        Reserved:{" "}
                        {itemNames[entry.itemType + ":" + entry.itemId] ??
                          (entry.itemType === "BENEFIT" ? "Benefit" : "Offer")}
                      </Text>
                    </View>
                  ))}
                <Button
                  size="sm"
                  variant="outline"
                  label={"View " + item.customerLabel}
                  onPress={() => onOrder(item.id)}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
      {pendingPayment ? (
        <Card padding="md">
          <View style={{ gap: 6 }}>
            <Text variant="bodyStrong">
              {pendingPayment.status === "PENDING"
                ? "Payment due"
                : "Payment pending"}
            </Text>
            <Button
              size="sm"
              variant="outline"
              label={
                pendingPayment.status === "PENDING"
                  ? "Resume payment"
                  : "Check payment"
              }
              onPress={() => onPayment(pendingPayment.paymentIntentId)}
            />
          </View>
        </Card>
      ) : null}
    </View>
  );
}
