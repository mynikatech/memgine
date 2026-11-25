import { useIsFocused } from "@react-navigation/native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { useAuth } from "@/src/providers";
import { BusinessPreviewScope } from "@/src/providers";
import { Button, Card, Text } from "@/src/ui";
import {
  CustomerDataApi,
  type CounterQrSummary,
  type CustomerFulfillment,
  type CustomerFulfillmentJourney,
  type CustomerFulfillmentPayment,
  type CustomerFulfillmentRequest,
  type CustomerFulfillmentStore,
  type CustomerRedemptionTransactionStatus,
  type RedemptionTransactionQr,
  type TransactionReceipt,
} from "@/src/data/api/customer-data-api";
import {
  CustomerFulfillmentDetails,
  CustomerFulfillmentPaymentPage,
  CustomerFulfillmentReviewPage,
  CounterQrConflict,
  FulfillmentChoice,
  FulfillmentColumns,
  FulfillmentPage,
  FulfillmentThumbnail,
  isCounterQrConflict,
  localTime,
  openFulfillmentCollect,
  read,
} from "@/src/ui/domain/CustomerFulfillmentFlow";
import {
  fulfillmentRoute as routeFor,
  verifiedFulfillmentDestination,
} from "@/src/core/services/fulfillment-collect-navigation";
import { QrPlaceholder } from "@/src/ui/domain/QrPlaceholder";
import {
  RedemptionProductPicker,
  type RedemptionProductSelectionState,
} from "@/src/ui/domain/RedemptionProductPicker";
import {
  fulfillmentProductScope,
  fulfillmentReviewScope,
  selectedFulfillmentStore,
  storeConflictMessage,
  storeOptions,
} from "@/src/ui/domain/fulfillment-store-eligibility";
import { TransactionReceiptViewer } from "@/src/ui/domain/TransactionReceiptViewer";

const api = new CustomerDataApi();
type RouteParams = {
  view?: string;
  org?: string;
  subscription?: string;
  id?: string;
  benefits?: string;
  offers?: string;
  labels?: string;
  store?: string;
  journey?: CustomerFulfillmentJourney;
  products?: string;
  requestKey?: string;
  collection?: string;
  preparedQrId?: string;
  storeNames?: string;
  storeAddresses?: string;
  storeImage?: string;
  artwork?: string;
  confirmed?: string;
  counterConflict?: string;
};
type BasketProps = {
  org: string;
  subscription: string;
  params: RouteParams;
  onBack: () => void;
  onExit: () => void;
};

function parseRecord(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  } catch {
    return {};
  }
}

function ids(value?: string): string[] {
  return value?.split(",").filter(Boolean) ?? [];
}

function isEligibleForJourney(
  store: CustomerFulfillmentStore | undefined,
  method: CustomerFulfillmentJourney,
  selection: CustomerFulfillmentRequest["selection"],
  productSelections: CustomerFulfillmentRequest["productSelections"],
): boolean {
  if (!store?.journeys.includes(method)) return false;
  const products =
    method === "ADVANCE_PAY_NOW" ? store.payNowProducts : store.products;
  const keys = [
    ...selection.benefitIds.map((id) => `BENEFIT:${id}`),
    ...selection.offerIds.map((id) => `OFFER:${id}`),
  ];
  return (
    keys.length > 0 &&
    Object.keys(productSelections).length === keys.length &&
    keys.every(
      (key) =>
        !!productSelections[key] &&
        (products?.[key] ?? []).some(
          (entry) => entry.productId === productSelections[key],
        ),
    )
  );
}

function useForeground() {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => listener.remove();
  }, []);
  return active;
}

function SelectFulfillment({
  org,
  subscription,
  params,
  onBack,
  onExit,
}: BasketProps) {
  const router = useRouter();
  const focused = useIsFocused();
  const [pendingPayment, setPendingPayment] =
    useState<CustomerFulfillmentPayment>();
  const [stores, setStores] = useState<CustomerFulfillmentStore[]>();
  const [failure, setFailure] = useState<string>();
  const [existingQr, setExistingQr] = useState<CounterQrSummary>();
  const navigationPending = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (focused) {
      navigationPending.current = false;
      setBusy(false);
    }
  }, [focused]);
  const [reload, setReload] = useState(0);
  const [choice, setChoice] = useState<
    RedemptionProductSelectionState & { scope: string }
  >();
  const selection = useMemo(
    () => ({
      subscriptionId: subscription,
      benefitIds: ids(params.benefits),
      offerIds: ids(params.offers),
    }),
    [subscription, params.benefits, params.offers],
  );
  const labels = parseRecord(params.labels);
  const addresses = parseRecord(params.storeAddresses);
  const artwork = parseRecord(params.artwork);
  const items = [
    ...selection.benefitIds.map((itemId) => ({
      itemType: "BENEFIT" as const,
      itemId,
      label: labels["BENEFIT:" + itemId] ?? "Benefit",
    })),
    ...selection.offerIds.map((itemId) => ({
      itemType: "OFFER" as const,
      itemId,
      label: labels["OFFER:" + itemId] ?? "Offer",
    })),
  ];
  useEffect(() => {
    const id = params.preparedQrId;
    if (!focused || !id) return;
    let live = true;
    void api
      .counterQrSummary(
        org,
        { subscriptionId: subscription, benefitIds: [], offerIds: [] },
        { transactionId: id },
      )
      .then((result) => {
        if (live && result.success)
          setExistingQr(
            result.data.redemption?.status === "PENDING"
              ? result.data.redemption
              : undefined,
          );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [focused, org, params.preparedQrId, subscription]);
  useEffect(() => {
    if (!existingQr?.expiresAt) return;
    const expires = Date.parse(existingQr.expiresAt);
    if (!Number.isFinite(expires)) return;
    const timer = setTimeout(
      () => setExistingQr(undefined),
      Math.max(0, expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [existingQr?.expiresAt]);
  useEffect(() => {
    if (!focused) return;
    let live = true;
    void api
      .pendingFulfillmentPayment(org, subscription)
      .then((result) => {
        if (live && result.success)
          setPendingPayment(result.data.payment ?? undefined);
      })
      .catch(() => {
        /* Availability and Counter redemption still work. */
      });
    return () => {
      live = false;
    };
  }, [focused, org, subscription]);
  useEffect(() => {
    if (!selection.benefitIds.length && !selection.offerIds.length) {
      setFailure("Select a benefit or offer before choosing a Store.");
      return;
    }
    let live = true;
    setStores(undefined);
    setFailure(undefined);
    void read(api.fulfillmentStores(org, selection))
      .then((result) => {
        if (live) setStores(result);
      })
      .catch((error: unknown) => {
        if (live)
          setFailure(
            error instanceof Error
              ? error.message
              : "Store availability could not be loaded.",
          );
      });
    return () => {
      live = false;
    };
  }, [org, reload, selection]);

  const store = selectedFulfillmentStore(stores, params.store);
  // Use the store-wide product set. A chosen redemption method is independently
  // checked against its allowed product scope on the Review screen.
  const { options: productOptions, key: productScope } =
    fulfillmentProductScope(
      store,
      store?.journeys.every((method) => method === "ADVANCE_PAY_NOW")
        ? "ADVANCE_PAY_NOW"
        : undefined,
    );
  const activeChoice = choice?.scope === productScope ? choice : undefined;
  const journey = activeChoice?.ready
    ? (
        [
          "ADVANCE_PAY_AT_COUNTER",
          "ADVANCE_PAY_NOW",
          "IMMEDIATE_PAY_AT_COUNTER",
        ] as const
      ).find((method) =>
        isEligibleForJourney(store, method, selection, activeChoice.selections),
      )
    : undefined;
  const continueSelection = () => {
    if (!store || !journey || !activeChoice?.ready || navigationPending.current)
      return;
    navigationPending.current = true;
    setBusy(true);
    const requestKey =
      globalThis.crypto?.randomUUID?.() ??
      "ful_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2);
    try {
      router.push({
        pathname: "/business/fulfillment",
        params: {
          org,
          subscription,
          view: "review",
          benefits: params.benefits ?? "",
          offers: params.offers ?? "",
          labels: params.labels ?? "",
          store: store.id,
          journey,
          products: JSON.stringify(activeChoice.selections),
          requestKey,
          storeAddresses: params.storeAddresses ?? "",
          storeImage: params.storeImage ?? "",
          artwork: params.artwork ?? "",
          preparedQrId: params.preparedQrId ?? "",
        },
      });
    } catch (error) {
      navigationPending.current = false;
      setBusy(false);
      setFailure(
        error instanceof Error ? error.message : "Could not open order review.",
      );
    }
  };

  return (
    <FulfillmentPage
      title="Select Store & Products"
      onBack={() => {
        if (!busy) onBack();
      }}
      onExit={onExit}
      exitDisabled={busy}
      footer={
        stores?.length ? (
          <Button
            fullWidth
            disabled={busy || !journey || !activeChoice?.ready}
            label={busy ? "Please wait…" : "Review Order"}
            onPress={continueSelection}
          />
        ) : undefined
      }
    >
      <FulfillmentColumns
        main={
          <>
            {items.length ? (
              <Card padding="md" style={{ gap: 6 }}>
                <Text variant="bodyStrong">Selected benefits & offers</Text>
                {items.map(({ itemType, itemId, label }) => (
                  <Text key={`${itemType}:${itemId}`} variant="bodySmall">
                    {label}
                  </Text>
                ))}
              </Card>
            ) : null}
            {pendingPayment ? (
              <Card padding="md" style={{ gap: 8 }}>
                <Text variant="bodyStrong">
                  {pendingPayment.customerLabel} payment needs attention
                </Text>
                <Button
                  variant="outline"
                  label={
                    pendingPayment.status === "PENDING"
                      ? "Resume payment"
                      : "Check payment"
                  }
                  onPress={() =>
                    router.push(
                      routeFor(
                        org,
                        pendingPayment.subscriptionId,
                        "payment",
                        pendingPayment.paymentIntentId,
                      ),
                    )
                  }
                />
              </Card>
            ) : null}
            <Text variant="bodyStrong">Select Store</Text>
            {existingQr ? (
              <Card padding="md" style={{ gap: 8, alignItems: "flex-start" }}>
                <Text variant="bodyStrong">
                  Redemption in progress — {existingQr.transactionNumber}
                </Text>
                <Button
                  label="View Existing QR"
                  variant="outline"
                  onPress={() =>
                    router.push(
                      routeFor(
                        org,
                        subscription,
                        "qr",
                        existingQr.transactionId,
                      ),
                    )
                  }
                />
              </Card>
            ) : null}
            {failure ? (
              <Text variant="bodySmall" color="danger">
                {failure}
              </Text>
            ) : null}
            {!stores && !failure ? (
              <Text variant="bodySmall">Checking Store availability…</Text>
            ) : null}
            {failure && !stores && items.length ? (
              <Button
                variant="outline"
                label="Retry Store availability"
                onPress={() => setReload((value) => value + 1)}
              />
            ) : null}
            {stores?.length === 0 ? (
              <>
                <Text variant="bodySmall">
                  {storeConflictMessage(
                    items.map((item) => [
                      `${item.itemType}:${item.itemId}`,
                      item.label,
                    ]),
                    {},
                  )}
                </Text>
                <Button
                  variant="outline"
                  label="Change selections"
                  onPress={onBack}
                />
              </>
            ) : null}
            {stores &&
              storeOptions(stores, parseRecord(params.storeNames)).map(
                (entry) => (
                  <FulfillmentChoice
                    key={entry.id}
                    label={entry.name}
                    selected={entry.id === store?.id}
                    disabled={busy || !entry.eligible}
                    image={params.storeImage}
                    icon="storefront-outline"
                    reason={
                      entry.eligible
                        ? addresses[entry.id] ||
                          "Eligible for all selected items"
                        : "Unavailable for this selection"
                    }
                    onPress={() => {
                      if (!entry.eligible || entry.id === store?.id) return;
                      setChoice(undefined);
                      router.setParams({
                        store: entry.id,
                        journey: "",
                        products: "",
                      });
                    }}
                  />
                ),
              )}
          </>
        }
        side={
          store ? (
            <Card padding="md">
              <RedemptionProductPicker
                key={productScope}
                subscriptionId={subscription}
                items={items}
                showStoreAvailability={false}
                initialSelections={parseRecord(params.products)}
                loadChoices={async (item) =>
                  productOptions?.[item.itemType + ":" + item.itemId] ?? []
                }
                onChange={(next) => {
                  setChoice({ ...next, scope: productScope });
                  if (next.ready) {
                    const products = JSON.stringify(next.selections);
                    if (products !== params.products)
                      router.setParams({ products, store: store.id });
                  }
                }}
                renderChoice={(label, selected, onPress, item) => (
                  <FulfillmentChoice
                    label={label}
                    image={artwork[`${item.itemType}:${item.itemId}`]}
                    icon="cube-outline"
                    selected={selected}
                    disabled={busy}
                    onPress={onPress}
                  />
                )}
              />
              {activeChoice?.ready && !journey ? (
                <Text variant="bodySmall" color="danger">
                  No redemption method supports these products together. Please
                  change your selection.
                </Text>
              ) : null}
            </Card>
          ) : null
        }
      />
    </FulfillmentPage>
  );
}

function CounterQr({
  org,
  subscription,
  id,
  onBack,
}: {
  org: string;
  subscription: string;
  id: string;
  onBack: () => void;
}) {
  const focused = useIsFocused();
  const foreground = useForeground();
  const [status, setStatus] = useState<CustomerRedemptionTransactionStatus>();
  const [qr, setQr] = useState<RedemptionTransactionQr>();

  const [redemptionCode, setRedemptionCode] = useState<{
    code: string;
    expiresAt: string;
  }>();

  const [redemptionCodeError, setRedemptionCodeError] = useState<string>();
  const [summary, setSummary] = useState<CounterQrSummary>();
  const [failure, setFailure] = useState<string>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    void api
      .counterQrSummary(
        org,
        { subscriptionId: subscription, benefitIds: [], offerIds: [] },
        { transactionId: id },
      )
      .then((result) => {
        if (live && result.success) setSummary(result.data.redemption);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
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
        if (current.status !== "PENDING") {
          setQr(undefined);
          setRedemptionCode(undefined);
          return;
        }
        if (!issued) {
          const credential = await read(
            api.issueRedemptionTransactionQr(org, id),
          );
          if (!live) return;
          setQr(credential);
          setRedemptionCode(undefined);
          setRedemptionCodeError(undefined);

          // The six-digit code refers to the same pending redemption transaction.
          try {
            const sixDigit = await read(
              api.issueRedemptionTransactionCode(org, id),
            );

            if (live) {
              setRedemptionCode(sixDigit);
            }
          } catch {
            if (live) {
              setRedemptionCodeError(
                "Could not generate six-digit code. Refresh QR and code.",
              );
            }
          }

          issued = true;
        }
        timer = setTimeout(() => void refresh(), 4000);
      } catch {
        if (live) {
          setFailure("Could not refresh the redemption QR.");
          setQr(undefined);
        }
      }
    };
    void refresh();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [focused, foreground, org, id, retry]);
  const title =
    status?.status === "SUCCESS" ? "Redemption completed" : "Counter QR";
  return (
    <FulfillmentPage title={title} onBack={onBack}>
      <FulfillmentColumns
        main={
          <Card padding="lg" style={{ gap: 12 }}>
            <View style={{ gap: 12, alignItems: "center" }}>
              {failure ? (
                <>
                  <Text color="danger">{failure}</Text>
                  <Button
                    label="Retry"
                    onPress={() => setRetry((value) => value + 1)}
                  />
                </>
              ) : null}
              {status?.status === "SUCCESS" ? (
                <Text>Staff completed this redemption.</Text>
              ) : null}
              {status && !["PENDING", "SUCCESS"].includes(status.status) ? (
                <Text>
                  This QR is no longer usable. Return to Redeem to select your
                  items again.
                </Text>
              ) : null}
              {qr && status?.status === "PENDING" ? (
                <>
                  <Text variant="bodyStrong">
                    Show this code at the Counter
                  </Text>
                  <QrPlaceholder value={qr.qrReference} />

                  <Text variant="bodySmall">
                    {summary ? "" : `${qr.transactionNumber} · `}
                    QR expires {localTime(qr.expiresAt, summary?.timezone)}
                  </Text>

                  {redemptionCode &&
                  Date.parse(redemptionCode.expiresAt) > Date.now() ? (
                    <>
                      <Text variant="bodyStrong">
                        OR ENTER SIX-DIGIT CODE AT COUNTER
                      </Text>

                      <Text
                        variant="h2"
                        accessibilityLabel={`Redemption code ${redemptionCode.code}`}
                      >
                        {redemptionCode.code.slice(0, 3)}{" "}
                        {redemptionCode.code.slice(3)}
                      </Text>

                      <Text variant="caption" color="textMuted">
                        Code expires{" "}
                        {localTime(redemptionCode.expiresAt, summary?.timezone)}
                      </Text>
                    </>
                  ) : null}

                  {redemptionCodeError ? (
                    <Text color="danger">{redemptionCodeError}</Text>
                  ) : null}

                  <Button
                    variant="ghost"
                    size="sm"
                    label="Refresh QR and 6-digit Code"
                    onPress={() => setRetry((value) => value + 1)}
                  />
                </>
              ) : !status && !failure ? (
                <Text>Loading redemption…</Text>
              ) : null}
            </View>
          </Card>
        }
        side={
          summary ? (
            <Card padding="md" style={{ gap: 10 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <FulfillmentThumbnail icon="storefront-outline" size={36} />
                <View style={{ flex: 1 }}>
                  {summary.storeName ? (
                    <Text variant="bodyStrong">{summary.storeName}</Text>
                  ) : null}
                  <Text variant="caption" color="textMuted">
                    {summary.transactionNumber}
                  </Text>
                </View>
              </View>
              {summary.items.map((entry) => (
                <View
                  key={entry.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <FulfillmentThumbnail icon="cube-outline" size={36} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">
                      {entry.productName
                        ? `${entry.quantity} × ${entry.productName}`
                        : (entry.name ??
                          (entry.type === "BENEFIT" ? "Benefit" : "Offer"))}
                    </Text>
                    {entry.productName && entry.name ? (
                      <Text variant="caption" color="textMuted">
                        {entry.name}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
          ) : null
        }
      />
    </FulfillmentPage>
  );
}

function FulfillmentRecord({
  org,
  subscription,
  view,
  id,
  confirmed,
  counterConflict,
  onBack,
}: {
  org: string;
  subscription: string;
  view: string;
  id: string;
  confirmed: boolean;
  counterConflict: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const focused = useIsFocused();
  const foreground = useForeground();
  const { session } = useAuth();
  const [record, setRecord] = useState<CustomerFulfillment>();
  const [payment, setPayment] = useState<CustomerFulfillmentPayment>();
  const [failure, setFailure] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const open = useCallback(
    (item: CustomerFulfillment, justConfirmed = false) => {
      const route = routeFor(org, subscription, "details", item.id);
      router.replace(
        justConfirmed
          ? { ...route, params: { ...route.params, confirmed: "1" } }
          : route,
      );
    },
    [org, router, subscription],
  );
  const confirm = useCallback(
    (item: CustomerFulfillment) =>
      router.replace(routeFor(org, subscription, "confirmation", item.id)),
    [org, router, subscription],
  );
  useEffect(() => {
    if (!focused || !foreground || !session?.userId) return;
    let live = true;
    setFailure(undefined);
    if (view === "payment") {
      void read(api.reconcileFulfillmentPayment(org, id))
        .then((result) => {
          if (!live) return;
          if (
            result.fulfillment &&
            result.payment?.paymentIntentId === id &&
            result.payment.status === "SUCCEEDED"
          )
            confirm(result.fulfillment);
          else if (result.payment) setPayment(result.payment);
          else setFailure("Payment is unavailable.");
        })
        .catch((error: unknown) => {
          if (live)
            setFailure(
              error instanceof Error
                ? error.message
                : "Payment is unavailable.",
            );
        });
    } else {
      const readRecord = async () => {
        try {
          const value = await read(api.fulfillment(org, id));
          if (!live) return;
          setRecord(value);
        } catch (error) {
          if (live)
            setFailure(
              error instanceof Error
                ? error.message
                : "This request is unavailable.",
            );
        }
      };
      void readRecord();
    }
    return () => {
      live = false;
    };
  }, [confirm, focused, foreground, id, org, retry, session?.userId, view]);

  if (payment && session?.userId && view === "payment") {
    return (
      <CustomerFulfillmentPaymentPage
        key={id + ":" + payment.status}
        initial={payment}
        counterConflict={counterConflict}
        onOpenCounterQr={(qr) =>
          router.push(
            routeFor(org, payment.subscriptionId, "qr", qr.transactionId),
          )
        }
        organizationId={org}
        customerUserId={session.userId}
        onClose={onBack}
        onState={() => undefined}
        onAccepted={(item, destination) =>
          destination === "details" ? open(item, true) : confirm(item)
        }
      />
    );
  }
  if (record && (view === "confirmation" || view === "details")) {
    return (
      <>
        <CustomerFulfillmentDetails
          initial={record}
          organizationId={org}
          focused={focused && !receipt}
          confirmation={confirmed || view === "confirmation"}
          justPlaced={view === "confirmation" || confirmed}
          onClose={onBack}
          onReceipt={async (receiptId) =>
            setReceipt(await read(api.receipt(org, receiptId)))
          }
          onChanged={() => undefined}
        />
        <TransactionReceiptViewer
          visible={!!receipt}
          receipt={receipt}
          onClose={() => setReceipt(null)}
        />
      </>
    );
  }
  return (
    <FulfillmentPage
      title={view === "payment" ? "Payment" : "Request details"}
      onBack={onBack}
    >
      {failure ? (
        <View style={{ gap: 12 }}>
          <Text color="danger">{failure}</Text>
          <Button
            label="Retry"
            onPress={() => setRetry((value) => value + 1)}
          />
        </View>
      ) : (
        <Text>Loading…</Text>
      )}
    </FulfillmentPage>
  );
}

function ReviewFulfillment({
  org,
  subscription,
  params,
  onBack,
  onExit,
}: BasketProps) {
  const router = useRouter();
  const { session } = useAuth();
  const request = useMemo<CustomerFulfillmentRequest | undefined>(() => {
    if (
      !params.store ||
      !params.requestKey ||
      !params.journey ||
      ![
        "ADVANCE_PAY_NOW",
        "ADVANCE_PAY_AT_COUNTER",
        "IMMEDIATE_PAY_AT_COUNTER",
      ].includes(params.journey)
    )
      return;
    return {
      selection: {
        subscriptionId: subscription,
        benefitIds: ids(params.benefits),
        offerIds: ids(params.offers),
      },
      journey: params.journey,
      storeId: params.store,
      productSelections: parseRecord(params.products),
      requestKey: params.requestKey,
      collectionLocalTime: params.collection || undefined,
    };
  }, [
    params.benefits,
    params.collection,
    params.journey,
    params.offers,
    params.products,
    params.requestKey,
    params.store,
    subscription,
  ]);
  const [reviewStore, setReviewStore] = useState<CustomerFulfillmentStore>();
  const [storesReady, setStoresReady] = useState(false);
  const [storeError, setStoreError] = useState<string>();
  const [counterBusy, setCounterBusy] = useState(false);
  const counterMutation = useRef(false);
  const [counterFailure, setCounterFailure] = useState<string>();
  const [counterConflict, setCounterConflict] = useState(false);
  useEffect(() => {
    if (!request) return;
    let live = true;
    setStoresReady(false);
    setReviewStore(undefined);
    setStoreError(undefined);
    void read(api.fulfillmentStores(org, request.selection))
      .then((stores) => {
        if (!live) return;
        setReviewStore(stores.find((s) => s.id === request.storeId));
        setStoresReady(true);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setStoreError(
          error instanceof Error
            ? error.message
            : "Store availability unavailable",
        );
        setStoresReady(true);
      });
    return () => {
      live = false;
    };
  }, [
    org,
    request?.selection.subscriptionId,
    params.benefits,
    params.offers,
    request?.storeId,
  ]);
  const eligibleForMethod = (method: CustomerFulfillmentJourney): boolean =>
    !!request &&
    isEligibleForJourney(
      reviewStore,
      method,
      request.selection,
      request.productSelections,
    );
  const switchMethod = (method: CustomerFulfillmentJourney) => {
    if (
      !eligibleForMethod(method) ||
      counterMutation.current ||
      method === request?.journey
    )
      return;
    setCounterFailure(undefined);
    const requestKey =
      globalThis.crypto?.randomUUID?.() ??
      "ful_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2);
    router.setParams({ journey: method, collection: "", requestKey });
  };
  const methodPicker = (
    advancedReview?: { quote: { totalMinor: number } },
    locked = false,
    runMethodChange?: (change: () => void) => void,
  ) => {
    if (!request || !reviewStore) return null;
    const total = advancedReview?.quote.totalMinor;
    const advance =
      request.journey !== "IMMEDIATE_PAY_AT_COUNTER" &&
      eligibleForMethod(request.journey)
        ? request.journey
        : (
            [
              "ADVANCE_PAY_AT_COUNTER",
              "ADVANCE_PAY_NOW",
            ] as CustomerFulfillmentJourney[]
          ).find(eligibleForMethod);
    const show =
      total === 0
        ? (["IMMEDIATE_PAY_AT_COUNTER", advance].filter(
            Boolean,
          ) as CustomerFulfillmentJourney[])
        : total !== undefined
          ? ([
              "IMMEDIATE_PAY_AT_COUNTER",
              "ADVANCE_PAY_AT_COUNTER",
              "ADVANCE_PAY_NOW",
            ] as CustomerFulfillmentJourney[])
          : (["IMMEDIATE_PAY_AT_COUNTER", advance].filter(
              Boolean,
            ) as CustomerFulfillmentJourney[]);
    const unique = [...new Set(show)].filter(eligibleForMethod);
    return (
      <Card padding="md" style={{ gap: 8 }}>
        <Text variant="bodyStrong">How would you like to redeem?</Text>
        {unique.map((method) => (
          <FulfillmentChoice
            key={method}
            label={
              method === "IMMEDIATE_PAY_AT_COUNTER"
                ? "Redeem at Store Counter"
                : total === 0
                  ? "Order Ahead"
                  : total === undefined
                    ? "Order Ahead — review payment options"
                    : method === "ADVANCE_PAY_NOW"
                      ? "Order Ahead — Pay Online"
                      : "Order Ahead — Pay at Counter"
            }
            reason={
              method === "IMMEDIATE_PAY_AT_COUNTER"
                ? "Show your QR to staff at the counter"
                : total === 0
                  ? "Place your order with no payment required"
                  : method === "ADVANCE_PAY_NOW"
                    ? "Pay online and collect later"
                    : "Pay when collecting"
            }
            selected={method === request.journey}
            icon={
              method === "IMMEDIATE_PAY_AT_COUNTER"
                ? "qr-code-outline"
                : method === "ADVANCE_PAY_NOW"
                  ? "card-outline"
                  : "bag-handle-outline"
            }
            disabled={locked || counterBusy}
            onPress={() => {
              if (
                method === request.journey ||
                locked ||
                counterMutation.current ||
                !eligibleForMethod(method)
              )
                return;
              if (runMethodChange) runMethodChange(() => switchMethod(method));
              else switchMethod(method);
            }}
          />
        ))}
      </Card>
    );
  };
  const createCounterQr = async () => {
    if (
      !request ||
      request.journey !== "IMMEDIATE_PAY_AT_COUNTER" ||
      !eligibleForMethod("IMMEDIATE_PAY_AT_COUNTER") ||
      counterMutation.current
    )
      return;
    counterMutation.current = true;
    setCounterBusy(true);
    setCounterFailure(undefined);
    setCounterConflict(false);
    try {
      if (params.preparedQrId) {
        const previous = await read(
          api.redemptionTransactionStatus(org, params.preparedQrId),
        );
        if (previous.status === "PENDING") {
          router.push(
            routeFor(org, subscription, "qr", previous.transactionId),
          );
          return;
        }
      }
      const latest = await read(api.fulfillmentStores(org, request.selection));
      const latestStore = latest.find((entry) => entry.id === request.storeId);
      if (
        !isEligibleForJourney(
          latestStore,
          request.journey,
          request.selection,
          request.productSelections,
        )
      ) {
        throw new Error(
          "This store or product is no longer eligible. Please select again.",
        );
      }
      const created = await read(api.createStoreRedemption(org, request));
      router.setParams({ preparedQrId: created.transactionId });
      router.push(routeFor(org, subscription, "qr", created.transactionId));
    } catch (error) {
      if (isCounterQrConflict(error)) setCounterConflict(true);
      else
        setCounterFailure(
          error instanceof Error
            ? error.message
            : "Could not create Counter redemption.",
        );
    } finally {
      counterMutation.current = false;
      setCounterBusy(false);
    }
  };
  if (!request)
    return (
      <FulfillmentPage title="Review" onBack={onBack}>
        <Text>Return to Redeem and select your items again.</Text>
      </FulfillmentPage>
    );
  if (!storesReady)
    return (
      <FulfillmentPage title="Order Review" onBack={onBack}>
        <Text>Checking Store availability…</Text>
      </FulfillmentPage>
    );
  if (!reviewStore || storeError || !eligibleForMethod(request.journey))
    return (
      <FulfillmentPage title="Order Review" onBack={onBack}>
        <Text color="danger">
          {storeError ??
            "This redemption method is no longer available for the selected products."}
        </Text>
        {!storeError && reviewStore ? methodPicker() : null}
        <Button label="Change selections" onPress={onBack} />
      </FulfillmentPage>
    );
  if (request.journey === "IMMEDIATE_PAY_AT_COUNTER") {
    const address = parseRecord(params.storeAddresses)[request.storeId];
    const products = Object.entries(request.productSelections).map(
      ([itemKey, productId]) => {
        const product = reviewStore.products[itemKey]?.find(
          (p) => p.productId === productId,
        );
        return {
          key: itemKey,
          name: product?.productName ?? "Selected product",
          benefit: parseRecord(params.labels)[itemKey],
        };
      },
    );
    return (
      <FulfillmentPage
        title="Order Review"
        onBack={() => {
          if (!counterMutation.current) onBack();
        }}
        onExit={() => {
          if (!counterMutation.current) onExit();
        }}
        exitDisabled={counterBusy}
        footer={
          <Button
            fullWidth
            disabled={
              counterBusy || !eligibleForMethod("IMMEDIATE_PAY_AT_COUNTER")
            }
            label={counterBusy ? "Please wait…" : "Generate Counter QR"}
            onPress={() => void createCounterQr()}
          />
        }
      >
        <FulfillmentColumns
          main={
            <>
              <Card padding="md" style={{ gap: 8 }}>
                <Text variant="bodyStrong">{reviewStore.name}</Text>
                {address ? <Text variant="bodySmall">{address}</Text> : null}
              </Card>
              <Card padding="md" style={{ gap: 8 }}>
                <Text variant="bodyStrong">Selected items</Text>
                {products.map((p) => (
                  <View key={p.key} style={{ gap: 3 }}>
                    <Text variant="bodyStrong">{p.name}</Text>
                    {p.benefit ? (
                      <Text variant="caption" color="textMuted">
                        {p.benefit}
                      </Text>
                    ) : null}
                  </View>
                ))}
                <Text variant="bodySmall" color="textMuted">
                  Your total will be confirmed at the store counter.
                </Text>
              </Card>
            </>
          }
          side={
            <>
              {methodPicker()}
              {counterConflict ? (
                <CounterQrConflict
                  organizationId={org}
                  selection={request.selection}
                  onOpen={(qr) =>
                    router.push(
                      routeFor(org, subscription, "qr", qr.transactionId),
                    )
                  }
                />
              ) : null}
              {counterFailure ? (
                <Text variant="bodySmall" color="danger">
                  {counterFailure}
                </Text>
              ) : null}
            </>
          }
        />
      </FulfillmentPage>
    );
  }
  return (
    <CustomerFulfillmentReviewPage
      key={fulfillmentReviewScope(org, request)}
      organizationId={org}
      request={request}
      itemLabels={parseRecord(params.labels)}
      artwork={parseRecord(params.artwork)}
      storeAddress={parseRecord(params.storeAddresses)[request.storeId]}
      storeImage={params.storeImage}
      renderRedemptionMethods={methodPicker}
      onOpenCounterQr={(qr) =>
        router.push(routeFor(org, subscription, "qr", qr.transactionId))
      }
      onClose={onBack}
      onExit={onExit}
      requestKeyFor={() => request.requestKey ?? ""}
      onQuotedTime={(time) => {
        if ((params.collection || undefined) !== time)
          router.setParams({ collection: time ?? "" });
      }}
      onAccepted={(record) =>
        router.replace(routeFor(org, subscription, "confirmation", record.id))
      }
      onPayment={async (payment) => {
        const recovery = routeFor(
          org,
          payment.subscriptionId,
          "payment",
          payment.paymentIntentId,
        );
        if (payment.status === "PENDING" && session?.userId) {
          try {
            const returned = await openFulfillmentCollect(
              org,
              session.userId,
              payment,
            );
            if (!returned) return; // The current browser tab is navigating to secure checkout.
            const result = await read(
              api.reconcileFulfillmentPayment(org, payment.paymentIntentId),
            );
            const route =
              verifiedFulfillmentDestination(
                result,
                org,
                payment.paymentIntentId,
                returned.view,
                true,
              ) ?? recovery;
            router.replace(
              returned.counterConflict && route.params.view === "payment"
                ? {
                    ...route,
                    params: { ...route.params, counterConflict: "1" },
                  }
                : route,
            );
            return;
          } catch {
            // Resume the exact durable intent if the browser or status request did not complete.
          }
        }
        router.replace(recovery);
      }}
    />
  );
}

export default function CustomerFulfillmentRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const { session, loading } = useAuth();
  const { org, subscription, view = "selection", id } = params;
  const exitToBusiness = () => {
    if (subscription)
      router.dismissTo({
        pathname: "/business/[subscriptionId]",
        params: { subscriptionId: subscription },
      });
    else router.replace("/customer/cards");
  };
  const onBack = () => {
    if (router.canGoBack()) router.back();
    else if (subscription)
      router.replace({
        pathname: "/business/[subscriptionId]",
        params: { subscriptionId: subscription },
      });
    else router.replace("/customer/cards");
  };
  if (loading) return null;
  if (
    !session?.userId &&
    typeof org === "string" &&
    typeof subscription === "string" &&
    typeof id === "string" &&
    (view === "details" || view === "confirmation" || view === "payment")
  ) {
    const query = new URLSearchParams({ org, subscription, view, id });
    if (params.confirmed === "1") query.set("confirmed", "1");
    if (params.counterConflict === "1") query.set("counterConflict", "1");
    return (
      <Redirect
        href={{
          pathname: "/customer-login",
          params: { returnTo: `/business/fulfillment?${query}` },
        }}
      />
    );
  }
  if (!session?.userId || !org || !subscription) {
    return (
      <FulfillmentPage title="Redemption" onBack={onBack}>
        <Text>Open a membership to continue.</Text>
      </FulfillmentPage>
    );
  }
  return (
    <BusinessPreviewScope key={session.userId} organizationId={org}>
      {view === "selection" ? (
        <SelectFulfillment
          key={JSON.stringify([
            org,
            subscription,
            params.benefits,
            params.offers,
          ])}
          org={org}
          subscription={subscription}
          params={params}
          onBack={onBack}
          onExit={exitToBusiness}
        />
      ) : view === "review" ? (
        <ReviewFulfillment
          org={org}
          subscription={subscription}
          params={params}
          onBack={onBack}
          onExit={exitToBusiness}
        />
      ) : view === "qr" && id ? (
        <CounterQr
          key={id}
          org={org}
          subscription={subscription}
          id={id}
          onBack={onBack}
        />
      ) : id && ["payment", "confirmation", "details"].includes(view) ? (
        <FulfillmentRecord
          key={JSON.stringify([org, subscription, view, id])}
          org={org}
          subscription={subscription}
          view={view}
          id={id}
          confirmed={params.confirmed === "1"}
          counterConflict={params.counterConflict === "1"}
          onBack={
            view === "confirmation" || params.confirmed === "1"
              ? exitToBusiness
              : onBack
          }
        />
      ) : (
        <FulfillmentPage title="Redemption" onBack={onBack}>
          <Text>This request is unavailable.</Text>
        </FulfillmentPage>
      )}
    </BusinessPreviewScope>
  );
}
