import { useEffect, useRef, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { PoyntCollectBootstrap } from "@/src/data/api/customer-data-api";
import { Button, Text } from "@/src/ui";

type CollectMountOptions = {
  iFrame?: { width?: string; height?: string; border?: string };
  locale?: string;
  style?: { theme?: "default" | "customer" | "ecommerce" };
  displayComponents?: {
    firstName?: boolean;
    lastName?: boolean;
    labels?: boolean;
  };
  inlineErrors?: boolean;
  customCss?: Record<string, string | Record<string, string>>;
};

type CollectInstance = {
  mount: (
    elementId: string,
    document: Document,
    options: CollectMountOptions,
  ) => void;
  unmount: (elementId: string, document: Document) => void;
  on: (event: string, callback: (event: unknown) => void) => void;
  getNonce: (payload: Record<string, never>) => void;
};

type CollectConstructor = new (
  businessId: string,
  applicationId: string,
) => CollectInstance;
type CollectWindow = Window & { TokenizeJs?: CollectConstructor };

type CollectErrorDetail = {
  source?: unknown;
  type?: unknown;
  code?: unknown;
  error?: unknown;
};

// Deliberate allowlist: the API must not be able to inject an arbitrary script URL.
const APPROVED_SDK_URLS = new Set([
  "https://collect.commerce.godaddy.com/sdk.js",
  "https://collect.commerce.ote-godaddy.com/sdk.js",
]);

const sdkLoads = new Map<string, Promise<void>>();
const CardHost = "div" as any;
let nextHostId = 0;

function loadSdk(sdkUrl: string): Promise<void> {
  if (!APPROVED_SDK_URLS.has(sdkUrl)) {
    return Promise.reject(new Error("Secure card entry is unavailable."));
  }
  const existing = sdkLoads.get(sdkUrl);
  if (existing) return existing;

  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = sdkUrl;
    script.async = true;
    script.onload = () => {
      if ((window as CollectWindow).TokenizeJs) resolve();
      else {
        script.remove();
        reject(new Error("Secure card entry is unavailable."));
      }
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Secure card entry could not be loaded."));
    };
    document.head.appendChild(script);
  });
  sdkLoads.set(sdkUrl, loading);
  void loading.catch(() => sdkLoads.delete(sdkUrl));
  return loading;
}

function DecorativePaymentCard() {
  return (
    <View style={cardStyles.container}>
      <View style={cardStyles.card}>
        {/* Decorative circles */}
        <View style={cardStyles.circleOne} />
        <View style={cardStyles.circleTwo} />

        {/* Header */}
        <View style={cardStyles.header}>
          <Text style={cardStyles.brand}>MEMGINE</Text>
          <Ionicons
            name="wifi-outline"
            size={23}
            color="#FFFFFF"
            style={{ transform: [{ rotate: "90deg" }] }}
          />
        </View>

        {/* Chip */}
        <View style={cardStyles.chip}>
          <View style={cardStyles.chipVertical} />
          <View style={cardStyles.chipHorizontal} />
        </View>

        {/* Fake card number */}
        <Text style={cardStyles.number}>•••• •••• •••• 3456</Text>

        {/* Footer */}
        <View style={cardStyles.footer}>
          <View style={{ gap: 3 }}>
            <Text style={cardStyles.fieldLabel}>CARDHOLDER</Text>
            <Text style={cardStyles.fieldValue}>LEE M. CARDHOLDER</Text>
          </View>

          <View style={{ gap: 3 }}>
            <Text style={cardStyles.fieldLabel}>EXPIRES</Text>
            <Text style={cardStyles.fieldValue}>12/29</Text>
          </View>

          {/* Decorative card-network circles */}
          <View style={cardStyles.network}>
            <View style={cardStyles.networkRed} />
            <View style={cardStyles.networkGold} />
          </View>
        </View>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 12,
  },

  card: {
    width: "100%",
    maxWidth: 340,
    aspectRatio: 1.65,
    borderRadius: 18,
    backgroundColor: "#172B41",
    padding: 22,
    justifyContent: "space-between",
    overflow: "hidden",

    ...Platform.select({
      web: {
        boxShadow: "0px 14px 28px rgba(12, 30, 51, 0.24)",
        backgroundImage:
          "linear-gradient(135deg, #243C54 0%, #142436 65%, #0D1928 100%)",
      } as any,
      default: {
        elevation: 7,
      },
    }),
  },

  circleOne: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    top: -140,
    right: -90,
  },

  circleTwo: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    bottom: -145,
    left: -85,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  brand: {
    color: "#F5F7FC",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 2,
  },

  chip: {
    width: 41,
    height: 31,
    backgroundColor: "#D7C49C",
    borderColor: "#B49A67",
    borderWidth: 1,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },

  chipVertical: {
    position: "absolute",
    height: "100%",
    width: 1,
    backgroundColor: "#B49A67",
  },

  chipHorizontal: {
    position: "absolute",
    width: "100%",
    height: 1,
    backgroundColor: "#B49A67",
  },

  number: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: 2,
  },

  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },

  fieldLabel: {
    color: "#AEBED0",
    fontSize: 8,
    letterSpacing: 1,
  },

  fieldValue: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  network: {
    flexDirection: "row",
    width: 45,
    height: 28,
    alignItems: "center",
  },

  networkRed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EB4034",
  },

  networkGold: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F5AD26",
    marginLeft: -11,
    opacity: 0.92,
  },
});

/**
 * Card-only Stage 1 checkout. Wallet support is intentionally NOT added here.
 * Poynt hosts all sensitive inputs; Memgine receives only the payment nonce.
 */
export function PoyntCollectCardForm({
  configuration,
  onNonce,
  onBack,
  payLabel,
}: {
  configuration: PoyntCollectBootstrap;
  onNonce: (nonce: string) => Promise<void>;
  onBack: () => void;
  payLabel: string;
}) {
  const hostId = useRef(`memgine-collect-${++nextHostId}`).current;
  const instance = useRef<CollectInstance | null>(null);
  const busy = useRef(false);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let active = true;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    setReady(false);
    setError(undefined);

    void loadSdk(configuration.sdkUrl)
      .then(() => {
        if (!active) return;
        try {
          const Constructor = (window as CollectWindow).TokenizeJs;
          if (!Constructor) throw new Error("Collect constructor unavailable");
          const collect = new Constructor(
            configuration.businessId,
            configuration.applicationId,
          );
          instance.current = collect;

          collect.on("ready", () => {
            if (!active) return;
            if (readyTimer) clearTimeout(readyTimer);
            setReady(true);
            setError(undefined);
          });

          collect.on("iframe_height_change", (event: unknown) => {
            if (!active) return;
            const height = (event as { data?: { height?: unknown } })?.data
              ?.height;
            if (typeof height !== "number" || !Number.isFinite(height)) return;
            // Resize the parent-owned iframe only. Never access its cross-origin contents.
            const frame = document
              .getElementById(hostId)
              ?.querySelector("iframe");
            if (frame)
              frame.style.height = `${Math.max(180, Math.min(600, Math.ceil(height) + 8))}px`;
          });

          collect.on("error", (event: unknown) => {
            if (!active) return;
            const outer = event as { data?: CollectErrorDetail };
            const data = outer?.data;
            const nested =
              data?.error && typeof data.error === "object"
                ? (data.error as CollectErrorDetail)
                : undefined;
            const source = nested?.source ?? data?.source;
            const type = nested?.type ?? data?.type;

            // Poynt documents validation events on field focus/blur. Display them
            // inside Poynt via inlineErrors; do not mistake them for SDK failure.
            if (
              !busy.current &&
              (source === "field" ||
                type === "invalid_details" ||
                type === "missing_fields")
            )
              return;

            const wasSubmitting = busy.current;
            busy.current = false;
            setSubmitting(false);
            setError(
              wasSubmitting
                ? "Please check the card details and try again. No payment has been confirmed."
                : "Secure card entry encountered an error. Please retry or reload the checkout.",
            );
          });

          collect.on("nonce", (event: unknown) => {
            if (!active || !busy.current) return;
            const nonce = (event as { data?: { nonce?: unknown } })?.data
              ?.nonce;
            if (typeof nonce !== "string" || !nonce) {
              busy.current = false;
              setSubmitting(false);
              setError(
                "Card verification could not be completed. Please try again.",
              );
              return;
            }
            busy.current = false;
            void onNonce(nonce).finally(() => {
              if (active) setSubmitting(false);
            });
          });

          readyTimer = setTimeout(() => {
            if (active)
              setError(
                "Secure card entry did not become ready. Please try again later.",
              );
          }, 15_000);

          collect.mount(hostId, document, {
            iFrame: { width: "100%", height: "auto", border: "0px" },
            style: { theme: "ecommerce" },
            displayComponents: {
              firstName: true,
              lastName: true,
              labels: true,
            },
            inlineErrors: true,
          });
        } catch {
          if (readyTimer) clearTimeout(readyTimer);
          if (active) {
            setReady(false);
            setError(
              "Secure card entry could not be initialized. Please try again later.",
            );
          }
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Secure card entry could not be loaded. Please try again later.",
          );
      });

    return () => {
      active = false;
      if (readyTimer) clearTimeout(readyTimer);
      try {
        instance.current?.unmount(hostId, document);
      } catch {
        /* SDK may not have mounted. */
      }
      instance.current = null;
    };
  }, [
    configuration.sdkUrl,
    configuration.businessId,
    configuration.applicationId,
    hostId,
    onNonce,
  ]);

  return (
    <View style={{ gap: 14, minWidth: 0, width: "100%" }}>
      <DecorativePaymentCard />
      <CardHost
        id={hostId}
        aria-label="Secure card details"
        style={{
          display: "block",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          minHeight: 240,
          boxSizing: "border-box",
        }}
      />
      {error ? (
        <Text variant="bodySmall" color="danger">
          {error}
        </Text>
      ) : null}
      {!ready && !error ? (
        <Text variant="bodySmall" color="textMuted">
          Loading secure card fields…
        </Text>
      ) : null}
      <Button
        label={submitting ? "Processing payment..." : payLabel}
        fullWidth
        disabled={!ready || submitting || !!error}
        testID="join-collect-pay"
        onPress={() => {
          if (!instance.current || busy.current || !ready || error) return;
          busy.current = true;
          setSubmitting(true);
          setError(undefined);
          try {
            instance.current.getNonce({});
          } catch {
            busy.current = false;
            setSubmitting(false);
            setError(
              "Card verification could not be started. Please try again.",
            );
          }
        }}
      />
      <Button
        label="Cancel payment"
        variant="secondary"
        fullWidth
        disabled={submitting}
        onPress={onBack}
        testID="join-collect-back"
      />
    </View>
  );
}
