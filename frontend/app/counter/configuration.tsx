import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { services } from "@/src/core";
import { APP_ROUTES } from "@/src/constants/navigation";
import { posApi, type PosDevice } from "@/src/data/api/pos-api";
import { useAuth, useBusiness } from "@/src/providers";
import { Button, Card, Header, ReferenceSelect, StateView, Text } from "@/src/ui";

export default function FixedPosConfiguration() {
  const { organization } = useBusiness(); const { organizationId } = useLocalSearchParams<{ organizationId?: string }>(); const org = organizationId ?? organization.id;
  const router = useRouter(); const { hasCapability, logout } = useAuth();
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]); const [devices, setDevices] = useState<PosDevice[]>([]); const [storeId, setStoreId] = useState(""); const [name, setName] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const [rows, result] = await Promise.all([services.organization.listStores(org), posApi.list(org)]); setStores(rows.filter((s) => !s.isDeleted).map((s) => ({ id: s.id, name: s.name }))); if (result.success) setDevices(result.data); else setError(result.error.message); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load fixed POS devices."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [org]);
  if (!hasCapability("ORG_ADMIN_ACCESS", org)) return <StateView kind="error" title="Access denied" message="Fixed POS configuration requires Organization Admin access." />;
  const register = async () => { setError(""); const result = await posApi.register(org, storeId, name); if (!result.success) { setError(result.error.message); return; } await logout(); router.replace(APP_ROUTES.counterUnlock); };
  const revoke = async (id: string) => { const result = await posApi.revoke(org, id); if (!result.success) setError(result.error.message); else void load(); };
  return <View style={{ padding: 24, gap: 16 }}><Header title="Fixed POS" subtitle="Register this browser for one store." /><Card padding="md"><ReferenceSelect label="Store" value={storeId} items={stores} onChange={setStoreId} placeholder="Select store" /><TextInput value={name} onChangeText={setName} placeholder="Device name" style={{ borderWidth: 1, borderColor: "#CBD5E1", padding: 10, borderRadius: 8 }} /><Button label="Register this device as POS" onPress={() => void register()} disabled={!storeId || !name.trim()} /></Card>{loading ? <StateView kind="loading" message="Loading…" /> : devices.map((device) => <Card key={device.deviceId} padding="md"><Text variant="title">{device.deviceName}</Text><Text color="textMuted">{device.storeName ?? device.storeId} · {device.revokedAt ? "Revoked" : "Active"}</Text>{!device.revokedAt ? <Button label="Revoke" variant="secondary" onPress={() => void revoke(device.deviceId)} /> : null}</Card>)}{error ? <Text color="danger">{error}</Text> : null}</View>;
}
