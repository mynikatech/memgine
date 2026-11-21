import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";

import { formatTransactionMoney } from "@/src/core/domain/savings-display";
import { CounterApi, type CounterOrder, type CounterOrderFilter, type CounterOrderFilters, type CounterOrderPage } from "@/src/data/api/counter-api";
import type { ApiResult } from "@/src/data/api/result";
import { useTheme } from "@/src/providers";
import { Badge, Button, Card, DateInput, Input, ReferenceSelect, StateView, Text } from "@/src/ui";
import {
  changeCounterOrderFilters, counterOrderDate, counterOrderKeyboardTarget, counterOrderMaxOffset, counterOrderPageSize,
  counterOrderSelection, counterOrderStore, counterOrdersLayout,
} from "./counter-orders-model";

const api = new CounterApi();
const statusLabels = {
  ACTIVE: "Active orders", ALL: "All statuses", PLACED: "Placed", PREPARING: "Preparing", READY: "Ready for pickup",
  FULFILLED: "Fulfilled", CANCEL_REQUESTED: "Cancellation requested", CANCELLED: "Cancelled",
} satisfies Record<CounterOrderFilter, string>;
const statusOptions = Object.entries(statusLabels).map(([id, name]) => ({ id, name }));
const paymentLabels: Record<string, string> = {
  PAID: "Paid", PAYMENT_RECEIVED: "Payment received", UNPAID: "Due at counter", NO_PAYMENT_REQUIRED: "No payment due",
  PAYMENT_PENDING: "Payment pending", PAYMENT_FAILED: "Payment failed", PAYMENT_CANCELLED: "Payment cancelled",
  PAYMENT_UNCONFIRMED: "Payment unconfirmed",
};

type Remote<T> = { kind: "loading" } | { kind: "error"; message: string; code?: string } | { kind: "ready"; data: T };

function isAccessDenied<T>(state: Remote<T>) {
  return state.kind === "error" && ["UNAUTHORIZED", "FORBIDDEN", "HTTP_401", "HTTP_403"].includes(state.code ?? "");
}

function useOrdersRead<T>(key: string | undefined, load: () => Promise<ApiResult<T>>): Remote<T> {
  const [result, setResult] = useState<{ key: string; state: Remote<T> }>();
  useEffect(() => {
    if (!key) return;
    let live = true;
    void load().then((response) => {
      if (live) setResult({ key, state: response.success ? { kind: "ready", data: response.data } : {
        kind: "error", message: response.error.message, code: response.error.code,
      } });
    }).catch(() => {
      if (live) setResult({ key, state: { kind: "error", message: "Unable to load Counter orders. Try again." } });
    });
    return () => { live = false; };
  }, [key, load]);
  return result && key === result.key ? result.state : { kind: "loading" };
}

export function CounterOrdersDashboard({ organizationId, preferredStoreId }: { organizationId: string; preferredStoreId?: string }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(0);
  const layout = counterOrdersLayout(width, contentWidth || width);
  const [storeId, setStoreId] = useState<string>();
  const [storeRevision, setStoreRevision] = useState(0);
  const [filters, setFilters] = useState<CounterOrderFilters>({ status: "ACTIVE", search: "", offset: 0 });
  const [searchDraft, setSearchDraft] = useState("");
  const [selection, setSelection] = useState<{ scope: string; id: string }>();
  const [revision, setRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);

  const loadStores = useCallback(() => api.orderStores(organizationId), [organizationId]);
  const stores = useOrdersRead(JSON.stringify([organizationId, storeRevision]), loadStores);
  const store = stores.kind === "ready" ? counterOrderStore(stores.data, storeId ?? preferredStoreId) : undefined;
  const context = useMemo(() => store ? { organizationId, storeId: store.id, staffId: store.staffId } : undefined,
    [organizationId, store]);
  const scope = context ? JSON.stringify(context) : undefined;
  const loadQueue = useCallback(() => api.orders(context!, filters), [context, filters]);
  const queue = useOrdersRead(scope && JSON.stringify([scope, filters, revision]), loadQueue);
  const rows = queue.kind === "ready" ? queue.data.orders : [];
  const selectedId = counterOrderSelection(isAccessDenied(queue) ? undefined : scope, selection, rows, layout.split);
  const loadDetail = useCallback(() => api.order(context!, selectedId!), [context, selectedId]);
  const detail = useOrdersRead(scope && selectedId ? JSON.stringify([scope, selectedId, revision, detailRevision]) : undefined, loadDetail);

  const patchFilters = (patch: Partial<Omit<CounterOrderFilters, "offset">>) => setFilters((current) => changeCounterOrderFilters(current, patch));
  const refresh = () => setRevision((current) => current + 1);
  const search = () => patchFilters({ search: searchDraft.trim() });
  const chooseOrder = (id: string) => { if (scope) setSelection({ scope, id }); };
  const mobileDetail = !layout.split && !!selectedId;
  const counts = queue.kind === "ready" ? queue.data.statusCounts : undefined;
  const activeCount = counts ? (counts.PLACED ?? 0) + (counts.PREPARING ?? 0) + (counts.READY ?? 0) + (counts.CANCEL_REQUESTED ?? 0) : undefined;
  const summaries = [
    { status: "ACTIVE", label: "Active", count: activeCount }, { status: "READY", label: "Ready for pickup", count: counts && (counts.READY ?? 0) },
    { status: "CANCEL_REQUESTED", label: "Cancellation requests", count: counts && (counts.CANCEL_REQUESTED ?? 0) },
    { status: "FULFILLED", label: "Fulfilled", count: counts && (counts.FULFILLED ?? 0) },
  ] as const;
  const content = { paddingHorizontal: layout.padding, paddingTop: 14, paddingBottom: 12, gap: 12 };
  const Workspace = layout.split ? View : ScrollView;

  return (
    <View testID="counter-orders-dashboard" onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
      style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: theme.colors.background }}>
      {stores.kind !== "ready" || !store ? (
        <View style={{ padding: layout.padding }}>
          <Text variant="title">Orders</Text>
          {stores.kind === "loading" ? <StateView kind="loading" title="Loading authorized Stores" /> : stores.kind === "error" ? (
            <StateView kind="error" title="Could not load Stores" message={stores.message} actionLabel="Retry" onAction={() => setStoreRevision((value) => value + 1)} />
          ) : <StateView kind="empty" title="No authorized Stores" message="An active Counter Operator profile and Store assignment are required." />}
        </View>
      ) : mobileDetail ? (
        <View testID="counter-orders-mobile-detail" style={{ flex: 1, paddingHorizontal: layout.padding, paddingTop: 12, minHeight: 0 }}>
          <View style={{ alignItems: "flex-start", marginBottom: 10 }}>
            <Button variant="ghost" label="Back to orders" onPress={() => {
              setSelection(undefined);
              if (isAccessDenied(detail)) refresh();
            }} />
          </View>
          <CounterOrderDetails state={detail} onRetry={() => setDetailRevision((value) => value + 1)} />
        </View>
      ) : (
        <Workspace style={{ flex: 1, minHeight: 0, ...(layout.split ? content : undefined) }}
          {...(!layout.split ? { contentContainerStyle: content, keyboardShouldPersistTaps: "handled" as const } : {})}>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <Text variant="title" accessibilityRole="header">Orders</Text>
              <Button variant="outline" size="sm" label="Refresh" onPress={refresh} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}>
              <View style={{ flex: 1, minWidth: layout.split ? 112 : 130 }}>
                <ReferenceSelect label="Store" value={store.id} items={stores.data} disabled={stores.data.length === 1}
                  onChange={(id) => { setStoreId(id); setSelection(undefined); patchFilters({}); }} />
              </View>
              <View style={{ flex: 1, minWidth: layout.split ? 112 : 130 }}>
                <ReferenceSelect label="Status" value={filters.status} items={statusOptions} onChange={(status) => patchFilters({ status: status as CounterOrderFilter })} />
              </View>
              <View style={{ flex: 1, minWidth: 130, gap: 3 }}>
                <DateInput label="Pickup date" value={filters.pickupDate} onChange={(pickupDate) => patchFilters({ pickupDate })} placeholder="Any date" />
                {filters.pickupDate ? <Button variant="ghost" size="sm" label="Clear pickup date" onPress={() => patchFilters({ pickupDate: undefined })} /> : null}
              </View>
              <View style={{ flex: 1.4, minWidth: layout.split ? 175 : 170, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Input label="Order reference" placeholder="Search orders" value={searchDraft} onChangeText={setSearchDraft}
                    maxLength={64} returnKeyType="search" onSubmitEditing={search} />
                </View>
                <Button variant="secondary" size="sm" label="Search" onPress={search} />
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {summaries.map(({ status, label, count }) => (
                <Pressable key={status} accessibilityRole="button" accessibilityState={{ selected: filters.status === status }}
                  accessibilityLabel={count == null ? label : `${label}, ${count}`} onPress={() => patchFilters({ status })}
                  style={{ flex: 1, minWidth: layout.split ? 112 : 116, padding: layout.split ? 12 : 8, gap: 2,
                    borderWidth: 1, borderRadius: theme.radius.md, borderColor: filters.status === status ? theme.colors.primary : theme.colors.border,
                    backgroundColor: filters.status === status ? theme.colors.primarySoft : theme.colors.surface }}>
                  <Text variant={layout.split ? "h2" : "bodyStrong"}>{count ?? "—"}</Text>
                  <Text variant="caption" color="textMuted">{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <CounterOrdersPanels layout={layout} queue={
            <CounterOrderQueue independent={layout.split} state={queue} selectedId={selectedId} onSelect={chooseOrder} offset={filters.offset} onRetry={refresh}
              onPage={(offset) => setFilters((current) => ({ ...current, offset }))} />
          } details={<CounterOrderDetails state={selectedId ? detail : undefined} onRetry={() => setDetailRevision((value) => value + 1)} />} />
        </Workspace>
      )}
    </View>
  );
}

export function CounterOrdersPanels({ layout, queue, details }: {
  layout: ReturnType<typeof counterOrdersLayout>; queue: ReactNode; details: ReactNode;
}) {
  if (!layout.split) return <View testID="counter-orders-mobile-queue">{queue}</View>;
  return <View testID="counter-orders-split" style={{ flex: 1, minHeight: 0, flexDirection: "row", gap: 14 }}>
    <View style={{ flex: layout.queueFlex, minWidth: 0, minHeight: 0 }}>{queue}</View>
    <View style={{ flex: layout.detailFlex, minWidth: 0, minHeight: 0 }}>{details}</View>
  </View>;
}

export function CounterOrderQueue({ state, selectedId, offset, independent, onSelect, onPage, onRetry }: {
  state: Remote<CounterOrderPage>; selectedId?: string; offset: number; onSelect: (id: string) => void;
  independent: boolean; onPage: (offset: number) => void; onRetry: () => void;
}) {
  const theme = useTheme();
  const refs = useRef(new Map<string, ComponentRef<typeof Pressable>>());
  const ids = state.kind === "ready" ? state.data.orders.map(({ id }) => id) : [];
  const QueueBody = independent ? ScrollView : View;
  return (
    <Card padding="none" elevation="none" style={independent ? { flex: 1, minHeight: 0 } : undefined} testID="counter-order-queue">
      <View style={{ padding: 12, borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="bodyStrong" accessibilityRole="header">Order queue</Text>
        {state.kind === "ready" ? <Text variant="bodySmall" color="textMuted">{state.data.total} matching</Text> : null}
      </View>
      <QueueBody style={independent ? { flex: 1, minHeight: 0 } : { gap: 6, padding: 8 }}
        {...(independent ? { keyboardShouldPersistTaps: "handled" as const, contentContainerStyle: { gap: 6, padding: 8 } } : {})}>
        {state.kind === "loading" ? <StateView kind="loading" title="Loading orders" testID="counter-orders-loading" /> :
          state.kind === "error" ? <StateView kind="error" title="Could not load orders" message={state.message} actionLabel="Retry" onAction={onRetry} testID="counter-orders-error" /> :
            !state.data.orders.length ? <StateView kind="empty" title="No matching orders" message="Change the Store, status, reference or pickup date." testID="counter-orders-empty" /> :
              state.data.orders.map((order) => {
                const selected = order.id === selectedId;
                const money = formatTransactionMoney(order.totalMinor, order.currencyCode);
                const keyboard = Platform.OS === "web" ? {
                  onKeyDown: (event: { key: string; preventDefault: () => void }) => {
                    const target = counterOrderKeyboardTarget(ids, order.id, event.key);
                    if (target) { event.preventDefault(); refs.current.get(target)?.focus(); }
                  },
                } : {};
                return (
                  <Pressable key={order.id} ref={(node) => { if (node) refs.current.set(order.id, node); else refs.current.delete(order.id); }}
                    {...keyboard} testID={`counter-order-${order.id}`} accessibilityRole="button" accessibilityState={{ selected }}
                    accessibilityLabel={`${order.reference}, ${statusLabels[order.status] ?? order.status}, ${order.storeName}`} onPress={() => onSelect(order.id)}
                    style={{ gap: 5, borderWidth: 1, borderRadius: theme.radius.md, padding: 10,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      <Text variant="bodyStrong" color={selected ? "primary" : "text"}>{order.reference}</Text>
                      <Badge label={statusLabels[order.status] ?? order.status} tone={order.status === "READY" ? "success" : "neutral"} />
                    </View>
                    <Text variant="bodySmall" numberOfLines={2}>{order.items.length ? order.items.map(({ quantity, name }) => `${quantity} × ${name}`).join(", ") : "Items unavailable"}</Text>
                    <Text variant="caption" color="textMuted">{order.storeName} · {counterOrderDate(order.pickupAt, order.timezone)}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      <Text variant="caption" color={order.paymentState === "PAID" ? "success" : "textMuted"}>{paymentLabels[order.paymentState] ?? "Payment unconfirmed"}</Text>
                      <Text variant="bodyStrong">{money ?? "Total unavailable"}</Text>
                    </View>
                  </Pressable>
                );
              })}
      </QueueBody>
      {state.kind === "ready" && (offset > 0 || state.data.total > counterOrderPageSize) ? (
        <View style={{ borderTopWidth: 1, borderColor: theme.colors.border, padding: 8, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <Button size="sm" variant="outline" label="Previous" disabled={!offset} onPress={() => onPage(offset - counterOrderPageSize)} />
          <Text variant="caption" color="textMuted">Page {offset / counterOrderPageSize + 1}</Text>
          <Button size="sm" variant="outline" label="Next" disabled={offset + counterOrderPageSize >= state.data.total || offset >= counterOrderMaxOffset}
            onPress={() => onPage(offset + counterOrderPageSize)} />
        </View>
      ) : null}
    </Card>
  );
}

function readableCode(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}

const methodLabels: Record<string, string> = { GOOGLE_PAY: "Google Pay", APPLE_PAY: "Apple Pay", POYNT_COLLECT: "Poynt Collect", PAYMENT_METHOD_NOT_RECORDED: "Unavailable" };

export function CounterOrderDetails({ state, onRetry }: { state?: Remote<CounterOrder>; onRetry: () => void }) {
  const theme = useTheme();
  const order = state?.kind === "ready" ? state.data : undefined;
  const money = (value: number | null | undefined) => formatTransactionMoney(value, order?.currencyCode);
  return (
    <Card padding="none" elevation="none" testID="counter-order-details" style={{ flex: 1, minHeight: 0 }}>
      <View style={{ padding: 12, borderBottomWidth: 1, borderColor: theme.colors.border }}>
        <Text variant="bodyStrong" accessibilityRole="header" accessibilityLiveRegion="polite">{order ? order.reference : "Order details"}</Text>
      </View>
      <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
        {!state ? <StateView kind="empty" title="Select an order" /> : state.kind === "loading" ? <StateView kind="loading" title="Loading order details" /> :
          state.kind === "error" ? <StateView kind="error" title="Could not load order details" message={state.message} actionLabel="Retry" onAction={onRetry} /> : order && <>
            <View style={{ alignItems: "flex-start", gap: 4 }}>
              <Badge label={statusLabels[order.status] ?? order.status} tone={order.status === "READY" ? "success" : "neutral"} />
              <Text variant="bodyStrong">{order.customerName ?? "Customer name unavailable"}</Text>
              <Text variant="bodySmall">{order.storeName}</Text>
              <Text variant="bodySmall">Pickup · {counterOrderDate(order.pickupAt, order.timezone)}</Text>
              <Text variant="caption" color="textMuted">Placed · {counterOrderDate(order.placedAt, order.timezone)}</Text>
            </View>
            <Card padding="sm" elevation="none" style={{ gap: 7 }}>
              <Text variant="bodyStrong">Items</Text>
              {!order.items.length ? <Text variant="bodySmall" color="textMuted">Item details unavailable</Text> : null}
              {order.items.map((item) => (
                <View key={item.id} style={{ gap: 3 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                    <Text variant="bodySmall" style={{ flex: 1 }}>{item.quantity} × {item.name}</Text>
                    <Text variant="bodySmall">{money(item.subtotalMinor) ?? "—"}</Text>
                  </View>
                  {money(item.unitPriceMinor) ? <Text variant="caption" color="textMuted">{money(item.unitPriceMinor)} each</Text> : null}
                  {item.discountMinor != null && item.discountMinor > 0 ? <Text variant="caption" color="success">Discount {money(item.discountMinor)}</Text> : null}
                </View>
              ))}
              {([["Subtotal", order.subtotalMinor], ["Discount", order.discountMinor], ["Tax", order.taxMinor], ["Total", order.totalMinor]] as const)
                .map(([label, amount]) => <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 6 }}>
                  <Text variant={label === "Total" ? "bodyStrong" : "bodySmall"}>{label}</Text>
                  <Text variant={label === "Total" ? "bodyStrong" : "bodySmall"}>{money(amount) ?? "Unavailable"}</Text>
                </View>)}
            </Card>
            <Card padding="sm" elevation="none" style={{ gap: 5 }}>
              <Text variant="bodyStrong">Payment</Text>
              <Text color={order.paymentState === "PAID" ? "success" : "text"}>{paymentLabels[order.paymentState] ?? "Payment unconfirmed"}</Text>
              {order.paymentMethod ? <Text variant="bodySmall" color="textMuted">{methodLabels[order.paymentMethod] ?? readableCode(order.paymentMethod)}</Text> : null}
            </Card>
            {order.timeline.length ? <View style={{ gap: 5 }}>
              <Text variant="bodyStrong">Timeline</Text>
              {order.timeline.map((event) => <Text key={event.id} variant="bodySmall">{readableCode(event.type)} · {counterOrderDate(event.at, order.timezone)}</Text>)}
            </View> : null}
          </>}
      </ScrollView>
    </Card>
  );
}
