import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";

import type { PoyntCollectBootstrap } from "@/src/data/api/customer-data-api";
import { Button, Text } from "@/src/ui";

type CollectInstance = {
  mount: (elementId: string, document: Document, options: Record<string, never>) => void;
  unmount: (elementId: string, document: Document) => void;
  on: (event: string, callback: (event: unknown) => void) => void;
  getNonce: (payload: Record<string, never>) => void;
};

type CollectConstructor = new (businessId: string, applicationId: string) => CollectInstance;
type CollectWindow = Window & { TokenizeJs?: CollectConstructor };

const sdkLoads = new Map<string, Promise<void>>();
const CardHost = "div" as any;
let nextHostId = 0;

function loadSdk(sdkUrl: string): Promise<void> {
  if (sdkUrl !== "https://collect.commerce.godaddy.com/sdk.js" &&
      sdkUrl !== "https://collect.commerce.ote-godaddy.com/sdk.js") {
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
    void loadSdk(configuration.sdkUrl).then(() => {
      if (!active) return;
      try {
        const Constructor = (window as CollectWindow).TokenizeJs;
        if (!Constructor) throw new Error("Collect constructor unavailable");
        const collect = new Constructor(configuration.businessId, configuration.applicationId);
        instance.current = collect;
        collect.on("ready", () => {
          if (!active) return;
          if (readyTimer) clearTimeout(readyTimer);
          setReady(true);
          setError(undefined);
        });
        collect.on("error", () => {
          if (!active) return;
          const wasSubmitting = busy.current;
          busy.current = false;
          setSubmitting(false);
          setError(wasSubmitting
            ? "Card verification could not be completed. Please check the card details and try again."
            : "Secure card entry is unavailable. Please check the card details or try again.");
        });
        collect.on("nonce", (event: unknown) => {
          if (!active || !busy.current) return;
          const nonce = (event as { data?: { nonce?: unknown } })?.data?.nonce;
          if (typeof nonce !== "string" || !nonce) {
            busy.current = false;
            setSubmitting(false);
            setError("Card verification could not be completed. Please try again.");
            return;
          }
          // A single button press can submit only one nonce. The parent owns payment status.
          busy.current = false;
          void onNonce(nonce).finally(() => { if (active) setSubmitting(false); });
        });
        readyTimer = setTimeout(() => {
          if (active) setError("Secure card entry did not become ready. Please try again later.");
        }, 15_000);
        collect.mount(hostId, document, {});
      } catch {
        if (readyTimer) clearTimeout(readyTimer);
        if (active) setReady(false);
        if (active) setError("Secure card entry could not be initialized. Please try again later.");
      }
    }).catch(() => {
      if (active) setError("Secure card entry could not be loaded. Please try again later.");
    });
    return () => {
      active = false;
      if (readyTimer) clearTimeout(readyTimer);
      try { instance.current?.unmount(hostId, document); } catch { /* SDK may have failed before mounting. */ }
      instance.current = null;
    };
  }, [configuration.sdkUrl, configuration.businessId, configuration.applicationId, hostId, onNonce]);

  return (
    <View style={{ gap: 16 }}>
      <CardHost id={hostId} aria-label="Secure card details" style={{ minHeight: 180, width: "100%" }} />
      {error ? <Text variant="bodySmall" color="textMuted">{error}</Text> : null}
      <Button label={submitting ? "Processing payment..." : payLabel} fullWidth
        disabled={!ready || submitting} testID="join-collect-pay"
        onPress={() => {
          if (!instance.current || busy.current || !ready) return;
          busy.current = true;
          setSubmitting(true);
          setError(undefined);
          try { instance.current.getNonce({}); }
          catch {
            busy.current = false;
            setSubmitting(false);
            setError("Card verification could not be started. Please try again.");
          }
        }} />
      <Button label="Back" fullWidth disabled={submitting} onPress={onBack} testID="join-collect-back" />
    </View>
  );
}
