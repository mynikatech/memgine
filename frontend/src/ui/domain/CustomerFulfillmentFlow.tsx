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
  Linking,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  RefreshControl,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
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
  onRefresh,
  refreshing = false,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
  onExit?: () => void;
  exitDisabled?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
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
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
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
  compact = false,
}: {
  item: CustomerFulfillment;
  confirmation?: boolean;
  compact?: boolean;
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
  if (compact) {
    const currentIndex = stages.indexOf(item.status);
    const lastStageIndex =
      item.status === "FULFILLED" ? stages.length - 1 : currentIndex;
    return (
      <Card
        padding="md"
        style={{ gap: 10, backgroundColor: theme.colors.surfaceAlt }}
      >
        {stages.length ? (
          <View
            accessibilityLabel={`Order progress: ${statusLabels[item.status]}`}
            style={{ flexDirection: "row", alignItems: "flex-start" }}
          >
            {stages.map((stage, index) => {
              const completed =
                item.status === "FULFILLED" ||
                (lastStageIndex >= 0 && index < lastStageIndex);
              const current = item.status === stage;
              const activated = completed || current;
              const icon: FulfillmentIcon =
                stage === "PLACED"
                  ? "checkmark"
                  : stage === "PREPARING"
                    ? "bag-handle-outline"
                    : stage === "READY"
                      ? "bag-check-outline"
                      : "checkmark-done-outline";
              const stageLabel =
                stage === "PLACED"
                  ? "Order Placed"
                  : stage === "PREPARING"
                    ? "Preparing"
                    : stage === "READY"
                      ? "Ready for Collection"
                      : "Collected";
              return (
                <View
                  key={stage}
                  style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 5 }}
                >
                  <View
                    style={{
                      alignSelf: "stretch",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        height: 2,
                        backgroundColor:
                          index === 0
                            ? "transparent"
                            : activated
                              ? theme.colors.primary
                              : theme.colors.border,
                      }}
                    />
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: current ? 2 : 1,
                        borderColor: activated
                          ? theme.colors.primary
                          : theme.colors.textMuted,
                        backgroundColor: completed
                          ? theme.colors.primary
                          : current
                            ? theme.colors.primarySoft
                            : theme.colors.surface,
                      }}
                    >
                      <Ionicons
                        name={icon}
                        size={18}
                        color={
                          completed
                            ? theme.colors.surface
                            : activated
                              ? theme.colors.primary
                              : theme.colors.textMuted
                        }
                      />
                    </View>
                    <View
                      style={{
                        flex: 1,
                        height: 2,
                        backgroundColor:
                          index === stages.length - 1
                            ? "transparent"
                            : completed
                              ? theme.colors.primary
                              : theme.colors.border,
                      }}
                    />
                  </View>
                  <View
                    style={{
                      minHeight: 43,
                      width: "100%",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      backgroundColor: current
                        ? theme.colors.primarySoft
                        : "transparent",
                      borderRadius: theme.radius.md,
                      paddingVertical: 3,
                      paddingHorizontal: 2,
                    }}
                  >
                    <Text
                      variant="caption"
                      color={activated ? "primary" : "textMuted"}
                      style={{
                        textAlign: "center",
                        fontWeight: current ? "700" : "500",
                      }}
                    >
                      {stageLabel}
                    </Text>
                    {stage === "PLACED" ? (
                      <Text
                        variant="caption"
                        color="textMuted"
                        style={{ textAlign: "center" }}
                      >
                        {localTime(item.acceptedAt, item.timezone)
                          ?.split(", ")
                          .slice(-1)[0] ?? ""}
                      </Text>
                    ) : null}
                    {current && stage === "PREPARING" ? (
                      <Text
                        variant="caption"
                        color="primary"
                        style={{ textAlign: "center" }}
                      >
                        In Progress
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons
              name="checkmark-circle-outline"
              size={21}
              color={theme.colors.primary}
            />
            <Text variant="bodyStrong">{statusLabels[item.status]}</Text>
          </View>
        )}
        {item.status === "CANCEL_REQUESTED" || item.status === "CANCELLED" ? (
          <Text variant="caption" color="textMuted">
            {statusLabels[item.status]}
          </Text>
        ) : null}
      </Card>
    );
  }
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
  const theme = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  // Fit two pickup credentials in one row on narrow phones.
  const pickupQrSize =
    viewportWidth < 380
      ? 106
      : viewportWidth < 480
        ? 118
        : viewportWidth < 600
          ? 142
          : 158;
  const { session } = useAuth();
  const scope = JSON.stringify([
    session?.userId,
    session?.expiresAt,
    organizationId,
    item.id,
  ]);
  const allowed =
    !!session?.userId &&
    !!item.canShowPickup &&
    ["PLACED", "PREPARING", "READY"].includes(item.status);
  const [credential, setCredential] = useState<{
    reference: string;
    expiresAt: string;
  }>();
  const [pickupCode, setPickupCode] = useState<{
    code: string;
    expiresAt: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [codeError, setCodeError] = useState<string>();
  const live = useRef(false);
  const currentScope = useRef(scope);
  const previousSession = useRef(session?.userId);
  const previousScope = useRef(scope);
  const inFlight = useRef(false);
  currentScope.current = scope;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      previousSession.current &&
      previousSession.current !== session?.userId
    ) {
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
    setCredential(
      fulfillmentPickupCache.get<{ reference: string; expiresAt: string }>(
        scope,
        "qr",
      ),
    );
    setPickupCode(
      fulfillmentPickupCache.get<{ code: string; expiresAt: string }>(
        scope,
        "code",
      ),
    );
    setFailure(undefined);
    setCodeError(undefined);
  }, [scope, allowed, active]);
  useEffect(
    () =>
      fulfillmentPickupCache.subscribe(scope, () => {
        if (!allowed) return;
        setCredential(
          fulfillmentPickupCache.get<{ reference: string; expiresAt: string }>(
            scope,
            "qr",
          ),
        );
        setPickupCode(
          fulfillmentPickupCache.get<{ code: string; expiresAt: string }>(
            scope,
            "code",
          ),
        );
      }),
    [scope, allowed],
  );

  const qrValid = !!credential && Date.parse(credential.expiresAt) > Date.now();
  const codeValid =
    !!pickupCode && Date.parse(pickupCode.expiresAt) > Date.now();
  const issue = async (
    kind: "qr" | "code",
    replace: boolean,
    requestScope: string,
  ) => {
    try {
      if (kind === "qr") {
        const result = await fulfillmentPickupCache.issue(
          requestScope,
          "qr",
          () => read(api.fulfillmentPickup(organizationId, item.id)),
          replace,
        );
        if (live.current && currentScope.current === requestScope)
          setCredential(result);
      } else {
        const result = await fulfillmentPickupCache.issue(
          requestScope,
          "code",
          () => read(api.fulfillmentPickupCode(organizationId, item.id)),
          replace,
        );
        if (live.current && currentScope.current === requestScope)
          setPickupCode(result);
      }
    } catch {
      if (live.current && currentScope.current === requestScope) {
        if (kind === "qr") setFailure("Could not generate the Pickup QR.");
        else setCodeError("Could not generate the six-digit Pickup Code.");
      }
    }
  };

  const generate = async (replace: boolean, combined: boolean) => {
    if (!allowed || !active || inFlight.current) return;
    inFlight.current = true;
    const requestScope = scope;
    setBusy(true);
    setFailure(undefined);
    setCodeError(undefined);
    try {
      // Both credentials are supported in PLACED/PREPARING/READY (migration 309g).
      if (replace || !qrValid) {
        if (replace) setCredential(undefined);
        await issue("qr", replace, requestScope);
      }
      if (combined && (replace || !codeValid)) {
        if (replace) setPickupCode(undefined);
        await issue("code", replace, requestScope);
      }
    } finally {
      inFlight.current = false;
      if (live.current && currentScope.current === requestScope) setBusy(false);
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
    const timer = setTimeout(
      () => setPickupCode(undefined),
      Math.max(0, Date.parse(pickupCode.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pickupCode]);

  if (!allowed) return null;
  const bothValid = qrValid && codeValid;
  return (
    <Card
      padding="md"
      style={{ gap: 10, backgroundColor: theme.colors.primarySoft }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Ionicons
          name="qr-code-outline"
          size={21}
          color={theme.colors.primary}
        />
        <View style={{ flex: 1, minWidth: 140, gap: 2 }}>
          <Text variant="bodyStrong">Pickup at Counter</Text>
          <Text variant="caption" color="textMuted">
            Show your QR or six-digit code to counter staff.
          </Text>
        </View>
        {active && bothValid ? (
          <Button
            size="sm"
            variant="outline"
            label={busy ? "Refreshing…" : "Refresh QR & Code"}
            disabled={busy}
            onPress={() => void generate(true, true)}
          />
        ) : null}
      </View>
      {active && (qrValid || codeValid) ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {qrValid && credential ? (
            <View
              style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 4 }}
            >
              <QrPlaceholder value={credential.reference} size={pickupQrSize} />
              <Text variant="caption" color="textMuted">
                Pickup QR
              </Text>
              <Text variant="caption" color="textMuted">
                Expires {localTime(credential.expiresAt, item.timezone)}
              </Text>
            </View>
          ) : (
            <View
              style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 4 }}
            >
              <Ionicons
                name="qr-code-outline"
                size={54}
                color={theme.colors.primary}
              />
              <Text variant="caption" color="textMuted">
                QR not generated
              </Text>
            </View>
          )}
          <View
            style={{
              width: 1,
              alignSelf: "stretch",
              backgroundColor: theme.colors.border,
            }}
          />
          <View style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 6 }}>
            <Text variant="bodyStrong">Pickup Code</Text>
            {codeValid && pickupCode ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.md,
                    paddingVertical: 6,
                    paddingHorizontal: 6,
                  }}
                >
                  <Text
                    variant="h2"
                    accessibilityLabel={`Pickup Code ${pickupCode.code}`}
                    style={{ textAlign: "center", flexShrink: 1 }}
                  >
                    {pickupCode.code.slice(0, 3)} {pickupCode.code.slice(3)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Copy pickup code"
                    onPress={() =>
                      void Clipboard.setStringAsync(pickupCode.code)
                    }
                    style={{
                      padding: 5,
                      minWidth: 32,
                      minHeight: 34,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="copy-outline"
                      size={19}
                      color={theme.colors.primary}
                    />
                  </Pressable>
                </View>
                <Text
                  variant="caption"
                  color="textMuted"
                  style={{ textAlign: "center" }}
                >
                  Expires {localTime(pickupCode.expiresAt, item.timezone)}
                </Text>
              </>
            ) : (
              <Text variant="bodySmall" color="textMuted">
                Not generated
              </Text>
            )}
          </View>
        </View>
      ) : null}
      {active && !bothValid ? (
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          label={
            busy
              ? "Generating pickup credentials…"
              : "Generate Pickup QR & Code"
          }
          onPress={() => void generate(false, true)}
        />
      ) : null}
      {qrValid || codeValid ? (
        <Text
          variant="caption"
          color="textMuted"
          style={{ textAlign: "center" }}
        >
          Each credential expires independently. Refresh replaces both values
          and invalidates their old values.
        </Text>
      ) : null}
      {!active ? (
        <Text variant="caption" color="textMuted">
          Open this order to generate pickup credentials.
        </Text>
      ) : null}
      {failure ? (
        <Text variant="caption" color="danger">
          {failure}
        </Text>
      ) : null}
      {codeError ? (
        <Text variant="caption" color="danger">
          {codeError}
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
  paymentState,
  compactTotal = false,
}: {
  currency?: string | null;
  subtotal?: number | null;
  discount?: number | null;
  tax?: number | null;
  total?: number | null;
  paymentState?: string;
  compactTotal?: boolean;
}) {
  const theme = useTheme();
  const totalLabel =
    paymentState === "UNPAID"
      ? "Total Due"
      : paymentState === "PAID" || paymentState === "PAYMENT_RECEIVED"
        ? "Total Paid"
        : paymentState === "NO_PAYMENT_REQUIRED"
          ? "Total"
          : "Order Total";
  return (
    <View style={{ gap: 8 }}>
      {(
        [
          ["Subtotal", subtotal],
          ["Applied discounts", discount],
          ["Tax", tax],
        ] as const
      ).map(([label, value]) => {
        const amount = formatTransactionMoney(value, currency);
        if (amount == null) return null;
        return (
          <View
            key={label}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text
              variant="bodySmall"
              color={
                label === "Applied discounts" && value && value > 0
                  ? "success"
                  : undefined
              }
            >
              {label === "Applied discounts"
                ? "Discount (Applied Benefits)"
                : label}
            </Text>
            <Text
              variant="bodySmall"
              color={
                label === "Applied discounts" && value && value > 0
                  ? "success"
                  : undefined
              }
            >
              {label === "Applied discounts" && value && value > 0
                ? `−${amount}`
                : amount}
            </Text>
          </View>
        );
      })}
      {formatTransactionMoney(total, currency) ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            backgroundColor: compactTotal
              ? theme.colors.primarySoft
              : "transparent",
            borderRadius: theme.radius.md,
            paddingHorizontal: compactTotal ? 10 : 0,
            paddingVertical: compactTotal ? 7 : 0,
          }}
        >
          <Text variant="bodyStrong">{totalLabel}</Text>
          <Text
            variant="bodyStrong"
            color={compactTotal ? "primary" : undefined}
          >
            {formatTransactionMoney(total, currency)}
          </Text>
        </View>
      ) : null}
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

// Additional detail fields returned by the existing fulfillment GET after migration 317.
// Kept local so the customer-data API module does not need a separate edit.
type CustomerFulfillmentWithStore = CustomerFulfillment & {
  storeId?: string | null;
  storeAddress?: {
    line1: string;
    line2?: string | null;
    city: string;
    region?: string | null;
    postalCode?: string | null;
    countryCode: string;
  } | null;
};

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
  const theme = useTheme();
  const [item, setItem] = useState<CustomerFulfillmentWithStore>(initial);
  const [receiptAmounts, setReceiptAmounts] = useState<TransactionReceipt>();
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const [failure, setFailure] = useState<string>();
  const [proposed, setProposed] = useState("");
  const [requestingChange, setRequestingChange] = useState(false);
  const [requestingCancellation, setRequestingCancellation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showOrderSavings, setShowOrderSavings] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date>(() => new Date());
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

  const refresh = useCallback(async () => {
    if (running.current || mutation.current) return;
    running.current = true;
    try {
      const next = await read(api.fulfillment(organizationId, orderId));
      if (mounted.current) {
        setItem((current) =>
          next.version >= current.version ? next : current,
        );
        setLastUpdatedAt(new Date());
        setFailure(undefined);
      }
    } catch {
      if (mounted.current)
        setFailure("Unable to refresh. The last available status is shown.");
    } finally {
      running.current = false;
    }
  }, [organizationId, orderId]);

  const handlePullRefresh = async () => {
    if (running.current || mutation.current) return;
    setPullRefreshing(true);
    try {
      await refresh();
    } finally {
      if (mounted.current) setPullRefreshing(false);
    }
  };

  useEffect(() => {
    if (!focused || !appActive) return;
    void refresh();
    if (terminal) return;
    const interval = setInterval(() => void refresh(), 60000);
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
      setItem((current) => (next.version >= current.version ? next : current));
      setRequestingChange(false);
      setRequestingCancellation(false);
      onChanged();
    });

  const address = item.storeAddress;
  const storeAddress = address
    ? [
        address.line1,
        address.line2,
        address.city,
        address.region,
        address.postalCode,
        address.countryCode,
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const lines = item.lines ?? [];
  // Applied line discounts come from authoritative Commerce adjustments; never
  // fabricate membership savings from a suggested or undiscounted price.
  const allLineDiscountsKnown =
    lines.length > 0 && lines.every((line) => line.discountMinor != null);
  const appliedLineDiscount = allLineDiscountsKnown
    ? lines.reduce((sum, line) => sum + (line.discountMinor ?? 0), 0)
    : undefined;
  const orderSavingsMinor =
    item.verifiedSavingsMinor ?? item.discountMinor ?? appliedLineDiscount;
  // A known zero is meaningful: show $0.00, not an unavailable-value dash.
  const savings =
    orderSavingsMinor != null && orderSavingsMinor >= 0
      ? formatTransactionMoney(orderSavingsMinor, item.currencyCode)
      : undefined;
  const visibleLines = showAllItems ? lines : lines.slice(0, 2);
  const timeline =
    item.timeline?.filter(
      (entry) =>
        timelineLabels[entry.type] &&
        (entry.type !== "PREPARATION_STARTED" ||
          item.workflow === "DETAILED") &&
        (entry.type !== "MARKED_READY" || item.workflow !== "NONE"),
    ) ?? [];

  const contentWide = useWindowDimensions().width >= 900;
  const openMap = () => {
    if (!storeAddress) return;
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeAddress)}`,
    );
  };
  const amountCurrency = orderReceipt?.currencyCode ?? item.currencyCode;
  const total = orderReceipt?.totalMinor ?? item.totalMinor;
  const allUnitPricesKnown =
    lines.length > 0 &&
    lines.every(
      (line) =>
        line.unitPriceMinor != null &&
        Number.isFinite(line.quantity) &&
        line.quantity > 0,
    );
  const pricedItemsSubtotal = allUnitPricesKnown
    ? lines.reduce(
        (sum, line) => sum + (line.unitPriceMinor ?? 0) * line.quantity,
        0,
      )
    : undefined;
  const subtotal =
    orderReceipt?.subtotalMinor ?? item.subtotalMinor ?? pricedItemsSubtotal;
  const discount =
    orderReceipt?.discountMinor ?? item.discountMinor ?? appliedLineDiscount;
  // A tax remainder is displayed only when all three amounts are known and
  // reconcile exactly, never from a guessed tax rate.
  const taxRemainder =
    subtotal != null && discount != null && total != null
      ? total - subtotal + discount
      : undefined;
  const tax =
    orderReceipt?.taxMinor ??
    item.taxMinor ??
    (taxRemainder != null && taxRemainder >= 0 ? taxRemainder : undefined);

  const orderItems = (
    <Card padding="md" style={{ gap: 10, flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons
          name="bag-handle-outline"
          size={19}
          color={theme.colors.primary}
        />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          Order Items ({lines.length})
        </Text>
        <Ionicons
          name={showAllItems ? "chevron-up" : "chevron-down"}
          size={17}
          color={theme.colors.primary}
        />
      </View>
      <View style={{ height: 1, backgroundColor: theme.colors.border }} />
      {visibleLines.map((line, index) => {
        const lineTotal = receiptLines.get(
          receiptLineKey(
            line.name,
            line.quantity,
            line.unitPriceMinor,
            item.currencyCode,
          ),
        );
        // Do not calculate an assumed line price; use authoritative receipt data.
        const lineAmount = formatTransactionMoney(
          lineTotal ??
            line.subtotalMinor ??
            (line.unitPriceMinor != null
              ? line.unitPriceMinor * line.quantity
              : undefined),
          item.currencyCode,
        );
        return (
          <View
            key={line.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingTop: index ? 8 : 0,
              borderTopWidth: index ? 1 : 0,
              borderColor: theme.colors.border,
            }}
          >
            <FulfillmentThumbnail icon="cube-outline" size={38} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{line.name}</Text>
              <Text variant="caption" color="textMuted">
                Qty {line.quantity}
                {line.unitPriceMinor != null
                  ? ` · ${formatTransactionMoney(line.unitPriceMinor, item.currencyCode)} each`
                  : ""}
              </Text>
              {line.discountMinor != null && line.discountMinor > 0 ? (
                <Text variant="caption" color="success">
                  Discount{" "}
                  {formatTransactionMoney(
                    line.discountMinor,
                    item.currencyCode,
                  )}
                </Text>
              ) : null}
              {line.fulfilledQuantity != null &&
              line.fulfilledQuantity > 0 &&
              line.fulfilledQuantity < line.quantity ? (
                <Text variant="caption" color="textMuted">
                  {line.fulfilledQuantity} of {line.quantity} handed over
                </Text>
              ) : null}
            </View>
            {lineAmount ? <Text variant="bodyStrong">{lineAmount}</Text> : null}
          </View>
        );
      })}
      {lines.length > 2 ? (
        <Button
          variant="ghost"
          size="sm"
          label={
            showAllItems ? "Show fewer items" : `Show all ${lines.length} items`
          }
          onPress={() => setShowAllItems((value) => !value)}
        />
      ) : null}
    </Card>
  );

  const orderTotals = (
    <Card padding="md" style={{ gap: 10, flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons
          name="receipt-outline"
          size={19}
          color={theme.colors.primary}
        />
        <Text variant="bodyStrong">Order Summary</Text>
      </View>
      <View style={{ height: 1, backgroundColor: theme.colors.border }} />
      <AmountBreakdown
        currency={amountCurrency}
        subtotal={subtotal}
        discount={discount}
        tax={tax}
        total={total}
        paymentState={item.paymentState}
        compactTotal
      />
      {!["UNPAID", "PAID", "PAYMENT_RECEIVED"].includes(item.paymentState) ? (
        <Text variant="caption" color="textMuted">
          {paymentLabels[item.paymentState] ?? "Payment unconfirmed"}
        </Text>
      ) : null}
    </Card>
  );

  return (
    <FulfillmentPage
      onBack={() => {
        if (!mutation.current) onClose();
      }}
      title={`${item.customerLabel} Details`}
      onRefresh={() => void handlePullRefresh()}
      refreshing={pullRefreshing}
    >
      <View style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
              {item.customerLabel} {item.referenceNumber}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy order reference"
              onPress={() =>
                void Clipboard.setStringAsync(item.referenceNumber)
              }
              style={{
                minWidth: 36,
                minHeight: 36,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="copy-outline"
                size={21}
                color={theme.colors.primary}
              />
            </Pressable>
          </View>
          {/* Reuse the business landing page piggy-bank treatment, scoped to this order. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Order savings ${savings ?? "unavailable"}. View savings details`}
            onPress={() => setShowOrderSavings(true)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "flex-end",
              gap: 4,
              paddingHorizontal: 9,
              minHeight: 38,
              borderRadius: 24,
              borderWidth: 1.5,
              borderColor: theme.colors.primary,
              backgroundColor: theme.colors.primarySoft,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <MaterialCommunityIcons
              name="piggy-bank"
              size={23}
              color="#E88BA7"
            />
            <Text
              variant="bodyStrong"
              numberOfLines={1}
              style={{
                color: theme.colors.primary,
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              {savings ?? "—"}
            </Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={14}
              color={theme.colors.primary}
            />
          </Pressable>
        </View>
        {/* Both actions follow the organization's primary theme, including icons. */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh order status"
            accessibilityState={{ disabled: busy || pullRefreshing }}
            disabled={busy || pullRefreshing}
            onPress={() => void refresh()}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: 7,
              borderWidth: 1,
              borderColor: theme.colors.primary,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.primarySoft,
              opacity: busy || pullRefreshing ? 0.6 : 1,
            }}
          >
            <Ionicons
              name="refresh-outline"
              size={19}
              color={theme.colors.primary}
            />
            <Text
              variant="bodySmall"
              color="primary"
              style={{ fontWeight: "600", textAlign: "center" }}
            >
              Refresh Status
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Contact support"
            onPress={() => router.push("/customer/support")}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: 7,
              borderWidth: 1,
              borderColor: theme.colors.primary,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.primarySoft,
            }}
          >
            <Ionicons
              name="headset-outline"
              size={19}
              color={theme.colors.primary}
            />
            <Text
              variant="bodySmall"
              color="primary"
              style={{ fontWeight: "600", textAlign: "center" }}
            >
              Contact Support
            </Text>
          </Pressable>
        </View>
        <Modal
          visible={showOrderSavings}
          onClose={() => setShowOrderSavings(false)}
          title="Savings on this order"
          maxWidth={420}
        >
          <View style={{ gap: 10 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <MaterialCommunityIcons
                name="piggy-bank"
                size={32}
                color="#E88BA7"
              />
              <Text variant="h2" color="success">
                {savings ?? "Not available"}
              </Text>
            </View>
            <Text variant="bodySmall" color="textMuted">
              {item.verifiedSavingsMinor != null
                ? "Verified net savings for this order."
                : orderSavingsMinor != null
                  ? "Applied discounts on this order, based on its Commerce pricing."
                  : "Savings have not yet been reported for this order."}
            </Text>
            {discount != null ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text variant="bodySmall">Applied discounts</Text>
                <Text variant="bodyStrong">
                  {formatTransactionMoney(discount, amountCurrency) ??
                    "Unavailable"}
                </Text>
              </View>
            ) : null}
            <Text variant="caption" color="textMuted">
              This amount relates only to {item.referenceNumber}; it is not your
              total savings across memberships.
            </Text>
          </View>
        </Modal>
        {/* Two-column store/status panel on mobile as well as web. The divider is
            intentionally visible at all widths, matching the approved design. */}
        <Card padding="md" style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "stretch" }}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 10, gap: 5 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={theme.colors.primary}
                />
                <Text variant="caption" color="textMuted">
                  Collection Store
                </Text>
              </View>
              <Text variant="bodyStrong">{item.storeName}</Text>
              {storeAddress ? (
                <Text variant="caption" style={{ flexShrink: 1 }}>
                  {storeAddress}
                </Text>
              ) : null}
              {storeAddress ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="View collection store on map"
                  onPress={openMap}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    minHeight: 34,
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={16}
                    color={theme.colors.primary}
                  />
                  <Text variant="caption" color="primary">
                    View on Map
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={{ width: 1, backgroundColor: theme.colors.border }} />

            <View style={{ flex: 1, minWidth: 0, paddingLeft: 10, gap: 5 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Ionicons
                  name="bag-handle-outline"
                  size={20}
                  color={theme.colors.primary}
                />
                <Text variant="caption" color="textMuted">
                  Order Status
                </Text>
              </View>
              <View
                style={{
                  alignSelf: "flex-start",
                  backgroundColor:
                    item.status === "READY"
                      ? theme.colors.successSoft
                      : theme.colors.primarySoft,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 16,
                }}
              >
                <Text
                  variant="caption"
                  color={item.status === "READY" ? "success" : "primary"}
                  style={{ fontWeight: "700" }}
                >
                  {statusLabels[item.status]}
                </Text>
              </View>
              {item.status === "PREPARING" ? (
                <Text variant="caption">We&apos;re preparing your order.</Text>
              ) : item.status === "PLACED" ? (
                <Text variant="caption">Your order has been placed.</Text>
              ) : item.status === "READY" ? (
                <Text variant="caption">Ready for collection.</Text>
              ) : null}
              {item.expectedCollectionAt && !terminal ? (
                <View style={{ gap: 2 }}>
                  <Text variant="caption" color="textMuted">
                    Estimated collection
                  </Text>
                  <Text variant="caption">
                    {localTime(item.expectedCollectionAt, item.timezone)}
                    {item.collectionWindowEndsAt
                      ? ` – ${localTime(item.collectionWindowEndsAt, item.timezone)}`
                      : ""}
                  </Text>
                </View>
              ) : null}
              {item.expectedCompletionAt && !terminal ? (
                <Text variant="caption" color="textMuted">
                  Estimated completion{" "}
                  {localTime(item.expectedCompletionAt, item.timezone)}
                </Text>
              ) : null}
              {item.fulfilledAt ? (
                <Text variant="caption" color="textMuted">
                  Fulfilled {localTime(item.fulfilledAt, item.timezone)}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>
        <FulfillmentPickupCard
          organizationId={organizationId}
          item={item}
          active={focused && appActive}
        />
        <View
          style={{
            flexDirection: contentWide ? "row" : "column",
            gap: 10,
            alignItems: "stretch",
          }}
        >
          {orderItems}
          {orderTotals}
        </View>
        <FulfillmentProgress item={item} compact confirmation={confirmation} />
        {failure ? (
          <Text variant="bodySmall" color="danger">
            {failure}
          </Text>
        ) : null}
        {timeline.length ? (
          <Card padding="sm" style={{ gap: 8 }}>
            <Button
              size="sm"
              variant="ghost"
              label={
                showTimeline ? "Hide Order Timeline" : "View Order Timeline"
              }
              onPress={() => setShowTimeline((value) => !value)}
            />
            {showTimeline
              ? timeline.map((entry) => (
                  <Text key={entry.id} variant="caption" color="textMuted">
                    {timelineLabels[entry.type]} ·{" "}
                    {localTime(entry.at, item.timezone)}
                    {entry.previousAt
                      ? ` · Previous ${localTime(entry.previousAt, item.timezone)}`
                      : ""}
                    {entry.proposedAt
                      ? ` · Proposed ${localTime(entry.proposedAt, item.timezone)}`
                      : ""}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </Text>
                ))
              : null}
          </Card>
        ) : null}
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
        {item.canRequestCollectionChange || item.canRequestCancellation ? (
          <Card padding="sm" style={{ gap: 8 }}>
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
          </Card>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            gap: 7,
            alignItems: "center",
            paddingVertical: 4,
          }}
        >
          <Ionicons
            name="refresh-outline"
            size={15}
            color={theme.colors.textMuted}
          />
          <Text variant="caption" color="textMuted">
            Last updated: {lastUpdatedAt.toLocaleString()}
          </Text>
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
      </View>
    </FulfillmentPage>
  );
}
