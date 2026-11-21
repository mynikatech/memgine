import { useIsFocused } from "@react-navigation/native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, View } from "react-native";
import { useAuth } from "@/src/providers";
import { BusinessPreviewScope } from "@/src/providers";
import { Button, Card, Text } from "@/src/ui";
import { CustomerDataApi, type CounterQrSummary, type CustomerFulfillment, type CustomerFulfillmentJourney, type CustomerFulfillmentPayment, type CustomerFulfillmentRequest, type CustomerFulfillmentStore, type CustomerRedemptionTransactionStatus, type RedemptionTransactionQr, type TransactionReceipt } from "@/src/data/api/customer-data-api";
import {
  CustomerFulfillmentDetails, CustomerFulfillmentPaymentPage, CustomerFulfillmentReviewPage,
  CustomerFulfillmentSummary, CounterQrConflict, FulfillmentChoice, FulfillmentColumns, FulfillmentPage, FulfillmentPickupCard, FulfillmentProgress,
  FulfillmentThumbnail, isCounterQrConflict, localTime, openFulfillmentCollect, read,
} from "@/src/ui/domain/CustomerFulfillmentFlow";
import { fulfillmentRoute as routeFor, verifiedFulfillmentDestination } from "@/src/core/services/fulfillment-collect-navigation";
import { QrPlaceholder } from "@/src/ui/domain/QrPlaceholder";
import { RedemptionProductPicker, type RedemptionProductSelectionState } from "@/src/ui/domain/RedemptionProductPicker";
import { fulfillmentProductScope, fulfillmentReviewScope, selectedFulfillmentStore, storeConflictMessage, storeOptions } from "@/src/ui/domain/fulfillment-store-eligibility";
import { TransactionReceiptViewer } from "@/src/ui/domain/TransactionReceiptViewer";

const api = new CustomerDataApi();
type RouteParams = {
  view?: string; org?: string; subscription?: string; id?: string; benefits?: string; offers?: string;
  labels?: string; store?: string; journey?: CustomerFulfillmentJourney; products?: string; requestKey?: string;
  collection?: string; preparedQrId?: string; storeNames?: string;
  storeAddresses?: string; storeImage?: string; artwork?: string; confirmed?: string; counterConflict?: string;
};
type BasketProps = { org: string; subscription: string; params: RouteParams; onBack: () => void; onExit: () => void };

function parseRecord(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : {};
  } catch { return {}; }
}

function ids(value?: string): string[] {
  return value?.split(",").filter(Boolean) ?? [];
}

function journeyLabel(journey: CustomerFulfillmentJourney, customerLabel: string) {
  if (journey === "IMMEDIATE_PAY_AT_COUNTER") return "Redeem at Store Counter";
  return customerLabel + " ahead — " + (journey === "ADVANCE_PAY_NOW" ? "Pay online" : "Pay at counter");
}

function useForeground() {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => listener.remove();
  }, []);
  return active;
}

function SelectFulfillment({ org, subscription, params, onBack, onExit }: BasketProps) {
  const router = useRouter();
  const focused = useIsFocused();
  const [pendingPayment, setPendingPayment] = useState<CustomerFulfillmentPayment>();
  const [stores, setStores] = useState<CustomerFulfillmentStore[]>();
  const [failure, setFailure] = useState<string>();
  const [counterConflict, setCounterConflict] = useState(false);
  const [existingQr, setExistingQr] = useState<CounterQrSummary>();
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [choice, setChoice] = useState<(RedemptionProductSelectionState & { scope: string })>();
  const selection = useMemo(() => ({
    subscriptionId: subscription, benefitIds: ids(params.benefits), offerIds: ids(params.offers),
  }), [subscription, params.benefits, params.offers]);
  const labels = parseRecord(params.labels);
  const addresses = parseRecord(params.storeAddresses);
  const artwork = parseRecord(params.artwork);
  const items = [
    ...selection.benefitIds.map((itemId) => ({ itemType: "BENEFIT" as const, itemId, label: labels["BENEFIT:" + itemId] ?? "Benefit" })),
    ...selection.offerIds.map((itemId) => ({ itemType: "OFFER" as const, itemId, label: labels["OFFER:" + itemId] ?? "Offer" })),
  ];
  useEffect(() => {
    const id = params.preparedQrId;
    if (!focused || !id) return;
    let live = true;
    void api.counterQrSummary(org, { subscriptionId: subscription, benefitIds: [], offerIds: [] }, { transactionId: id }).then((result) => {
      if (live && result.success) setExistingQr(result.data.redemption?.status === "PENDING" ? result.data.redemption : undefined);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [focused, org, params.preparedQrId, subscription]);
  useEffect(() => {
    if (!existingQr?.expiresAt) return;
    const expires = Date.parse(existingQr.expiresAt);
    if (!Number.isFinite(expires)) return;
    const timer = setTimeout(() => setExistingQr(undefined), Math.max(0, expires - Date.now()));
    return () => clearTimeout(timer);
  }, [existingQr?.expiresAt]);
  useEffect(() => {
    if (!focused) return;
    let live = true;
    void api.pendingFulfillmentPayment(org, subscription).then((result) => {
      if (live && result.success) setPendingPayment(result.data.payment ?? undefined);
    }).catch(() => { /* Availability and Counter redemption still work. */ });
    return () => { live = false; };
  }, [focused, org, subscription]);
  useEffect(() => {
    if (!selection.benefitIds.length && !selection.offerIds.length) {
      setFailure("Select a benefit or offer before choosing a Store.");
      return;
    }
    let live = true;
    setStores(undefined);
    setFailure(undefined);
    void read(api.fulfillmentStores(org, selection)).then((result) => {
      if (live) setStores(result);
    }).catch((error: unknown) => {
      if (live) setFailure(error instanceof Error ? error.message : "Store availability could not be loaded.");
    });
    return () => { live = false; };
  }, [org, reload, selection]);

  const store = selectedFulfillmentStore(stores, params.store);
  const journey = store?.journeys.length === 1 ? store.journeys[0] : store?.journeys.find((entry) => entry === params.journey);
  const { options: productOptions, key: productScope } = fulfillmentProductScope(store, journey);
  const activeChoice = choice?.scope === productScope ? choice : undefined;
  const continueSelection = async () => {
    if (!store || !journey || !activeChoice?.ready || busy) return;
    setBusy(true);
    setFailure(undefined);
    setCounterConflict(false);
    try {
      if (existingQr?.expiresAt && Date.parse(existingQr.expiresAt) > Date.now()) {
        router.push(routeFor(org, subscription, "qr", existingQr.transactionId));
        return;
      }
      if (params.preparedQrId) {
        const current = await read(api.redemptionTransactionStatus(org, params.preparedQrId));
        if (current.status === "PENDING") {
          router.push(routeFor(org, subscription, "qr", current.transactionId));
          return;
        }
        setExistingQr(undefined);
        router.setParams({ preparedQrId: "" });
      }
      if (journey === "IMMEDIATE_PAY_AT_COUNTER") {
        const result = await read(api.createStoreRedemption(org, {
          selection, storeId: store.id, journey, productSelections: activeChoice.selections,
        }));
        router.setParams({ preparedQrId: result.transactionId });
        router.push(routeFor(org, subscription, "qr", result.transactionId));
      } else {
        const requestKey = globalThis.crypto?.randomUUID?.() ??
          "ful_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
        router.push({
          pathname: "/business/fulfillment", params: {
            org, subscription, view: "review", benefits: params.benefits ?? "", offers: params.offers ?? "",
            labels: params.labels ?? "", store: store.id, journey, products: JSON.stringify(activeChoice.selections), requestKey,
            storeAddresses: params.storeAddresses ?? "", storeImage: params.storeImage ?? "", artwork: params.artwork ?? "",
          },
        });
      }
    } catch (error) {
      if (isCounterQrConflict(error)) setCounterConflict(true);
      else setFailure(error instanceof Error ? error.message : "The selection is no longer available.");
    } finally { setBusy(false); }
  };

  return (
    <FulfillmentPage title="Redeem selected" onBack={() => { if (!busy) onBack(); }} onExit={onExit} exitDisabled={busy} footer={stores?.length ? (
      <Button fullWidth disabled={busy || !journey || !activeChoice?.ready}
        label={busy ? "Please wait…" : existingQr ? "View Existing QR" : journey === "IMMEDIATE_PAY_AT_COUNTER" ? "Redeem at Store Counter" : `Review ${store?.customerLabel ?? "Order"}`}
        onPress={() => void continueSelection()} />
    ) : undefined}>
      <FulfillmentColumns main={<>
        {items.length ? <Card padding="md" style={{ gap: 6 }}>
          <Text variant="bodyStrong">Selected benefits & offers</Text>
          {items.map(({ itemType, itemId, label }) => <Text key={`${itemType}:${itemId}`} variant="bodySmall">{label}</Text>)}
        </Card> : null}
        {pendingPayment ? <Card padding="md" style={{ gap: 8 }}>
          <Text variant="bodyStrong">{pendingPayment.customerLabel} payment needs attention</Text>
          <Button variant="outline" label={pendingPayment.status === "PENDING" ? "Resume payment" : "Check payment"}
            onPress={() => router.push(routeFor(org, pendingPayment.subscriptionId, "payment", pendingPayment.paymentIntentId))} />
        </Card> : null}
        <Text variant="bodyStrong">Select Store</Text>
        {existingQr ? <Card padding="md" style={{ gap: 8, alignItems: "flex-start" }}>
          <Text variant="bodyStrong">Redemption in progress — {existingQr.transactionNumber}</Text>
          <Button label="View Existing QR" variant="outline" onPress={() => router.push(routeFor(org, subscription, "qr", existingQr.transactionId))} />
        </Card> : null}
        {counterConflict ? <CounterQrConflict organizationId={org} selection={selection}
          onOpen={(qr) => router.push(routeFor(org, subscription, "qr", qr.transactionId))} /> : null}
        {failure ? <Text variant="bodySmall" color="danger">{failure}</Text> : null}
        {!stores && !failure ? <Text variant="bodySmall">Checking Store availability…</Text> : null}
        {failure && !stores && items.length ? <Button variant="outline" label="Retry Store availability" onPress={() => setReload((value) => value + 1)} /> : null}
        {stores?.length === 0 ? <>
          <Text variant="bodySmall">{storeConflictMessage(items.map((item) => [`${item.itemType}:${item.itemId}`, item.label]), {})}</Text>
          <Button variant="outline" label="Change selections" onPress={onBack} />
        </> : null}
        {stores && storeOptions(stores, parseRecord(params.storeNames)).map((entry) => (
          <FulfillmentChoice key={entry.id} label={entry.name} selected={entry.id === store?.id} disabled={busy || !entry.eligible}
            image={params.storeImage} icon="storefront-outline"
            reason={entry.eligible ? addresses[entry.id] || "Eligible for all selected items" : "Unavailable for this selection"}
            onPress={() => {
              if (!entry.eligible || entry.id === store?.id) return;
              setChoice(undefined);
              router.setParams({ store: entry.id, journey: "", products: "" });
            }} />
        ))}
        {store && store.journeys.length > 1 ? (
          <>
            <Text variant="bodyStrong">How to redeem</Text>
            {store.journeys.map((entry) => (
              <FulfillmentChoice key={entry} label={journeyLabel(entry, store.customerLabel ?? "Order")} selected={journey === entry}
                icon={entry === "IMMEDIATE_PAY_AT_COUNTER" ? "qr-code-outline" : entry === "ADVANCE_PAY_NOW" ? "card-outline" : "bag-handle-outline"}
                reason={entry === "IMMEDIATE_PAY_AT_COUNTER" ? "Show a QR at the counter" : entry === "ADVANCE_PAY_NOW" ? "Pay online and collect at the Store" : "Pay when you collect"}
                disabled={busy} onPress={() => {
                  if (entry === journey) return;
                  setChoice(undefined);
                  router.setParams({ store: store.id, journey: entry, products: "" });
                }} />
            ))}
          </>
        ) : null}
      </>} side={store && journey ? (
          <Card padding="md">
          <RedemptionProductPicker key={productScope} subscriptionId={subscription} items={items}
            showStoreAvailability={false} initialSelections={parseRecord(params.products)}
            loadChoices={async (item) => productOptions?.[item.itemType + ":" + item.itemId] ?? []}
            onChange={(next) => {
              setChoice({ ...next, scope: productScope });
              if (next.ready) {
                const products = JSON.stringify(next.selections);
                if (products !== params.products) router.setParams({ products, store: store.id, journey });
              }
            }}
            renderChoice={(label, selected, onPress, item) => (
              <FulfillmentChoice label={label} image={artwork[`${item.itemType}:${item.itemId}`]} icon="cube-outline" selected={selected} disabled={busy} onPress={onPress} />
            )}
          />
          </Card>
        ) : null} />
    </FulfillmentPage>
  );
}

function CounterQr({ org, subscription, id, onBack }: { org: string; subscription: string; id: string; onBack: () => void }) {
  const focused = useIsFocused();
  const foreground = useForeground();
  const [status, setStatus] = useState<CustomerRedemptionTransactionStatus>();
  const [qr, setQr] = useState<RedemptionTransactionQr>();
  const [summary, setSummary] = useState<CounterQrSummary>();
  const [failure, setFailure] = useState<string>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    void api.counterQrSummary(org, { subscriptionId: subscription, benefitIds: [], offerIds: [] }, { transactionId: id }).then((result) => {
      if (live && result.success) setSummary(result.data.redemption);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [id, org, retry, subscription]);
  useEffect(() => {
    if (!focused || !foreground) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let issued = false;
    const refresh = async () => {
      try {
        const current = await read(api.redemptionTransactionStatus(org, id));
        if (!live) return;
        setStatus(current);
        setFailure(undefined);
        if (current.status !== "PENDING") { setQr(undefined); return; }
        if (!issued) {
          const credential = await read(api.issueRedemptionTransactionQr(org, id));
          if (!live) return;
          setQr(credential);
          issued = true;
        }
        timer = setTimeout(() => void refresh(), 4000);
      } catch {
        if (live) { setFailure("Could not refresh the redemption QR."); setQr(undefined); }
      }
    };
    void refresh();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [focused, foreground, org, id, retry]);
  const title = status?.status === "SUCCESS" ? "Redemption completed" : "Counter QR";
  return (
    <FulfillmentPage title={title} onBack={onBack}>
      <FulfillmentColumns main={<Card padding="lg" style={{ gap: 12 }}>
        <View style={{ gap: 12, alignItems: "center" }}>
          {failure ? <><Text color="danger">{failure}</Text><Button label="Retry" onPress={() => setRetry((value) => value + 1)} /></> : null}
          {status?.status === "SUCCESS" ? <Text>Staff completed this redemption.</Text> : null}
          {status && !["PENDING", "SUCCESS"].includes(status.status) ? <Text>This QR is no longer usable. Return to Redeem to select your items again.</Text> : null}
          {qr && status?.status === "PENDING" ? (
            <>
              <Text variant="bodyStrong">Show this code at the Counter</Text>
              <QrPlaceholder value={qr.qrReference} />
              <Text variant="bodySmall">{summary ? "" : `${qr.transactionNumber} · `}Expires {localTime(qr.expiresAt, summary?.timezone)}</Text>
            </>
          ) : !status && !failure ? <Text>Loading redemption…</Text> : null}
        </View>
      </Card>} side={summary ? <Card padding="md" style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <FulfillmentThumbnail icon="storefront-outline" size={36} />
          <View style={{ flex: 1 }}>
            {summary.storeName ? <Text variant="bodyStrong">{summary.storeName}</Text> : null}
            <Text variant="caption" color="textMuted">{summary.transactionNumber}</Text>
          </View>
        </View>
        {summary.items.map((entry) => <View key={entry.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <FulfillmentThumbnail icon="cube-outline" size={36} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{entry.productName ? `${entry.quantity} × ${entry.productName}` : entry.name ?? (entry.type === "BENEFIT" ? "Benefit" : "Offer")}</Text>
            {entry.productName && entry.name ? <Text variant="caption" color="textMuted">{entry.name}</Text> : null}
          </View>
        </View>)}
      </Card> : null} />
    </FulfillmentPage>
  );
}

function FulfillmentRecord({ org, subscription, view, id, confirmed, counterConflict, onBack }: { org: string; subscription: string; view: string; id: string; confirmed: boolean; counterConflict: boolean; onBack: () => void }) {
  const router = useRouter();
  const focused = useIsFocused();
  const foreground = useForeground();
  const { session } = useAuth();
  const [record, setRecord] = useState<CustomerFulfillment>();
  const [payment, setPayment] = useState<CustomerFulfillmentPayment>();
  const [failure, setFailure] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const open = useCallback((item: CustomerFulfillment, justConfirmed = false) => {
    const route = routeFor(org, subscription, "details", item.id);
    router.replace(justConfirmed ? { ...route, params: { ...route.params, confirmed: "1" } } : route);
  }, [org, router, subscription]);
  const confirm = useCallback((item: CustomerFulfillment) => router.replace(routeFor(org, subscription, "confirmation", item.id)), [org, router, subscription]);
  useEffect(() => {
    if (!focused || !foreground || !session?.userId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setFailure(undefined);
    if (view === "payment") {
      void read(api.reconcileFulfillmentPayment(org, id)).then((result) => {
        if (!live) return;
        if (result.fulfillment && result.payment?.paymentIntentId === id && result.payment.status === "SUCCEEDED") confirm(result.fulfillment);
        else if (result.payment) setPayment(result.payment);
        else setFailure("Payment is unavailable.");
      }).catch((error: unknown) => { if (live) setFailure(error instanceof Error ? error.message : "Payment is unavailable."); });
    } else {
      const readRecord = async () => {
        try {
          const value = await read(api.fulfillment(org, id));
          if (!live) return;
          setRecord(value);
          if (view === "confirmation" && value.status !== "FULFILLED" && value.status !== "CANCELLED") {
            timer = setTimeout(() => void readRecord(), 8000);
          }
        } catch (error) {
          if (live) setFailure(error instanceof Error ? error.message : "This request is unavailable.");
        }
      };
      void readRecord();
    }
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [confirm, focused, foreground, id, org, retry, session?.userId, view]);

  if (payment && session?.userId && view === "payment") {
    return <CustomerFulfillmentPaymentPage key={id + ":" + payment.status} initial={payment}
      counterConflict={counterConflict}
      onOpenCounterQr={(qr) => router.push(routeFor(org, payment.subscriptionId, "qr", qr.transactionId))}
      organizationId={org} customerUserId={session.userId} onClose={onBack}
      onState={() => undefined} onAccepted={(item, destination) => destination === "details" ? open(item, true) : confirm(item)} />;
  }
  if (record && view === "confirmation") {
    return (
      <FulfillmentPage title={record.customerLabel + " Placed"} onBack={onBack}
        footer={<Button fullWidth label={`View ${record.customerLabel} Status`} onPress={() => open(record, true)} />}>
        <FulfillmentColumns main={<>
          <FulfillmentProgress item={record} confirmation />
          <FulfillmentPickupCard organizationId={org} item={record} active={focused && foreground} />
        </>} side={<>
          <Card padding="md"><CustomerFulfillmentSummary item={record} showItems showReference={false} /></Card>
          {failure ? <Card padding="md" style={{ gap: 8 }}>
            <Text variant="bodySmall" color="textMuted">Could not refresh. The last available status is shown.</Text>
            <Button variant="outline" label="Refresh status" onPress={() => setRetry((value) => value + 1)} />
          </Card> : null}
        </>} />
      </FulfillmentPage>
    );
  }
  if (record && view === "details") {
    return (
      <>
        <CustomerFulfillmentDetails initial={record} organizationId={org} focused={focused && !receipt} confirmation={confirmed}
          onClose={onBack} onReceipt={async (receiptId) => setReceipt(await read(api.receipt(org, receiptId)))}
          onChanged={() => undefined} />
        <TransactionReceiptViewer visible={!!receipt} receipt={receipt} onClose={() => setReceipt(null)} />
      </>
    );
  }
  return (
    <FulfillmentPage title={view === "payment" ? "Payment" : "Request details"} onBack={onBack}>
      {failure ? <View style={{ gap: 12 }}><Text color="danger">{failure}</Text><Button label="Retry" onPress={() => setRetry((value) => value + 1)} /></View>
        : <Text>Loading…</Text>}
    </FulfillmentPage>
  );
}

function ReviewFulfillment({ org, subscription, params, onBack, onExit }: BasketProps) {
  const router = useRouter();
  const { session } = useAuth();
  const request = useMemo<CustomerFulfillmentRequest | undefined>(() => {
    if (!params.store || !params.requestKey || (params.journey !== "ADVANCE_PAY_NOW" && params.journey !== "ADVANCE_PAY_AT_COUNTER")) return;
    return {
      selection: { subscriptionId: subscription, benefitIds: ids(params.benefits), offerIds: ids(params.offers) },
      journey: params.journey, storeId: params.store, productSelections: parseRecord(params.products),
      requestKey: params.requestKey, collectionLocalTime: params.collection || undefined,
    };
  }, [params.benefits, params.collection, params.journey, params.offers, params.products, params.requestKey, params.store, subscription]);
  if (!request) return <FulfillmentPage title="Review" onBack={onBack}><Text>Return to Redeem and select your items again.</Text></FulfillmentPage>;
  return (
    <CustomerFulfillmentReviewPage
      key={fulfillmentReviewScope(org, request)}
      organizationId={org} request={request} itemLabels={parseRecord(params.labels)}
      artwork={parseRecord(params.artwork)} storeAddress={parseRecord(params.storeAddresses)[request.storeId]} storeImage={params.storeImage}
      onOpenCounterQr={(qr) => router.push(routeFor(org, subscription, "qr", qr.transactionId))}
      onClose={onBack} onExit={onExit} requestKeyFor={() => request.requestKey ?? ""}
      onQuotedTime={(time) => {
        if ((params.collection || undefined) !== time) router.setParams({ collection: time ?? "" });
      }}
      onAccepted={(record) => router.replace(routeFor(org, subscription, "confirmation", record.id))}
      onPayment={async (payment) => {
        const recovery = routeFor(org, payment.subscriptionId, "payment", payment.paymentIntentId);
        if (payment.status === "PENDING" && session?.userId) {
          try {
            const returned = await openFulfillmentCollect(org, session.userId, payment);
            if (!returned) return; // The current browser tab is navigating to secure checkout.
            const result = await read(api.reconcileFulfillmentPayment(org, payment.paymentIntentId));
            const route = verifiedFulfillmentDestination(result, org, payment.paymentIntentId, returned.view, true) ?? recovery;
            router.replace(returned.counterConflict && route.params.view === "payment"
              ? { ...route, params: { ...route.params, counterConflict: "1" } } : route);
            return;
          } catch {
            // Resume the exact durable intent if the browser or status request did not complete.
          }
        }
        router.replace(recovery);
      }} />
  );
}

export default function CustomerFulfillmentRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const { session, loading } = useAuth();
  const { org, subscription, view = "selection", id } = params;
  const exitToBusiness = () => {
    if (subscription) router.dismissTo({ pathname: "/business/[subscriptionId]", params: { subscriptionId: subscription } });
    else router.replace("/customer/cards");
  };
  const onBack = () => {
    if (router.canGoBack()) router.back();
    else if (subscription) router.replace({ pathname: "/business/[subscriptionId]", params: { subscriptionId: subscription } });
    else router.replace("/customer/cards");
  };
  if (loading) return null;
  if (!session?.userId && typeof org === "string" && typeof subscription === "string" && typeof id === "string" &&
      (view === "details" || view === "confirmation" || view === "payment")) {
    const query = new URLSearchParams({ org, subscription, view, id });
    if (params.confirmed === "1") query.set("confirmed", "1");
    if (params.counterConflict === "1") query.set("counterConflict", "1");
    return <Redirect href={{ pathname: "/customer-login", params: { returnTo: `/business/fulfillment?${query}` } }} />;
  }
  if (!session?.userId || !org || !subscription) {
    return <FulfillmentPage title="Redemption" onBack={onBack}><Text>Open a membership to continue.</Text></FulfillmentPage>;
  }
  return (
    <BusinessPreviewScope key={session.userId} organizationId={org}>
      {view === "selection" ? <SelectFulfillment key={JSON.stringify([org, subscription, params.benefits, params.offers])}
        org={org} subscription={subscription} params={params} onBack={onBack} onExit={exitToBusiness} />
        : view === "review" ? <ReviewFulfillment org={org} subscription={subscription} params={params} onBack={onBack} onExit={exitToBusiness} />
        : view === "qr" && id ? <CounterQr key={id} org={org} subscription={subscription} id={id} onBack={onBack} />
        : id && ["payment", "confirmation", "details"].includes(view) ? (
          <FulfillmentRecord key={JSON.stringify([org, subscription, view, id])} org={org} subscription={subscription} view={view} id={id}
            confirmed={params.confirmed === "1"} counterConflict={params.counterConflict === "1"}
            onBack={view === "confirmation" || params.confirmed === "1" ? exitToBusiness : onBack} />
        ) : <FulfillmentPage title="Redemption" onBack={onBack}><Text>This request is unavailable.</Text></FulfillmentPage>}
    </BusinessPreviewScope>
  );
}
