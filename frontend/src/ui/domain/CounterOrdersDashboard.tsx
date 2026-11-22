import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";

import { formatTransactionMoney } from "@/src/core/domain/savings-display";
import { CounterApi, type CounterContext, type CounterOrder, type CounterOrderFilter, type CounterOrderFilters, type CounterOrderLifecycle, type CounterOrderPage, type CounterOrderSupportAction, type CounterOrderTransition } from "@/src/data/api/counter-api";
import type { ApiResult } from "@/src/data/api/result";
import { useTheme } from "@/src/providers";
import { Badge, Button, Card, DateInput, Input, Modal, ReferenceSelect, StateView, Text } from "@/src/ui";
import {
  changeCounterOrderFilters, counterOrderDate, counterOrderKeyboardTarget, counterOrderMaxOffset, counterOrderPageSize,
  counterOrderSelection, counterOrderStore, counterOrdersLayout,
} from "./counter-orders-model";
import { CounterPickupLookup, type CounterPickupMatch } from "./CounterPickupLookup";

const api = new CounterApi();
const statusLabels = {
  ACTIVE: "Active orders", ALL: "All statuses", PLACED: "Placed", PREPARING: "Preparing", READY: "Ready for pickup",
  FULFILLED: "Collected", CANCEL_REQUESTED: "Cancellation requested", CANCELLED: "Cancelled",
} satisfies Record<CounterOrderFilter, string>;
const statusOptions = Object.entries(statusLabels).map(([id, name]) => ({ id, name }));
const paymentLabels: Record<string, string> = {
  PAID: "Paid", PAYMENT_RECEIVED: "Payment received", UNPAID: "Due at counter", NO_PAYMENT_REQUIRED: "No payment due",
  PAYMENT_PENDING: "Payment pending", PAYMENT_FAILED: "Payment failed", PAYMENT_CANCELLED: "Payment cancelled",
  PAYMENT_UNCONFIRMED: "Payment unconfirmed",
};
const lifecyclePaymentLabels: Record<CounterOrderLifecycle["payment"], string> = {
  NO_PAYMENT_REQUIRED: "No payment due",
  VERIFIED_ONLINE: "Online payment verified",
  VERIFIED_AT_COUNTER: "Counter payment verified",
  PAYMENT_REQUIRED: "Payment due at counter",
  CASH_CONFIRMATION_REQUIRED: "Cash payment awaiting staff confirmation",
  CASH_RECOVERY_READY: "Terminal recovery approved for cash only",
  PAYMENT_UNRESOLVED: "Payment unconfirmed. Check the existing payment record.",
  FINANCIAL_EXCEPTION: "Financial exception requires review before collection.",
  REFUND_CONFLICT: "Refund requires review before collection.",
};
const journeyLabels = {
  IMMEDIATE_PAY_AT_COUNTER: "Redeem at Store Counter",
  ADVANCE_PAY_AT_COUNTER: "Pre-order · Pay at Store Counter",
  ADVANCE_PAY_NOW: "Prepaid order",
};
const verificationLabels = { QR: "Pickup QR", PHONE_OTP: "Phone OTP", STAFF_ASSISTED: "Staff-Assisted" };
const supportActionLabels = { "link-support": "Link Support Case", "request-cancellation": "Request Cancellation", "report-no-show": "Report No-Show" };

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

export function CounterOrdersDashboard({ context, initialOrderId, onOpenWorkspace, onOpenSupport, workspaceMode = "orders" }: {
  context: CounterContext; initialOrderId?: string; onOpenWorkspace: () => void; onOpenSupport: () => void;
  workspaceMode?: "orders" | "counter";
}) {
  const isCounterDesk = workspaceMode === "counter";
  const { organizationId } = context;
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(0);
  const layout = counterOrdersLayout(width, contentWidth || width);
  const [storeRevision, setStoreRevision] = useState(0);
  const [filters, setFilters] = useState<CounterOrderFilters>({ status: "ACTIVE", search: "", offset: 0 });
  const [searchDraft, setSearchDraft] = useState("");
  const [selection, setSelection] = useState<{ scope: string; id: string } | undefined>(() =>
    initialOrderId ? { scope: JSON.stringify([organizationId, context.storeId, context.staffId]), id: initialOrderId } : undefined);
  const [revision, setRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const [pickupMode, setPickupMode] = useState<"scan" | "manual">();
  const [expectedPickupOrder, setExpectedPickupOrder] = useState<string>();
  const [pickupMatch, setPickupMatch] = useState<CounterPickupMatch>();
  const [verificationMode, setVerificationMode] = useState<"phone" | "assisted">();
  const [supportAction, setSupportAction] = useState<CounterOrderSupportAction>();
  const [confirmCollection, setConfirmCollection] = useState(false);
  const [confirmCash, setConfirmCash] = useState(false);
  const [confirmTerminalRecovery, setConfirmTerminalRecovery] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ orderId: string; message: string; error?: boolean }>();
  const actionInFlight = useRef(false);

  const loadStores = useCallback(() => api.orderStores(organizationId), [organizationId]);
  const stores = useOrdersRead(JSON.stringify([organizationId, context.storeId, context.staffId, storeRevision]), loadStores);
  const store = stores.kind === "ready" ? counterOrderStore(stores.data, context) : undefined;
  const scope = store ? JSON.stringify([organizationId, context.storeId, context.staffId]) : undefined;
  const loadQueue = useCallback(() => api.orders(context, filters), [context, filters]);
  const queue = useOrdersRead(scope && JSON.stringify([scope, filters, revision]), loadQueue);
  const rows = queue.kind === "ready" ? queue.data.orders : [];
  const selectedId = counterOrderSelection(isAccessDenied(queue) ? undefined : scope, selection, rows, layout.split);
  const loadDetail = useCallback(() => api.order(context, selectedId!), [context, selectedId]);
  const detail = useOrdersRead(scope && selectedId ? JSON.stringify([scope, selectedId, revision, detailRevision]) : undefined, loadDetail);

  const patchFilters = (patch: Partial<Omit<CounterOrderFilters, "offset">>) => setFilters((current) => changeCounterOrderFilters(current, patch));
  const refresh = () => setRevision((current) => current + 1);
  const search = () => patchFilters({ search: searchDraft.trim() });
  const chooseOrder = (id: string) => {
    if (!scope) return;
    if (id !== selectedId) {
      setPickupMatch(undefined);
      setConfirmCollection(false);
      setConfirmCash(false);
      setConfirmTerminalRecovery(false);
      setVerificationMode(undefined);
      setSupportAction(undefined);
    }
    setSelection({ scope, id });
  };
  const openScan = (mode: "scan" | "manual", orderId?: string) => {
    setPickupMatch(undefined);
    setExpectedPickupOrder(orderId);
    setPickupMode(mode);
  };
  const refreshAuthorizedOrder = () => setDetailRevision((value) => value + 1);
  const openPickupMatch = async (match: CounterPickupMatch, credential?: string) => {
    chooseOrder(match.orderId);
    setPickupMatch(match);
    setPickupMode(undefined);
    if (isCounterDesk && credential && match.kind === "verified" && !actionInFlight.current) {
      actionInFlight.current = true;
      setActionBusy(true);
      try {
        const order = await api.order(context, match.orderId);
        if (order.success && order.data.lifecycle?.canAuthorizeCollection) {
          const result = await api.authorizeOrderPickup(context, match.orderId, order.data.lifecycle.version, "qr", credential);
          setActionNotice({ orderId: match.orderId, message: result.success ? "Customer verified for collection" : result.error.message, error: !result.success });
        }
      } catch {
        setActionNotice({ orderId: match.orderId, message: "Collection verification could not be confirmed. Refresh the order.", error: true });
      } finally {
        actionInFlight.current = false;
        setActionBusy(false);
      }
    }
    refreshAuthorizedOrder();
  };
  const matchForDetail = pickupMatch?.orderId === selectedId ? pickupMatch : undefined;
  const outsideQueue = !!matchForDetail && queue.kind === "ready" && !rows.some(({ id }) => id === selectedId);
  const mobileDetail = !layout.split && !!selectedId;
  const selectedOrder = detail.kind === "ready" ? detail.data : undefined;
  const runOrderAction = async (action: CounterOrderTransition | "complete-collection") => {
    if (!selectedOrder?.lifecycle || !scope || actionInFlight.current) return;
    const { id, lifecycle } = selectedOrder;
    const collect = action === "complete-collection";
    if ((collect && (isCounterDesk || !lifecycle.canCompleteCollection || !confirmCollection)) ||
        (action === "start-preparing" && (isCounterDesk || !lifecycle.canStartPreparing)) ||
        (action === "mark-ready" && (isCounterDesk || !lifecycle.canMarkReady)) ||
        (action === "start-cash" && (!isCounterDesk || !lifecycle.canStartCash)) ||
        (action === "confirm-cash" && (!isCounterDesk || !lifecycle.canConfirmCash || !confirmCash))) return;
    actionInFlight.current = true;
    setActionBusy(true);
    setActionNotice(undefined);
    setSelection({ scope, id });
    if (collect) {
      setConfirmCollection(false);
      setPickupMatch(undefined);
    }
    if (action === "confirm-cash") setConfirmCash(false);
    try {
      const result = action === "complete-collection" ? await api.completeOrderCollection(context, id, lifecycle.version)
        : await api.transitionOrder(context, id, action, lifecycle.version);
      const success = { COLLECTION_COMPLETED: "Collection completed", ORDER_UPDATED: "Order updated",
        CASH_STARTED: "Cash payment opened", PAYMENT_RECORDED: "Cash payment recorded" };
      setActionNotice(result.success ? { orderId: id, message: success[result.data.code] }
        : { orderId: id, message: result.error.message, error: true });
    } catch {
      setActionNotice({ orderId: id, message: "The update could not be confirmed. Review the latest order details.", error: true });
    } finally {
      refresh();
      setActionBusy(false);
      actionInFlight.current = false;
    }
  };
  const visibleNotice = actionNotice?.orderId === selectedId ? actionNotice : undefined;
  const lifecycle = selectedOrder?.lifecycle;
  const runTerminal = async (paymentAttemptId?: string) => {
    if (!isCounterDesk || !selectedOrder || !lifecycle || actionInFlight.current || !scope) return;
    actionInFlight.current = true;
    setActionBusy(true);
    const id = selectedOrder.id;
    setSelection({ scope, id });
    setConfirmTerminalRecovery(false);
    try {
      const result = paymentAttemptId
        ? await api.recoverOrderTerminal(context, id, lifecycle.version, paymentAttemptId)
        : await api.startOrderTerminal(context, id, lifecycle.version);
      setActionNotice({ orderId: id, message: result.success
        ? paymentAttemptId ? "Terminal check recorded. Review the payment status before taking cash." : "Terminal payment requested. Refresh to check the verified outcome."
        : result.error.message, error: !result.success });
    } catch {
      setActionNotice({ orderId: id, message: "Payment outcome is unknown. Refresh the existing order before trying again.", error: true });
    } finally {
      refresh();
      setActionBusy(false);
      actionInFlight.current = false;
    }
  };
  // Preparation and handover are exclusively Orders actions. The server remains authoritative
  // for enabled transitions, payment state and collection authorization.
  const nextFulfillmentAction = !isCounterDesk && selectedOrder && lifecycle &&
    selectedOrder.status !== "FULFILLED" && selectedOrder.status !== "CANCELLED" &&
    selectedOrder.status !== "CANCEL_REQUESTED" ? (
      lifecycle.canStartPreparing ? "start-preparing" :
      lifecycle.canMarkReady ? "mark-ready" :
      lifecycle.canCompleteCollection ? "complete-collection" :
      selectedOrder.status === "READY" ? "complete-collection" :
      selectedOrder.status === "PLACED" ? "complete-collection" : undefined
    ) : undefined;
  const fulfillmentActionLabel = nextFulfillmentAction === "start-preparing" ? "Start Preparing" :
    nextFulfillmentAction === "mark-ready" ? "Mark Ready" : "Complete Collection / Handover";
  const fulfillmentActionEnabled = nextFulfillmentAction === "start-preparing" ? !!lifecycle?.canStartPreparing :
    nextFulfillmentAction === "mark-ready" ? !!lifecycle?.canMarkReady : !!lifecycle?.canCompleteCollection;
  const actions = selectedOrder && lifecycle ? <View style={{ gap: 8 }}>
    {!isCounterDesk && nextFulfillmentAction ? <>
      <Button label={fulfillmentActionLabel} disabled={actionBusy || !fulfillmentActionEnabled}
        onPress={() => nextFulfillmentAction === "complete-collection"
          ? setConfirmCollection(true) : void runOrderAction(nextFulfillmentAction)} />
      {!fulfillmentActionEnabled && nextFulfillmentAction === "complete-collection" ?
        <Text variant="caption" color="textMuted">Handover requires a verified customer/order at Counter, confirmed payment, and an eligible preparation stage.</Text> : null}
    </> : null}
    {!isCounterDesk && selectedOrder.status === "FULFILLED" ? <Text color="success" variant="bodyStrong">Collected / Fulfilled</Text> : null}
    {!isCounterDesk && selectedOrder.status === "CANCEL_REQUESTED" ?
      <Text color="danger" variant="bodySmall">Cancellation requested — handover is on hold. Staff approval/rejection is not yet available in the 309C API; do not complete collection.</Text> : null}
    {isCounterDesk && lifecycle.canAuthorizeCollection && !lifecycle.verificationMethod ? <>
      <Button label="Verify Pickup QR" disabled={actionBusy} onPress={() => openScan("scan", selectedOrder.id)} />
      <Button label="Verify by Phone OTP" variant="outline" disabled={actionBusy} onPress={() => setVerificationMode("phone")} />
      <Button label="Staff-Assisted Verification" variant="outline" disabled={actionBusy} onPress={() => setVerificationMode("assisted")} />
    </> : null}
    {isCounterDesk && lifecycle.canStartCash ? <Button label="Take Cash Payment" variant="outline" disabled={actionBusy} onPress={() => void runOrderAction("start-cash")} /> : null}
    {isCounterDesk && lifecycle.canStartTerminal ? <Button label="Take Terminal Payment" variant="outline" disabled={actionBusy} onPress={() => void runTerminal()} /> : null}
    {isCounterDesk && lifecycle.terminalRecoveryAttemptId ? <Button label="Check Terminal and Take Cash" variant="outline" disabled={actionBusy}
      onPress={() => setConfirmTerminalRecovery(true)} /> : null}
    {isCounterDesk && lifecycle.canConfirmCash ? <Button label="Confirm Cash Received" variant="outline" disabled={actionBusy} onPress={() => setConfirmCash(true)} /> : null}
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <Button size="sm" label="Refresh Status" variant="outline" disabled={actionBusy} onPress={refresh} />
      <Button size="sm" label="Open Support" variant="outline" onPress={onOpenSupport} />
      {lifecycle.canLinkSupport ? <Button size="sm" label="Link Support" variant="outline" disabled={actionBusy}
        onPress={() => setSupportAction("link-support")} /> : null}
      {!isCounterDesk && lifecycle.canReportNoShow ? <Button size="sm" label="Report No-Show" variant="outline" disabled={actionBusy}
        onPress={() => setSupportAction("report-no-show")} /> : null}
    </View>
  </View> : null;
  const counts = queue.kind === "ready" ? queue.data.statusCounts : undefined;
  const activeCount = counts ? (counts.PLACED ?? 0) + (counts.PREPARING ?? 0) + (counts.READY ?? 0) + (counts.CANCEL_REQUESTED ?? 0) : undefined;
  const summaries = [
    { status: "ACTIVE", label: "Active", count: activeCount }, { status: "READY", label: "Ready for pickup", count: counts && (counts.READY ?? 0) },
    { status: "CANCEL_REQUESTED", label: "Cancellation requests", count: counts && (counts.CANCEL_REQUESTED ?? 0) },
    { status: "FULFILLED", label: "Collected", count: counts && (counts.FULFILLED ?? 0) },
  ] as const;
  const content = { paddingHorizontal: layout.padding, paddingTop: 14, paddingBottom: 12, gap: 12 };
  const Workspace = layout.split ? View : ScrollView;

  return (
    <View testID="counter-orders-dashboard" onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
      style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: theme.colors.background }}>
      {stores.kind !== "ready" || !store ? (
        <View style={{ padding: layout.padding }}>
          <Text variant="title">{isCounterDesk ? "Counter · Verify & Pay" : "Orders"}</Text>
          {stores.kind === "loading" ? <StateView kind="loading" title="Loading authorized Stores" /> : stores.kind === "error" ? (
            <StateView kind="error" title="Could not load the Counter Store" message={stores.message}
              actionLabel={isAccessDenied(stores) ? "Open Counter workspace" : "Retry"}
              onAction={isAccessDenied(stores) ? onOpenWorkspace : () => setStoreRevision((value) => value + 1)} />
          ) : <StateView kind="empty" title="Active Store unavailable" message="Check your Store and staff assignment in Counter."
            actionLabel="Open Counter workspace" onAction={onOpenWorkspace} />}
        </View>
      ) : mobileDetail ? (
        <View testID="counter-orders-mobile-detail" style={{ flex: 1, paddingHorizontal: layout.padding, paddingTop: 12, minHeight: 0 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", marginBottom: 10 }}>
            <Button variant="ghost" label="Back to orders" onPress={() => {
              setPickupMatch(undefined);
              setSelection(undefined);
              setConfirmCash(false);
              setConfirmTerminalRecovery(false);
              setConfirmCollection(false);
              setSupportAction(undefined);
              if (isAccessDenied(detail)) refresh();
            }} />
            {isAccessDenied(detail) ? <Button variant="outline" label="Open Counter workspace" onPress={onOpenWorkspace} /> : null}
          </View>
          <CounterOrderDetails state={detail} pickupMatch={matchForDetail} outsideQueue={outsideQueue} actions={actions}
            busy={actionBusy} notice={visibleNotice} onRetry={() => setDetailRevision((value) => value + 1)} />
        </View>
      ) : (
        <Workspace style={{ flex: 1, minHeight: 0, ...(layout.split ? content : undefined) }}
          {...(!layout.split ? { contentContainerStyle: content, keyboardShouldPersistTaps: "handled" as const } : {})}>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <View>
                <Text variant="title" accessibilityRole="header">{isCounterDesk ? "Counter · Verify & Pay" : "Orders"}</Text>
                <Text variant="bodySmall" color="textMuted" testID="counter-orders-active-store">Store · {store.name}</Text>
                <Text variant="caption" color="textMuted">{isCounterDesk ? "Verify the customer and their order, then collect outstanding payment. Preparation and handover are managed in Orders." : "Prepare orders and complete handover after Counter verification and payment. No verification or payment is performed here."}</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {isAccessDenied(queue) || isAccessDenied(detail) ? <Button variant="outline" size="sm" label="Open Counter workspace" onPress={onOpenWorkspace} /> : isCounterDesk ? <>
                  <Button size="sm" label="Scan Pickup QR" disabled={actionBusy} onPress={() => openScan("scan")} />
                  <Button size="sm" variant="outline" label="Enter Pickup Code" disabled={actionBusy} onPress={() => openScan("manual")} />
                </> : null}
                <Button variant="outline" size="sm" label="Refresh" onPress={refresh} />
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}>
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
          } details={<CounterOrderDetails state={selectedId ? detail : undefined} pickupMatch={matchForDetail}
            outsideQueue={outsideQueue} actions={actions} busy={actionBusy} notice={visibleNotice}
            onRetry={() => setDetailRevision((value) => value + 1)} />} />
        </Workspace>
      )}
      {isCounterDesk && store && pickupMode && !isAccessDenied(queue) && !isAccessDenied(detail) ? <CounterPickupLookup key={pickupMode} mode={pickupMode} storeName={store.name}
        context={context} expectedOrderId={expectedPickupOrder} onClose={() => setPickupMode(undefined)} onMatch={(match, credential) => void openPickupMatch(match, credential)} /> : null}
      {isCounterDesk && verificationMode && selectedOrder && lifecycle?.canAuthorizeCollection ?
        <CounterOrderVerification key={selectedOrder.id} context={context} order={selectedOrder} mode={verificationMode}
          onClose={() => setVerificationMode(undefined)}
          onVerified={() => { setVerificationMode(undefined); refreshAuthorizedOrder(); }} /> : null}
      {!isCounterDesk && confirmCollection && selectedOrder && lifecycle?.canCompleteCollection ?
        <Modal visible title="Review Collection" scrollable onClose={() => setConfirmCollection(false)}>
          <CollectionReview order={selectedOrder} busy={actionBusy} onComplete={() => void runOrderAction("complete-collection")} />
        </Modal> : null}
      {isCounterDesk && confirmCash && selectedOrder && lifecycle?.canConfirmCash ?
        <Modal visible title="Confirm Cash Received" onClose={() => setConfirmCash(false)}>
          <View style={{ gap: 8 }}>
            <Text>{selectedOrder.reference}</Text>
            <Text>Record cash only after receiving {formatTransactionMoney(lifecycle.outstandingMinor, selectedOrder.currencyCode)}.</Text>
            <Button label="Confirm Cash Received" disabled={actionBusy} onPress={() => void runOrderAction("confirm-cash")} />
          </View>
        </Modal> : null}
      {isCounterDesk && confirmTerminalRecovery && selectedOrder && lifecycle?.terminalRecoveryAttemptId ?
        <Modal visible title="Confirm Terminal Check" onClose={() => setConfirmTerminalRecovery(false)}>
          <View style={{ gap: 8 }}>
            <Text>Check the physical terminal for this order. Continue only if it shows no successful payment.</Text>
            <Button label="I Checked the Terminal" disabled={actionBusy}
              onPress={() => void runTerminal(lifecycle.terminalRecoveryAttemptId ?? undefined)} />
          </View>
        </Modal> : null}
      {supportAction && selectedOrder && lifecycle ? <CounterOrderSupportForm key={selectedOrder.id} context={context} order={selectedOrder} action={supportAction}
        onClose={() => setSupportAction(undefined)}
        onUpdated={() => { setSupportAction(undefined); refresh(); }} /> : null}
    </View>
  );
}

function CounterOrderSupportForm({ context, order, action, onClose, onUpdated }: {
  context: CounterContext; order: CounterOrder; action: CounterOrderSupportAction; onClose: () => void; onUpdated: () => void;
}) {
  const [caseNumber, setCaseNumber] = useState(order.lifecycle?.supportCaseNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const submit = async () => {
    if (!order.lifecycle || inFlight.current || !caseNumber.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.updateOrderSupport(context, order.id, action, order.lifecycle.version, caseNumber.trim());
      if (result.success) onUpdated();
      else setError(result.error.message);
    } catch {
      setError("The Support action could not be confirmed. Refresh the order.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return <Modal visible title={supportActionLabels[action]} onClose={onClose}>
    <View style={{ gap: 8 }}>
      <Text>{order.reference}</Text>
      <Input label="Open Support case number" value={caseNumber} onChangeText={setCaseNumber} maxLength={32} editable={!busy} />
      {error ? <Text color="danger" accessibilityLiveRegion="polite">{error}</Text> : null}
      <Button label={supportActionLabels[action]} disabled={busy || !caseNumber.trim()} onPress={() => void submit()} />
    </View>
  </Modal>;
}

function CounterOrderVerification({ context, order, mode, onClose, onVerified }: {
  context: CounterContext; order: CounterOrder; mode: "phone" | "assisted"; onClose: () => void; onVerified: () => void;
}) {
  const [challenge, setChallenge] = useState<string>();
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const submit = async () => {
    if (inFlight.current || !order.lifecycle) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (mode === "phone" && !challenge) {
        const result = await api.requestOrderPickupOtp(context, order.id);
        if (result.success) setChallenge(result.data.challengeId);
        else setError(result.error.message);
        return;
      }
      setEntry("");
      const result = challenge ? await api.authorizeOrderPickupOtp(context, order.id, order.lifecycle.version, challenge, entry.trim())
        : await api.authorizeOrderPickup(context, order.id, order.lifecycle.version, "assisted", entry.trim());
      if (result.success) onVerified();
      else setError(result.error.message);
    } catch {
      setError("Verification could not be confirmed. Review the latest order details.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return <Modal visible title={mode === "phone" ? "Verify by Phone OTP" : "Staff-Assisted Verification"} onClose={onClose} scrollable>
    <View style={{ gap: 8 }}>
      <Text variant="bodyStrong">{order.reference}</Text>
      {mode === "phone" ? <Text>{challenge ? "Enter the code sent to the customer." : "Send a code to the customer's verified phone."}</Text>
        : <Text>Confirm the customer's identity and ask them for the membership number associated with this order.</Text>}
      {mode === "assisted" || challenge ? <Input label={challenge ? "Verification code" : "Membership number"}
        value={entry} onChangeText={setEntry} secureTextEntry editable={!busy} autoCorrect={false} autoCapitalize="none"
        keyboardType={challenge ? "number-pad" : "default"} maxLength={challenge ? 8 : 64} /> : null}
      {error ? <Text color="danger" accessibilityLiveRegion="polite">{error}</Text> : null}
      <Button label={busy ? "Checking…" : mode === "phone" && !challenge ? "Send code" : "Verify customer"}
        disabled={busy || ((mode === "assisted" || !!challenge) && !entry.trim())} onPress={() => void submit()} />
    </View>
  </Modal>;
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

export function CollectionReview({ order, busy, onComplete }: { order: CounterOrder; busy: boolean; onComplete: () => void }) {
  const lifecycle = order.lifecycle;
  return <View style={{ gap: 8 }}>
    <Text variant="bodyStrong">{order.reference}</Text>
    {order.customerName ? <Text>{order.customerName}</Text> : null}
    <Text>{order.storeName}</Text>
    <Text>Pickup · {statusLabels[order.status]} · {counterOrderDate(order.pickupAt, order.timezone)}</Text>
    {order.items.map((item) => <Text key={item.id}>{item.quantity} × {item.name}</Text>)}
    <Text>{lifecycle ? lifecyclePaymentLabels[lifecycle.payment] : "Payment unconfirmed"}</Text>
    {lifecycle?.outstandingMinor != null ? <Text>Outstanding · {formatTransactionMoney(lifecycle.outstandingMinor, order.currencyCode)}</Text> : null}
    <Text color="success">{lifecycle?.verificationMethod ? `${verificationLabels[lifecycle.verificationMethod]} verified` : "Verification required"}</Text>
    <Button label="Complete Collection" disabled={busy || !lifecycle?.canCompleteCollection} onPress={onComplete} />
  </View>;
}

export function CounterOrderDetails({ state, pickupMatch, outsideQueue, actions, busy, notice, onRetry }: {
  state?: Remote<CounterOrder>; pickupMatch?: CounterPickupMatch; outsideQueue?: boolean; onRetry: () => void;
  actions?: ReactNode; busy?: boolean; notice?: { message: string; error?: boolean };
}) {
  const theme = useTheme();
  const order = state?.kind === "ready" ? state.data : undefined;
  const money = (value: number | null | undefined) => formatTransactionMoney(value, order?.currencyCode);
  return (
    <Card padding="none" elevation="none" testID="counter-order-details" style={{ flex: 1, minHeight: 0 }}>
      <View style={{ padding: 12, borderBottomWidth: 1, borderColor: theme.colors.border }}>
        <Text variant="bodyStrong" accessibilityRole="header" accessibilityLiveRegion="polite">{order ? order.reference : "Order details"}</Text>
      </View>
      <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
        {notice ? <Text color={notice.error ? "danger" : "success"} accessibilityLiveRegion="polite">{notice.message}</Text> : null}
        {busy ? <Text variant="bodySmall" accessibilityLiveRegion="polite">Updating order…</Text> : null}
        {!state ? <StateView kind="empty" title="Select an order" /> : state.kind === "loading" ? <StateView kind="loading" title="Loading order details" /> :
          state.kind === "error" ? <StateView kind="error" title="Could not load order details" message={state.message} actionLabel="Retry" onAction={onRetry} /> : order && <>
            {pickupMatch?.orderId === order.id ? <Card padding="sm" elevation="none" style={{ gap: 4 }} testID="counter-pickup-match">
              <Text variant="bodyStrong" accessibilityLiveRegion="polite">{pickupMatch.kind === "verified" ? "Pickup QR verified" : "Order located by reference"}</Text>
              <Text variant="bodySmall" color="textMuted">{pickupMatch.kind === "verified" ?
                "Review the order and payment status. Collection has not been completed." : "The order reference does not verify pickup. Ask for the pickup QR."}</Text>
              {outsideQueue ? <Text variant="caption" color="textMuted">This order is outside the current queue filters or page.</Text> : null}
            </Card> : null}
            <View style={{ alignItems: "flex-start", gap: 4 }}>
              <Badge label={statusLabels[order.status] ?? order.status} tone={order.status === "READY" ? "success" : "neutral"} />
              <Text variant="bodyStrong">{order.customerName ?? "Customer name unavailable"}</Text>
              <Text variant="bodySmall">{order.storeName}</Text>
              {order.lifecycle?.journey ? <Text variant="bodySmall">{journeyLabels[order.lifecycle.journey]}</Text> : null}
              <Text color={order.lifecycle?.verificationMethod ? "success" : "textMuted"}>Verification · {order.lifecycle?.verificationMethod ? `${verificationLabels[order.lifecycle.verificationMethod]} verified at Counter` : "Not yet verified at Counter"}</Text>
              {order.lifecycle?.supportCaseNumber ? <Text variant="bodySmall">Support case {order.lifecycle.supportCaseNumber}</Text> : null}
              {order.lifecycle?.collectionBlocker ? <Text color="danger">{order.lifecycle.collectionBlocker === "CANCELLATION_REQUESTED"
                ? "Cancellation requested. Collection is on hold." : "Resolve the linked Support case before collection."}</Text> : null}
              <Text variant="bodySmall">Pickup · {counterOrderDate(order.pickupAt, order.timezone)}</Text>
              <Text variant="caption" color="textMuted">Placed · {counterOrderDate(order.placedAt, order.timezone)}</Text>
              {order.lifecycle?.collectedAt ? <Text variant="bodySmall">Collected · {counterOrderDate(order.lifecycle.collectedAt, order.timezone)}</Text> : null}
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
              <Text>{order.lifecycle ? lifecyclePaymentLabels[order.lifecycle.payment] : paymentLabels[order.paymentState] ?? "Payment unconfirmed"}</Text>
              {order.lifecycle?.outstandingMinor != null ? <Text>Outstanding · {money(order.lifecycle.outstandingMinor)}</Text> : null}
              {order.paymentMethod ? <Text variant="bodySmall" color="textMuted">{methodLabels[order.paymentMethod] ?? readableCode(order.paymentMethod)}</Text> : null}
            </Card>
            {actions}
            {order.timeline.length ? <View style={{ gap: 5 }}>
              <Text variant="bodyStrong">Timeline</Text>
              {order.timeline.map((event) => <Text key={event.id} variant="bodySmall">{readableCode(event.type)} · {counterOrderDate(event.at, order.timezone)}</Text>)}
            </View> : null}
          </>}
      </ScrollView>
    </Card>
  );
}
