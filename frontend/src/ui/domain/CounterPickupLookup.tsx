import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Modal as NativeModal, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CounterApi, type CounterContext } from "@/src/data/api/counter-api";
import { useTheme } from "@/src/providers";
import { Button, Card, Input, Modal, Text } from "@/src/ui";
import { createPickupAttemptGate, pickupLookupMessage, pickupOrderReference, pickupQrReference, requestPickupCameraAccess } from "./counter-pickup-model";

const api = new CounterApi();

export type CounterPickupMatch = { orderId: string; kind: "verified" | "reference" };

export function CounterPickupLookup({ mode, context, storeName, expectedOrderId, onClose, onMatch }: {
  mode: "scan" | "manual"; context: CounterContext; storeName: string; expectedOrderId?: string; onClose: () => void;
  onMatch: (match: CounterPickupMatch, credential?: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const web = Platform.OS === "web";
  const [permission, requestPermission] = useCameraPermissions();
  const [gate] = useState(createPickupAttemptGate);
  const [camera, setCamera] = useState(false);
  const [permissionPending, setPermissionPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [qrInput, setQrInput] = useState("");
  const [orderInput, setOrderInput] = useState("");
  const live = useRef(false);
  const awaitingPermission = useRef(false);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; gate.disarmCamera(); };
  }, [gate]);

  const startCamera = async () => {
    if (awaitingPermission.current || busy) return;
    awaitingPermission.current = true;
    setPermissionPending(true);
    setError(undefined);
    setNotice(undefined);
    const supportsWebCamera = web && typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
    const access = await requestPickupCameraAccess(web, supportsWebCamera, permission, requestPermission);
    awaitingPermission.current = false;
    if (!live.current) return;
    setPermissionPending(false);
    if (access !== "granted") {
      setNotice(access === "denied" ? "Camera permission was denied. Allow it in settings or enter the QR reference below." :
        "The camera is unavailable. Use a keyboard scanner or enter the QR reference below.");
      return;
    }
    gate.armCamera();
    setCamera(true);
  };

  const submit = async (kind: "qr" | "reference", raw: string, source: "manual" | "camera" = "manual") => {
    if (!gate.begin(source)) return;
    setCamera(false);
    setError(undefined);
    setBusy(true);
    if (kind === "qr") setQrInput("");
    try {
      const value = kind === "qr" ? pickupQrReference(raw) : pickupOrderReference(raw);
      if (!value) {
        setError(kind === "qr" ? "Unsupported pickup QR. Scan the QR from the customer's order. Use Counter redemption for membership QRs." :
          "Enter the order reference shown on the customer's order.");
        return;
      }
      const result = kind === "qr" ? await api.verifyPickupQr(context, value) : await api.lookupPickupOrderReference(context, value);
      if (!live.current) return;
      if (!result.success) { setError(pickupLookupMessage(result.error.code)); return; }
      const match = result.data;
      if ((match.code === "VERIFIED" || match.code === "LOCATED") && match.orderId) {
        if (expectedOrderId && match.orderId !== expectedOrderId) {
          setError("This pickup QR belongs to a different order. Ask for the QR for the selected order.");
          return;
        }
        onMatch({ orderId: match.orderId, kind: match.code === "VERIFIED" ? "verified" : "reference" },
          match.code === "VERIFIED" && kind === "qr" ? value : undefined);
      } else setError(pickupLookupMessage(match.code));
    } catch {
      if (live.current) setError("Could not complete pickup lookup. Try again.");
    } finally {
      gate.finish();
      if (live.current) setBusy(false);
    }
  };

  const title = mode === "scan" ? "Scan Pickup QR" : "Enter Pickup Code";
  const content = <View style={{ gap: 12 }}>
    <Text variant="bodySmall" color="textMuted">Store · {storeName}</Text>
    {mode === "scan" ? <>
      <Text>Ask the customer to open the pickup QR in their order. Keep the whole QR inside the camera view.</Text>
      {camera ? <>
        <View style={{ width: "100%", height: web ? 250 : 300, overflow: "hidden", borderRadius: theme.radius.md }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => { void submit("qr", data, "camera"); }}
            onMountError={() => {
              gate.disarmCamera();
              setCamera(false);
              setNotice("The camera could not start. Use a keyboard scanner or enter the QR reference below.");
            }} />
        </View>
        <Button label="Stop camera" variant="ghost" onPress={() => { gate.disarmCamera(); setCamera(false); }} />
      </> : <Button label={permissionPending ? "Requesting camera access…" : "Use camera"} disabled={busy || permissionPending} onPress={() => void startCamera()} />}
    </> : <Text>Customers receive a pickup QR. Paste its reference to verify it, or use the order reference to find the order.</Text>}
    {notice ? <Text accessibilityLiveRegion="polite" variant="bodySmall" color="textMuted">{notice}</Text> : null}
    {error ? <Text accessibilityLiveRegion="polite" variant="bodySmall" color="danger">{error}</Text> : null}
    {busy ? <Text accessibilityLiveRegion="polite" variant="bodySmall">Checking pickup…</Text> : null}
    <Card padding="md" elevation="none" style={{ gap: 8 }}>
      <Input label="Pickup QR reference" placeholder="Scan with a keyboard scanner or paste" value={qrInput}
        onChangeText={setQrInput} autoFocus={web} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128}
        editable={!busy && !permissionPending} returnKeyType="go" onSubmitEditing={() => void submit("qr", qrInput)} />
      <Button variant="outline" label="Verify pickup QR" disabled={busy || permissionPending || !qrInput.trim()} onPress={() => void submit("qr", qrInput)} />
    </Card>
    {!expectedOrderId ? <Card padding="md" elevation="none" style={{ gap: 8 }}>
      <Input label="Order reference" value={orderInput} onChangeText={setOrderInput} autoCorrect={false} maxLength={65}
        editable={!busy && !permissionPending} returnKeyType="search" onSubmitEditing={() => void submit("reference", orderInput)} />
      <Text variant="caption" color="textMuted">Order lookup identifies an order. It does not verify pickup.</Text>
      <Button variant="outline" label="Find order" disabled={busy || permissionPending || !orderInput.trim()} onPress={() => void submit("reference", orderInput)} />
    </Card> : null}
  </View>;

  if (web) return <Modal visible onClose={onClose} title={title} maxWidth={560} scrollable>{content}</Modal>;
  return <NativeModal visible presentationStyle="fullScreen" animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12 }}>
        <Button label="Back" variant="ghost" onPress={onClose} /><Text variant="title" accessibilityRole="header">{title}</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}>{content}</ScrollView>
    </View>
  </NativeModal>;
}
