import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  Image,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { formatTransactionMoney } from "@/src/core/domain/savings-display";
import {
  CustomerDataApi,
  type CounterQrSummary,
  type CustomerFulfillment,
  type CustomerFulfillmentPayment,
  type CustomerFulfillmentRequest,
  type CustomerFulfillmentReview,
  type CustomerFulfillmentSelection,
  type TransactionReceipt,
} from "@/src/data/api/customer-data-api";
import { resolveAssetUrl } from "@/src/data/api/asset-url";
import {
  beginNativeCollectReturn,
  fulfillmentCollectReturnKey,
  type FulfillmentCollectReturn,
} from "@/src/core/services/native-collect-return";
import { storage } from "@/src/utils/storage";
import type { ApiResult } from "@/src/data/api/result";
import { Badge, Button, Card, Input, Modal, Text } from "@/src/ui";
import { useAuth, useTheme } from "@/src/providers";
import { fulfillmentPickupCache } from "@/src/core/services/fulfillment-pickup-cache";
import { QrPlaceholder } from "./QrPlaceholder";
import {
  fulfillmentContentWidth,
  fulfillmentPageGutter,
  isWideFulfillmentLayout,
  receiptLineKey,
  receiptLineSubtotals,
} from "./fulfillment-presentation";

const api = new CustomerDataApi();
const statusLabels: Record<CustomerFulfillment["status"], string> = {
  PLACED: "Placed",
  PREPARING: "Preparing",
  READY: "Ready for pickup",
  FULFILLED: "Fulfilled",
  CANCEL_REQUESTED: "Cancellation requested",
  CANCELLED: "Cancelled",
};
const paymentLabels: Record<string, string> = {
  NO_PAYMENT_REQUIRED: "No payment required",
  PAID: "Paid",
  PAYMENT_RECEIVED: "Payment received",
  UNPAID: "Due at pickup",
  PAYMENT_PENDING: "Payment pending",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_CANCELLED: "Payment cancelled",
  PAYMENT_UNCONFIRMED: "Payment unconfirmed",
};
const timelineLabels: Record<string, string> = {
  ACCEPTED: "Placed",
  PREPARATION_STARTED: "Preparation started",
  MARKED_READY: "Ready for pickup",
  HANDOVER_CONFIRMED: "Handover confirmed",
  COMPLETION_TIME_REVISED: "Completion estimate updated",
  COLLECTION_CHANGE_REQUESTED: "Collection change requested",
  COLLECTION_CHANGE_APPROVED: "Collection change approved",
  COLLECTION_CHANGE_REJECTED: "Collection change declined",
  STAFF_COLLECTION_EXTENDED: "Collection time extended by Store",
  CANCELLATION_REQUESTED: "Cancellation requested",
  CANCELLED: "Cancelled",
  DELAY_RECORDED: "Delay recorded",
  NO_SHOW_RECORDED: "No-show recorded",
};
const refundLabels: Record<string, string> = {
  SUCCEEDED: "Refunded",
  PENDING: "Refund pending",
  READY: "Refund pending",
  FAILED: "Refund failed",
  UNKNOWN_REQUIRES_RECONCILIATION: "Refund under review",
  UNSUPPORTED_REQUIRES_MANUAL: "Refund under review",
};

export function fulfillmentIsTerminal(status: CustomerFulfillment["status"]) {
  return status === "CANCELLED" || status === "FULFILLED";
}

export function localTime(value?: string | null, timezone?: string | null) {
  if (!value) return undefined;
  let timestamp = value.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(timestamp)) timestamp += ":00";
  else if (/[+-]\d{4}$/.test(timestamp))
    timestamp = timestamp.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  else if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) timestamp += "Z";
  const time = new Date(timestamp);
  if (!Number.isFinite(time.getTime())) return undefined;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone ?? undefined,
    }).format(time);
  } catch {
    return value;
  }
}

export async function read<T>(response: Promise<ApiResult<T>>): Promise<T> {
  const result = await response;
  if (!result.success)
    throw Object.assign(new Error(result.error.message), {
      code: result.error.code,
    });
  return result.data;
}

export function isCounterQrConflict(error: unknown) {
  return (
    error instanceof Error &&
    (("code" in error && error.code === "ACTIVE_COUNTER_REDEMPTION") ||
      error.message ===
        "Finish the existing Counter redemption or wait for the QR to expire")
  );
}

export function CounterQrConflict({
  organizationId,
  selection,
  paymentIntentId,
  optional,
  onOpen,
}: {
  organizationId: string;
  selection: CustomerFulfillmentSelection;
  paymentIntentId?: string;
  optional?: boolean;
  onOpen: (qr: CounterQrSummary) => void;
}) {
  const [qr, setQr] = useState<CounterQrSummary>();
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    let live = true;
    setQr(undefined);
    void api
      .counterQrSummary(organizationId, selection, { paymentIntentId })
      .then((result) => {
        if (live && result.success) setQr(result.data.redemption);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [focused, organizationId, paymentIntentId, selection]);
  if (!qr && optional) return null;
  return (
    <Card padding="md" style={{ gap: 8 }}>
      <Text variant="bodyStrong">
        A Counter redemption is already in progress
      </Text>
      <Text variant="bodySmall" color="textMuted">
        {qr
          ? `${qr.transactionNumber}${qr.storeName ? ` · ${qr.storeName}` : ""}. Finish it at the counter or wait for the QR to expire.`
          : "Finish your existing Counter redemption before trying again. If your QR has expired and the checkout is still open, contact the Store."}
      </Text>
      {qr ? (
        <Button
          label="Open existing Counter QR"
          variant="outline"
          onPress={() => onOpen(qr)}
        />
      ) : null}
    </Card>
  );
}

type FulfillmentIcon = keyof typeof Ionicons.glyphMap;

export function FulfillmentThumbnail({
  image,
  icon,
  size = 44,
}: {
  image?: string;
  icon: FulfillmentIcon;
  size?: number;
}) {
  const theme = useTheme();
  const uri = resolveAssetUrl(image);
  const [failedUri, setFailedUri] = useState<string>();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.md,
        overflow: "hidden",
        backgroundColor: theme.colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri && uri !== failedUri ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          onError={() => setFailedUri(uri)}
          style={{ width: "100%", height: "100%" }}
          accessible={false}
        />
      ) : (
        <Ionicons name={icon} size={21} color={theme.colors.primary} />
      )}
    </View>
  );
}

export async function openFulfillmentCollect(
  organizationId: string,
  customerUserId: string,
  payment: CustomerFulfillmentPayment,
) {
  const result = await read(
    api.createCollectBrowserCheckout(organizationId, payment.paymentIntentId),
  );
  const pointer: FulfillmentCollectReturn = {
    customerUserId,
    organizationId,
    subscriptionId: payment.subscriptionId,
    paymentIntentId: payment.paymentIntentId,
  };
  if (
    !(await storage.setItem(
      fulfillmentCollectReturnKey(customerUserId),
      pointer,
    ))
  ) {
    throw new Error(
      "Could not save payment recovery. Return to the order and resume payment.",
    );
  }
  const url = new URL(result.checkoutUrl);
  url.searchParams.set(
    "fulfillmentReturn",
    Platform.OS === "web" ? "web" : "native",
  );
  if (Platform.OS === "web") {
    window.location.replace(url.toString());
    return undefined;
  }
  const end = beginNativeCollectReturn(`fulfillment:${customerUserId}`);
  try {
    const returned = await WebBrowser.openAuthSessionAsync(
      url.toString(),
      "memgine://payment-return",
    );
    const params =
      returned.type === "success"
        ? new URL(returned.url).searchParams
        : undefined;
    if (params?.get("cancelPayment") === "1")
      await api.cancelPayment(organizationId, payment.paymentIntentId);
    return {
      view:
        params?.get("view") === "details"
          ? ("details" as const)
          : ("confirmation" as const),
      counterConflict: params?.get("counterConflict") === "1",
    };
  } finally {
    end();
  }
}

export function FulfillmentPage({
  title,
  onBack,
  children,
  footer,
  onExit,
  exitDisabled,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
  onExit?: () => void;
  exitDisabled?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panel = {
    width: "100%" as const,
    maxWidth: fulfillmentContentWidth,
    alignSelf: "center" as const,
    paddingHorizontal: fulfillmentPageGutter(width),
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surfaceAlt }}>
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: theme.colors.surface,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <View
          style={{
            ...panel,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={{
              minHeight: 44,
              minWidth: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="title">{title}</Text>
          </View>
          {onExit ? (
            <Button
              label="Exit"
              variant="ghost"
              disabled={exitDisabled}
              onPress={onExit}
            />
          ) : null}
        </View>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          ...panel,
          paddingTop: 20,
          paddingBottom: footer ? 24 : Math.max(24, insets.bottom + 12),
        }}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <View
            style={{
              ...panel,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 12),
            }}
          >
            <View
              style={
                isWideFulfillmentLayout(width)
                  ? { alignSelf: "flex-end", width: 360 }
                  : undefined
              }
            >
              {footer}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function FulfillmentColumns({
  main,
  side,
}: {
  main: ReactNode;
  side?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const wide = !!side && isWideFulfillmentLayout(width);
  return (
    <View
      style={{
        flexDirection: wide ? "row" : "column",
        alignItems: wide ? "flex-start" : "stretch",
        gap: 16,
      }}
    >
      <View style={{ minWidth: 0, flex: wide ? 1.2 : undefined, gap: 12 }}>
        {main}
      </View>
      {side ? (
        <View style={{ minWidth: 0, flex: wide ? 1 : undefined, gap: 12 }}>
          {side}
        </View>
      ) : null}
    </View>
  );
}

export function FulfillmentChoice({
  label,
  selected,
  disabled,
  reason,
  image,
  icon,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  reason?: string;
  image?: string;
  icon?: FulfillmentIcon;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        borderRadius: theme.radius.md,
        borderWidth: selected && !disabled ? 2 : 1,
        borderColor:
          selected && !disabled ? theme.colors.primary : theme.colors.border,
        backgroundColor:
          selected && !disabled
            ? theme.colors.primarySoft
            : theme.colors.surface,
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        gap: 10,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={20}
        color={
          selected && !disabled ? theme.colors.primary : theme.colors.textMuted
        }
      />
      {icon ? (
        <FulfillmentThumbnail image={image} icon={icon} size={38} />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {reason ? (
          <Text variant="caption" color="textMuted">
            {reason}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function CustomerFulfillmentSummary({
  item,
  onOpen,
  showItems,
  showReference = true,
}: {
  item: CustomerFulfillment;
  onOpen?: () => void;
  showItems?: boolean;
  showReference?: boolean;
}) {
  const collection = localTime(item.expectedCollectionAt, item.timezone);
  const amount = formatTransactionMoney(item.totalMinor, item.currencyCode);
  return (
    <View style={{ gap: 6 }}>
      {showReference ? (
        <Text variant="bodyStrong">
          {item.customerLabel} {item.referenceNumber}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <FulfillmentThumbnail icon="storefront-outline" size={36} />
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="textMuted">
            Pickup at
          </Text>
          <Text variant="bodyStrong">{item.storeName}</Text>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Badge
          label={statusLabels[item.status]}
          tone={item.status === "READY" ? "success" : "neutral"}
        />
        <Text variant="bodySmall">
          {paymentLabels[item.paymentState] ?? "Payment unconfirmed"}
          {amount ? ` · ${amount}` : ""}
        </Text>
      </View>
      {!fulfillmentIsTerminal(item.status) && collection ? (
        <Text variant="bodySmall">
          Expected pickup {collection}
          {item.collectionWindowEndsAt
            ? ` – ${localTime(item.collectionWindowEndsAt, item.timezone)}`
            : ""}
        </Text>
      ) : null}
      {showItems
        ? item.lines?.map((line) => (
            <Text key={line.id} variant="bodySmall">
              {line.quantity} × {line.name}
            </Text>
          ))
        : null}
      {onOpen ? (
        <Button
          size="sm"
          variant="outline"
          label={`View ${item.customerLabel} Details`}
          onPress={onOpen}
        />
      ) : null}
    </View>
  );
}

export function FulfillmentProgress({
  item,
  confirmation = false,
}: {
  item: CustomerFulfillment;
  confirmation?: boolean;
}) {
  const theme = useTheme();
  const ready = item.status === "READY";
  const terminal =
    fulfillmentIsTerminal(item.status) || item.status === "CANCEL_REQUESTED";
  const stages: CustomerFulfillment["status"][] =
    item.workflow === "DETAILED"
      ? ["PLACED", "PREPARING", "READY", "FULFILLED"]
      : item.workflow === "SIMPLE"
        ? ["PLACED", "READY", "FULFILLED"]
        : [];
  const step = stages.indexOf(item.status);
  const reached = (stage: CustomerFulfillment["status"]) =>
    stage === "PLACED" ||
    item.status === stage ||
    item.timeline?.some(
      ({ type }) =>
        (stage === "PREPARING" && type === "PREPARATION_STARTED") ||
        (stage === "READY" && type === "MARKED_READY"),
    );
  const title =
    confirmation && item.status === "PLACED"
      ? `${item.customerLabel} placed`
      : ready
        ? "Ready for collection"
        : statusLabels[item.status];
  const message = ready
    ? `Collect at ${item.storeName}.`
    : item.status === "PREPARING"
      ? `The Store is preparing your ${item.customerLabel.toLowerCase()}.`
      : item.status === "PLACED"
        ? `${item.storeName} has received your ${item.customerLabel.toLowerCase()}.`
        : undefined;
  return (
    <Card padding="md" style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons
          name="receipt-outline"
          size={17}
          color={theme.colors.primary}
        />
        <Text variant="bodyStrong" color="primary">
          {item.customerLabel} {item.referenceNumber}
        </Text>
      </View>
      <View
        style={{
          padding: 14,
          gap: 6,
          alignItems: "center",
          borderRadius: theme.radius.md,
          backgroundColor: ready
            ? theme.colors.successSoft
            : theme.colors.primarySoft,
        }}
      >
        <Ionicons
          name={
            ready
              ? "bag-check-outline"
              : item.status === "PREPARING"
                ? "time-outline"
                : terminal && item.status !== "FULFILLED"
                  ? "information-circle-outline"
                  : "checkmark-circle"
          }
          size={31}
          color={ready ? theme.colors.success : theme.colors.primary}
        />
        <Text variant="h2" style={{ textAlign: "center" }}>
          {title}
        </Text>
        {message ? (
          <Text variant="bodySmall" style={{ textAlign: "center" }}>
            {message}
          </Text>
        ) : null}
      </View>
      {step >= 0 ? (
        <View
          accessibilityLabel={`Progress: ${statusLabels[item.status]}`}
          style={{ flexDirection: "row" }}
        >
          {stages.map((stage) => (
            <View key={stage} style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <Ionicons
                name={reached(stage) ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={
                  reached(stage) ? theme.colors.primary : theme.colors.textMuted
                }
              />
              <Text
                variant="caption"
                color={reached(stage) ? "primary" : "textMuted"}
                style={{ textAlign: "center" }}
              >
                {stage === "FULFILLED"
                  ? "Collected"
                  : stage === "READY"
                    ? "Ready"
                    : statusLabels[stage]}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export function FulfillmentPickupCard({
  organizationId,
  item,
  active,
}: {
  organizationId: string;
  item: CustomerFulfillment;
  active: boolean;
}) {
  const { session } = useAuth();
  const scope = JSON.stringify([session?.userId, session?.expiresAt, organizationId, item.id]);
  const visible = !!session?.userId && !!item.canShowPickup && ['PLACED', 'PREPARING', 'READY'].includes(item.status);
  const [credential, setCredential] = useState<{
    reference: string;
    expiresAt: string;
  }>();
  const [pickupCode, setPickupCode] = useState<{
    code: string;
    expiresAt: string;
  }>();
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const live = useRef(false);
  const currentScope = useRef(scope);
  const previousSession = useRef(session?.userId);
  const previousScope = useRef(scope);
  const inFlight = useRef(false);
  currentScope.current = scope;
  const allowed = visible;
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  useEffect(() => {
    if (previousSession.current && previousSession.current !== session?.userId) {
      fulfillmentPickupCache.invalidate(previousScope.current);
    }
    previousSession.current = session?.userId;
    previousScope.current = scope;
  }, [session?.userId, scope]);
  useEffect(() => {
    if (!allowed) {
      fulfillmentPickupCache.invalidate(scope);
      setCredential(undefined);
      setPickupCode(undefined);
      return;
    }
    setCredential(fulfillmentPickupCache.get<{ reference: string; expiresAt: string }>(scope, 'qr'));
    setPickupCode(fulfillmentPickupCache.get<{ code: string; expiresAt: string }>(scope, 'code'));
    setFailure(undefined);
    setCodeError(undefined);
  }, [scope, allowed, active]);
  useEffect(() => fulfillmentPickupCache.subscribe(scope, () => {
    if (!allowed) return;
    setCredential(fulfillmentPickupCache.get<{ reference: string; expiresAt: string }>(scope, 'qr'));
    setPickupCode(fulfillmentPickupCache.get<{ code: string; expiresAt: string }>(scope, 'code'));
  }), [scope, allowed]);
  const generate = async (kind: 'qr' | 'code', refresh: boolean) => {
    if (!allowed || !active || inFlight.current) return;
    inFlight.current = true;
    const requestScope = scope;
    if (kind === 'qr') { setBusy(true); setFailure(undefined); if (refresh) setCredential(undefined); }
    else { setCodeBusy(true); setCodeError(undefined); if (refresh) setPickupCode(undefined); }
    try {
      if (kind === 'qr') {
        const result = await fulfillmentPickupCache.issue(requestScope, 'qr', () => read(api.fulfillmentPickup(organizationId, item.id)), refresh);
        if (live.current && currentScope.current === requestScope) setCredential(result);
      } else {
        const result = await fulfillmentPickupCache.issue(requestScope, 'code', () => read(api.fulfillmentPickupCode(organizationId, item.id)), refresh);
        if (live.current && currentScope.current === requestScope) setPickupCode(result);
      }
    } catch {
      if (live.current && currentScope.current === requestScope) {
        if (kind === 'qr') setFailure('Could not generate the pickup QR.');
        else setCodeError('Could not generate the Pickup Code.');
      }
    } finally {
      inFlight.current = false;
      if (live.current && currentScope.current === requestScope) { setBusy(false); setCodeBusy(false); }
    }
  };
  useEffect(() => {
    if (!credential) return;
    const timer = setTimeout(
      () => setCredential(undefined),
      Math.max(0, Date.parse(credential.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [credential]);
  useEffect(() => {
    if (!pickupCode) return;
    const ms = Math.max(0, Date.parse(pickupCode.expiresAt) - Date.now());
    const timer = setTimeout(() => setPickupCode(undefined), ms);
    return () => clearTimeout(timer);
  }, [pickupCode]);
  if (!allowed) return null;
  return (
    <Card padding="md" style={{ gap: 10, alignItems: "center" }}>
      <Text variant="bodyStrong">
        {item.status === "READY" ? "Show this QR at the counter" : "Pickup QR"}
      </Text>
      {item.status !== "READY" ? (
        <Text
          variant="bodySmall"
          color="textMuted"
          style={{ textAlign: "center" }}
        >
          Keep this QR for collection. Check the order status before heading to
          the Store.
        </Text>
      ) : null}
      {active &&
      !busy &&
      credential &&
      Date.parse(credential.expiresAt) > Date.now() ? (
        <>
          <QrPlaceholder value={credential.reference} />
          <Text variant="caption" color="textMuted">
            Expires {localTime(credential.expiresAt, item.timezone)}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || codeBusy}
            label="Replace pickup QR"
            onPress={() => void generate('qr', true)}
          />
        </>
      ) : (
        <Button
          variant={item.status === "READY" ? "primary" : "outline"}
          disabled={busy || codeBusy || !active}
          label={busy ? "Generating pickup QR…" : "Get pickup QR"}
          onPress={() => void generate('qr', false)}
        />
      )}
      {allowed && active ? (
        <View style={{ width: "100%", gap: 8, alignItems: "center" }}>
          <Text variant="bodyStrong">Or use a six-digit Pickup Code</Text>
          {pickupCode && Date.parse(pickupCode.expiresAt) > Date.now() ? (
            <>
              <Text
                variant="h2"
                accessibilityLabel={`Pickup Code ${pickupCode.code}`}
              >
                {pickupCode.code.slice(0, 3)} {pickupCode.code.slice(3)}
              </Text>
              <Text variant="caption" color="textMuted">
                Expires {localTime(pickupCode.expiresAt, item.timezone)}
              </Text>
            </>
          ) : null}
          <Button variant="ghost" size="sm" disabled={busy || codeBusy}
            label={pickupCode ? "Replace Pickup Code" : "Get Pickup Code"}
            onPress={() => void generate('code', !!pickupCode)} />
          {(credential || pickupCode) ? <Text variant="caption" color="textMuted">Replacing a QR or code makes its previous value invalid.</Text> : null}
          {codeError ? (
            <Text variant="caption" color="danger">
              {codeError}
            </Text>
          ) : null}
          {codeBusy ? (
            <Text variant="caption" color="textMuted">
              Generating Pickup Code…
            </Text>
          ) : null}
          <Text variant="caption" color="textMuted">
            Present the QR or code at Counter. Handover is completed separately
            in Orders.
          </Text>
        </View>
      ) : null}
      {failure ? (
        <Text variant="caption" color="textMuted">
          {failure}
        </Text>
      ) : null}
    </Card>
  );
}

function AmountBreakdown({
  currency,
  subtotal,
  discount,
  tax,
  total,
}: {
  currency?: string | null;
  subtotal?: number | null;
  discount?: number | null;
  tax?: number | null;
  total?: number | null;
}) {
  return (
    <View style={{ gap: 8 }}>
      {(
        [
          ["Subtotal", subtotal],
          ["Applied discounts", discount],
          ["Tax", tax],
          ["Total", total],
        ] as const
      ).map(([label, value]) => {
        const amount = formatTransactionMoney(value, currency);
        if (amount == null) return null;
        return (
          <View
            key={label}
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Text variant={label === "Total" ? "bodyStrong" : "bodySmall"}>
              {label}
            </Text>
            <Text variant={label === "Total" ? "bodyStrong" : "bodySmall"}>
              {label === "Applied discounts" && value && value > 0
                ? `−${amount}`
                : amount}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function CustomerFulfillmentReviewPage({
  organizationId,
  request,
  itemLabels,
  artwork,
  storeAddress,
  storeImage,
  onOpenCounterQr,
  onClose,
  onExit,
  onPayment,
  requestKeyFor,
  onAccepted,
  onQuotedTime,
}: {
  organizationId: string;
  request: CustomerFulfillmentRequest;
  itemLabels: Record<string, string>;
  artwork: Record<string, string>;
  storeAddress?: string;
  storeImage?: string;
  onOpenCounterQr: (qr: CounterQrSummary) => void;
  onClose: () => void;
  onExit: () => void;
  onPayment: (payment: CustomerFulfillmentPayment) => void | Promise<void>;
  requestKeyFor: (signature: string) => string;
  onAccepted: (item: CustomerFulfillment) => void;
  onQuotedTime?: (time?: string) => void;
}) {
  const [review, setReview] = useState<CustomerFulfillmentReview>();
  const [collection, setCollection] = useState(
    request.collectionLocalTime ?? "",
  );
  const [scheduled, setScheduled] = useState(!!request.collectionLocalTime);
  const [quotedTime, setQuotedTime] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [counterConflict, setCounterConflict] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const confirmed = useRef(false);
  const active = useRef(false);
  const inFlight = useRef(false);
  const quotedTimeCallback = useRef(onQuotedTime);
  quotedTimeCallback.current = onQuotedTime;

  const getQuote = useCallback(
    async (time?: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setFailure(undefined);
      setCounterConflict(false);
      setNeedsReview(true);
      try {
        const result = await read(
          api.fulfillmentQuote(organizationId, {
            ...request,
            collectionLocalTime: time,
          }),
        );
        if (active.current) {
          setReview(result);
          setQuotedTime(time);
          setNeedsReview(false);
          quotedTimeCallback.current?.(time);
        }
      } catch (error) {
        if (active.current)
          setFailure(
            error instanceof Error
              ? error.message
              : "Unable to load the quote.",
          );
      } finally {
        inFlight.current = false;
        if (active.current) setBusy(false);
      }
    },
    [organizationId, request],
  );

  useEffect(() => {
    active.current = true;
    void getQuote(request.collectionLocalTime);
    return () => {
      active.current = false;
    };
  }, [getQuote, request.collectionLocalTime]);

  const applyTime = scheduled ? collection.trim() : undefined;
  const currentQuote =
    !!review &&
    !needsReview &&
    applyTime === quotedTime &&
    (!scheduled || !!applyTime);
  const quote = review?.quote;
  const money = (amount: number) =>
    formatTransactionMoney(amount, quote?.currencyCode) ?? "Amount unavailable";
  const label = review?.customerLabel ?? "Order";

  const confirm = async () => {
    if (!quote || !currentQuote || inFlight.current || confirmed.current)
      return;
    inFlight.current = true;
    setBusy(true);
    setFailure(undefined);
    setCounterConflict(false);
    const requestKey = requestKeyFor(
      JSON.stringify([request, quotedTime, quote.quoteHash]),
    );
    try {
      const item = await read(
        api.submitFulfillment(organizationId, {
          ...request,
          collectionLocalTime: quotedTime,
          quoteHash: quote.quoteHash,
          requestKey,
        }),
      );
      if (!active.current) return;
      if (
        item.fulfillment &&
        (!item.payment || item.payment.status === "SUCCEEDED")
      ) {
        confirmed.current = true;
        onAccepted(item.fulfillment);
      } else if (item.payment) {
        confirmed.current = true;
        await onPayment(item.payment);
      } else {
        throw new Error("Unable to recover this request.");
      }
    } catch (error) {
      if (active.current) {
        if (isCounterQrConflict(error)) {
          setCounterConflict(true);
          setNeedsReview(true);
        } else {
          if (
            error instanceof Error &&
            "code" in error &&
            [
              "FULFILLMENT_QUOTE_CHANGED",
              "CONFLICT",
              "BAD_REQUEST",
              "FORBIDDEN",
            ].includes(String(error.code))
          ) {
            setNeedsReview(true);
          }
          setFailure(
            error instanceof Error
              ? error.message
              : "Unable to confirm. Retry to check the request.",
          );
        }
      }
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  };

  return (
    <FulfillmentPage
      onBack={() => {
        if (!inFlight.current) onClose();
      }}
      onExit={() => {
        if (!inFlight.current) onExit();
      }}
      exitDisabled={busy}
      title={`${label} Review`}
      footer={
        review && quote ? (
          <Button
            fullWidth
            label={
              busy
                ? "Please wait…"
                : review.paymentTiming === "PAY_NOW" && quote.totalMinor > 0
                  ? "Pay Now"
                  : `Place ${label}`
            }
            disabled={busy || !currentQuote || confirmed.current}
            onPress={() => void confirm()}
          />
        ) : undefined
      }
    >
      <View style={{ gap: 12 }}>
        {review && quote ? (
          <FulfillmentColumns
            main={
              <>
                <Card
                  padding="md"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <FulfillmentThumbnail
                    image={storeImage}
                    icon="storefront-outline"
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="bodyStrong">{review.storeName}</Text>
                    {storeAddress ? (
                      <Text variant="caption" color="textMuted">
                        {storeAddress}
                      </Text>
                    ) : null}
                    <Text variant="bodySmall">
                      Pickup{" "}
                      {localTime(review.expectedCollectionAt, review.timezone)}{" "}
                      –{" "}
                      {localTime(
                        review.collectionWindowEndsAt,
                        review.timezone,
                      )}
                    </Text>
                  </View>
                </Card>
                <Card padding="md" style={{ gap: 12 }}>
                  <Text variant="bodyStrong">{label} items</Text>
                  {quote.lines.map((line) => {
                    const key = `${line.itemType}:${line.itemId}`;
                    return (
                      <View
                        key={key}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <FulfillmentThumbnail
                          image={artwork[key]}
                          icon="cube-outline"
                        />
                        <View style={{ flex: 1 }}>
                          <Text variant="bodyStrong">{line.productName}</Text>
                          <Text variant="caption" color="textMuted">
                            Qty {line.quantity} · {money(line.unitPriceMinor)}{" "}
                            each
                          </Text>
                          {line.discountMinor > 0 ? (
                            <Text variant="caption" color="success">
                              {itemLabels[key] ??
                                (line.itemType === "BENEFIT"
                                  ? "Benefit"
                                  : "Offer")}{" "}
                              · −{money(line.discountMinor)}
                            </Text>
                          ) : null}
                        </View>
                        <Text variant="bodyStrong">
                          {money(line.subtotalMinor)}
                        </Text>
                      </View>
                    );
                  })}
                  <AmountBreakdown
                    currency={quote.currencyCode}
                    subtotal={quote.subtotalMinor}
                    discount={quote.adjustmentTotalMinor}
                    tax={quote.taxTotalMinor}
                    total={quote.totalMinor}
                  />
                </Card>
              </>
            }
            side={
              <>
                <Card
                  padding="md"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <FulfillmentThumbnail
                    icon={
                      quote.totalMinor === 0
                        ? "checkmark-circle-outline"
                        : "card-outline"
                    }
                    size={36}
                  />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {quote.totalMinor === 0
                      ? "No payment required"
                      : review.paymentTiming === "PAY_AT_COUNTER"
                        ? "Pay at counter"
                        : "Pay online"}
                  </Text>
                </Card>
                {review.schedulingSupported ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      label={scheduled ? "Switch to ASAP" : "Schedule pickup"}
                      disabled={busy}
                      onPress={() => {
                        setScheduled(!scheduled);
                        if (scheduled && quotedTime) void getQuote();
                      }}
                    />
                    {scheduled ? (
                      <Input
                        label={`Pickup date and time (${review.timezone})`}
                        placeholder="YYYY-MM-DD HH:MM"
                        value={collection}
                        onChangeText={setCollection}
                      />
                    ) : null}
                  </>
                ) : null}
                {!currentQuote ? (
                  <Button
                    variant="secondary"
                    label={
                      needsReview ? "Review updated quote" : "Check pickup time"
                    }
                    disabled={busy || (scheduled && !applyTime)}
                    onPress={() => void getQuote(applyTime)}
                  />
                ) : null}
              </>
            }
          />
        ) : (
          <Button
            label={busy ? "Loading quote…" : "Try quote again"}
            disabled={busy}
            onPress={() => void getQuote(applyTime)}
          />
        )}
        {counterConflict ? (
          <CounterQrConflict
            organizationId={organizationId}
            selection={request.selection}
            onOpen={onOpenCounterQr}
          />
        ) : null}
        {failure ? (
          <Text variant="bodySmall" color="danger">
            {failure}
          </Text>
        ) : null}
      </View>
    </FulfillmentPage>
  );
}

export function CustomerFulfillmentPaymentPage({
  organizationId,
  customerUserId,
  initial,
  counterConflict,
  onOpenCounterQr,
  onClose,
  onState,
  onAccepted,
}: {
  organizationId: string;
  customerUserId: string;
  initial: CustomerFulfillmentPayment;
  counterConflict?: boolean;
  onOpenCounterQr: (qr: CounterQrSummary) => void;
  onClose: () => void;
  onState: (payment: CustomerFulfillmentPayment) => void;
  onAccepted: (
    item: CustomerFulfillment,
    view?: "details" | "confirmation",
  ) => void;
}) {
  const [payment, setPayment] = useState(initial);
  const [confirmed, setConfirmed] = useState<CustomerFulfillment>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [blockedByCounter, setBlockedByCounter] = useState(!!counterConflict);
  const recoverySelection = useMemo(
    () => ({
      subscriptionId: initial.subscriptionId,
      benefitIds: [],
      offerIds: [],
    }),
    [initial.subscriptionId],
  );
  const running = useRef(false);
  const storageKey = fulfillmentCollectReturnKey(customerUserId);
  const terminal = ["FAILED", "CANCELED", "CANCELLED"].includes(payment.status);

  const refresh = async (view?: "details" | "confirmation") => {
    const result = await read(
      api.reconcileFulfillmentPayment(organizationId, payment.paymentIntentId),
    );
    if (
      result.fulfillment &&
      result.payment?.paymentIntentId === payment.paymentIntentId &&
      result.payment.status === "SUCCEEDED"
    ) {
      await storage.removeItem(storageKey).catch(() => undefined);
      setConfirmed(result.fulfillment);
      onAccepted(result.fulfillment, view);
      return;
    }
    if (result.payment) {
      if (["FAILED", "CANCELED", "CANCELLED"].includes(result.payment.status)) {
        await storage.removeItem(storageKey).catch(() => undefined);
      }
      setPayment(result.payment);
      onState(result.payment);
    }
  };

  const run = async (operation: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      await operation();
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Could not check payment status.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const openCheckout = () =>
    run(async () => {
      const returned = await openFulfillmentCollect(
        organizationId,
        customerUserId,
        payment,
      );
      if (returned) {
        setBlockedByCounter(returned.counterConflict);
        await refresh(returned.view);
      }
    });

  const cancel = () =>
    run(async () => {
      try {
        await api.cancelPayment(organizationId, payment.paymentIntentId);
      } finally {
        await refresh();
      }
    });

  return (
    <FulfillmentPage
      title={
        confirmed
          ? `${confirmed.customerLabel} Placed`
          : `${payment.customerLabel} Payment`
      }
      onBack={() => {
        if (!running.current) onClose();
      }}
    >
      <Card padding="lg" style={{ gap: 12 }}>
        {confirmed ? (
          <>
            <CustomerFulfillmentSummary item={confirmed} showItems />
            <Button
              label={`View ${confirmed.customerLabel} Status`}
              onPress={() => onAccepted(confirmed)}
            />
          </>
        ) : (
          <>
            <Text variant="bodySmall">
              {terminal
                ? "This payment ended without an accepted request."
                : payment.verifiedCapture
                  ? "We verified your payment. Your request needs review before it can be accepted."
                  : payment.requiresReconciliation
                    ? "We could not verify the payment outcome. It needs review before you pay again."
                    : payment.status === "PENDING"
                      ? "Continue to secure checkout to pay."
                      : "Payment confirmation is pending. Check its status before paying again."}
            </Text>
            {payment.status === "PENDING" ? (
              <>
                <CounterQrConflict
                  key={String(blockedByCounter)}
                  organizationId={organizationId}
                  selection={recoverySelection}
                  paymentIntentId={payment.paymentIntentId}
                  optional={!blockedByCounter}
                  onOpen={onOpenCounterQr}
                />
                <Button
                  label="Continue to secure payment"
                  disabled={busy}
                  onPress={() => void openCheckout()}
                />
                <Button
                  label="Cancel checkout"
                  variant="outline"
                  disabled={busy}
                  onPress={() => void cancel()}
                />
              </>
            ) : null}
            {terminal ? (
              <Button
                label="Return to Redeem"
                variant="outline"
                onPress={onClose}
              />
            ) : (
              <Button
                label="Check payment status"
                variant="secondary"
                disabled={busy}
                onPress={() => void run(refresh)}
              />
            )}
          </>
        )}
        {failure ? (
          <Text variant="bodySmall" color="danger">
            {failure}
          </Text>
        ) : null}
      </Card>
    </FulfillmentPage>
  );
}

export function CustomerFulfillmentDetails({
  organizationId,
  initial,
  focused,
  confirmation,
  onClose,
  onReceipt,
  onChanged,
}: {
  organizationId: string;
  initial: CustomerFulfillment;
  focused: boolean;
  confirmation?: boolean;
  onClose: () => void;
  onReceipt: (id: string) => Promise<void>;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [item, setItem] = useState(initial);
  const [receiptAmounts, setReceiptAmounts] = useState<TransactionReceipt>();
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const [failure, setFailure] = useState<string>();
  const [proposed, setProposed] = useState("");
  const [requestingChange, setRequestingChange] = useState(false);
  const [requestingCancellation, setRequestingCancellation] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mutation = useRef(false);
  const mounted = useRef(false);
  const terminal = fulfillmentIsTerminal(item.status);
  const orderId = initial.id;
  const completePricing =
    item.subtotalMinor != null &&
    item.discountMinor != null &&
    item.taxMinor != null &&
    (item.lines ?? []).every((line) => line.subtotalMinor != null);

  useEffect(() => {
    if (!item.receiptId || completePricing) return;
    let live = true;
    void read(api.receipt(organizationId, item.receiptId))
      .then((receipt) => {
        if (live) setReceiptAmounts(receipt);
      })
      .catch(() => {
        /* The order remains readable while its receipt is unavailable. */
      });
    return () => {
      live = false;
    };
  }, [completePricing, item.receiptId, organizationId]);
  const orderReceipt =
    receiptAmounts?.transactionReceiptId === item.receiptId
      ? receiptAmounts
      : undefined;
  const receiptLines = useMemo(
    () => receiptLineSubtotals(orderReceipt?.receiptSnapshot),
    [orderReceipt?.receiptSnapshot],
  );

  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener("change", (state) =>
      setAppActive(state === "active"),
    );
    return () => {
      mounted.current = false;
      listener.remove();
    };
  }, []);

  const update = (next: CustomerFulfillment) =>
    setItem((current) => (next.version >= current.version ? next : current));
  const refresh = useCallback(async () => {
    if (running.current || mutation.current) return;
    running.current = true;
    try {
      const next = await read(api.fulfillment(organizationId, orderId));
      if (mounted.current) {
        update(next);
        setFailure(undefined);
      }
    } catch {
      if (mounted.current)
        setFailure("Unable to refresh. The last available status is shown.");
    } finally {
      running.current = false;
    }
  }, [organizationId, orderId]);

  useEffect(() => {
    if (!focused || !appActive) return;
    void refresh();
    if (terminal) return;
    const interval = setInterval(() => void refresh(), 8000);
    return () => clearInterval(interval);
  }, [focused, appActive, terminal, refresh]);

  const mutate = async (action: () => Promise<void>) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setFailure(undefined);
    try {
      await action();
    } catch (error) {
      if (mounted.current)
        setFailure(
          error instanceof Error
            ? error.message
            : "Unable to complete this action.",
        );
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const requestChange = (time?: string) =>
    mutate(async () => {
      const next = await read(
        api.requestFulfillmentChange(organizationId, item.id, {
          version: item.version,
          collectionLocalTime: time,
        }),
      );
      if (!mounted.current) return;
      update(next);
      setRequestingChange(false);
      setRequestingCancellation(false);
      onChanged();
    });
  return (
    <FulfillmentPage
      onBack={() => {
        if (!mutation.current) onClose();
      }}
      title={`${item.customerLabel} Details`}
    >
      <FulfillmentColumns
        main={
          <>
            <FulfillmentProgress item={item} confirmation={confirmation} />
            <FulfillmentPickupCard
              organizationId={organizationId}
              item={item}
              active={focused && appActive}
            />
          </>
        }
        side={
          <>
            <Card padding="md" style={{ gap: 8 }}>
              <CustomerFulfillmentSummary item={item} showReference={false} />
              {item.expectedCompletionAt && !terminal ? (
                <Text variant="bodySmall">
                  Estimated completion{" "}
                  {localTime(item.expectedCompletionAt, item.timezone)}
                </Text>
              ) : null}
              {item.fulfilledAt ? (
                <Text variant="bodySmall">
                  Fulfilled {localTime(item.fulfilledAt, item.timezone)}
                </Text>
              ) : null}
            </Card>
            {item.lines?.map((line) => {
              const subtotal = formatTransactionMoney(
                receiptLines.get(
                  receiptLineKey(
                    line.name,
                    line.quantity,
                    line.unitPriceMinor,
                    item.currencyCode,
                  ),
                ) ?? line.subtotalMinor,
                item.currencyCode,
              );
              return (
                <Card
                  key={line.id}
                  padding="md"
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <FulfillmentThumbnail icon="cube-outline" size={36} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">
                      {line.quantity} × {line.name}
                    </Text>
                    {line.unitPriceMinor != null ? (
                      <Text variant="bodySmall">
                        {formatTransactionMoney(
                          line.unitPriceMinor,
                          item.currencyCode,
                        )}{" "}
                        each
                      </Text>
                    ) : null}
                    {subtotal ? (
                      <Text variant="bodySmall">Subtotal {subtotal}</Text>
                    ) : null}
                    {line.discountMinor != null && line.discountMinor > 0 ? (
                      <Text variant="bodySmall" color="success">
                        Applied discount{" "}
                        {formatTransactionMoney(
                          line.discountMinor,
                          item.currencyCode,
                        )}
                      </Text>
                    ) : null}
                    {line.fulfilledQuantity != null &&
                    line.fulfilledQuantity > 0 &&
                    line.fulfilledQuantity < line.quantity ? (
                      <Text variant="bodySmall">
                        {line.fulfilledQuantity} of {line.quantity} handed over
                      </Text>
                    ) : null}
                  </View>
                </Card>
              );
            })}
            {orderReceipt ||
            item.subtotalMinor != null ||
            item.discountMinor != null ||
            item.taxMinor != null ? (
              <Card padding="md">
                <AmountBreakdown
                  currency={orderReceipt?.currencyCode ?? item.currencyCode}
                  subtotal={orderReceipt?.subtotalMinor ?? item.subtotalMinor}
                  discount={orderReceipt?.discountMinor ?? item.discountMinor}
                  tax={orderReceipt?.taxMinor ?? item.taxMinor}
                  total={orderReceipt?.totalMinor ?? item.totalMinor}
                />
              </Card>
            ) : null}
            {item.verifiedSavingsMinor != null &&
            formatTransactionMoney(
              item.verifiedSavingsMinor,
              item.currencyCode,
            ) ? (
              <Text variant="bodyStrong" color="success">
                Saved{" "}
                {formatTransactionMoney(
                  item.verifiedSavingsMinor,
                  item.currencyCode,
                )}
              </Text>
            ) : null}
            {item.timeline
              ?.filter(
                (entry) =>
                  timelineLabels[entry.type] &&
                  (entry.type !== "PREPARATION_STARTED" ||
                    item.workflow === "DETAILED") &&
                  (entry.type !== "MARKED_READY" || item.workflow !== "NONE"),
              )
              .map((entry) => (
                <Text key={entry.id} variant="caption" color="textMuted">
                  {timelineLabels[entry.type]} ·{" "}
                  {localTime(entry.at, item.timezone)}
                  {entry.previousAt ? ` · Previous ${localTime(entry.previousAt, item.timezone)}` : ""}
                  {entry.proposedAt ? ` · Proposed ${localTime(entry.proposedAt, item.timezone)}` : ""}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </Text>
              ))}
            {item.refundStates.map((state) =>
              refundLabels[state] ? (
                <Text key={state} variant="bodySmall">
                  {refundLabels[state]}
                </Text>
              ) : null,
            )}
            {item.receiptId && item.status === "FULFILLED" ? (
              <Button
                label="View receipt"
                disabled={busy}
                onPress={() => {
                  const receiptId = item.receiptId;
                  if (receiptId) void mutate(() => onReceipt(receiptId));
                }}
              />
            ) : null}
            <View style={{ gap: 8, alignItems: "flex-start" }}>
              {item.canRequestCollectionChange ? (
                requestingChange ? (
                  <>
                    <Input
                      label={`Requested pickup time (${item.timezone ?? "Store time"})`}
                      placeholder="YYYY-MM-DD HH:MM"
                      value={proposed}
                      onChangeText={setProposed}
                    />
                    <Button
                      label="Send pickup change request"
                      disabled={busy || !proposed.trim()}
                      onPress={() => void requestChange(proposed.trim())}
                    />
                  </>
                ) : (
                  <Button
                    label="Request a different pickup time"
                    variant="outline"
                    onPress={() => setRequestingChange(true)}
                  />
                )
              ) : null}
              {item.canRequestCancellation ? (
                <Button
                  label="Request cancellation"
                  variant="outline"
                  disabled={busy}
                  onPress={() => setRequestingCancellation(true)}
                />
              ) : null}
              {failure ? (
                <Text variant="bodySmall" color="danger">
                  {failure}
                </Text>
              ) : null}
              <Button
                label="Refresh status"
                variant="ghost"
                disabled={busy}
                onPress={() => void refresh()}
              />
              <Button
                label="Contact support"
                variant="ghost"
                onPress={() => router.push("/customer/support")}
              />
            </View>
            <Modal
              visible={requestingCancellation && item.canRequestCancellation}
              title="Request cancellation"
              maxWidth={420}
              onClose={() => {
                if (!busy) setRequestingCancellation(false);
              }}
            >
              <View style={{ gap: 12 }}>
                <Text>Are you sure you want to request cancellation?</Text>
                <Button
                  label={`Keep ${item.customerLabel}`}
                  variant="outline"
                  disabled={busy}
                  onPress={() => setRequestingCancellation(false)}
                />
                <Button
                  label="Yes, Request Cancellation"
                  disabled={busy}
                  onPress={() => void requestChange()}
                />
                {failure ? (
                  <Text variant="bodySmall" color="danger">
                    {failure}
                  </Text>
                ) : null}
              </View>
            </Modal>
          </>
        }
      />
    </FulfillmentPage>
  );
}
