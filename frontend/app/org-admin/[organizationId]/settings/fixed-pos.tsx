import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { services } from "@/src/core";
import { APP_ROUTES } from "@/src/constants/navigation";
import { posApi, type PosDevice, type PoyntPairingCode } from "@/src/data/api/pos-api";
import { useAuth } from "@/src/providers";
import {
  Button,
  Card,
  Header,
  ReferenceSelect,
  StateView,
  Text,
} from "@/src/ui";

export default function FixedPosConfiguration() {
  const { organizationId } = useLocalSearchParams<{ organizationId: string }>();

  const router = useRouter();
  const { hasCapability, logout } = useAuth();

  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);

  const [devices, setDevices] = useState<PosDevice[]>([]);
  const [storeId, setStoreId] = useState("");
  const [name, setName] = useState("");
  const [poyntStoreId, setPoyntStoreId] = useState("");
  const [poyntPairing, setPoyntPairing] = useState<PoyntPairingCode | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const [storeRows, deviceResult] = await Promise.all([
        services.organization.listStores(organizationId),
        posApi.list(organizationId),
      ]);

      setStores(
        storeRows
          .filter((store) => !store.isDeleted)
          .map((store) => ({
            id: store.id,
            name: store.name,
          })),
      );

      if (deviceResult.success) {
        setDevices(deviceResult.data);
      } else {
        setError(deviceResult.error.message);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load fixed POS devices.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) {
      void load();
    }
  }, [organizationId]);

  if (!organizationId) {
    return (
      <StateView
        kind="error"
        title="Organization unavailable"
        message="Organization id is required."
      />
    );
  }

  if (!hasCapability("ORG_ADMIN_ACCESS", organizationId)) {
    return (
      <StateView
        kind="error"
        title="Access denied"
        message="Fixed POS configuration requires Organization Admin access."
      />
    );
  }

  const register = async () => {
    setError("");

    const result = await posApi.register(organizationId, storeId, name.trim());

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    await logout();

    router.replace(APP_ROUTES.counterUnlock);
  };

  const revoke = async (deviceId: string) => {
    setError("");

    const result = await posApi.revoke(organizationId, deviceId);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    await load();
  };

  const createPoyntPairingCode = async () => {
    setError("");
    setPoyntPairing(null);
    const result = await posApi.createPoyntPairingCode(organizationId, poyntStoreId);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setPoyntPairing(result.data);
  };

  return (
    <View style={{ padding: 24, gap: 16 }}>
      <Header
        title="Fixed POS Devices"
        subtitle="Register and manage fixed counter devices for this organization."
      />

      <Card padding="md">
        <Text variant="title">Register this device</Text>

        <Text color="textMuted">
          Register this browser as a fixed POS for one store.
        </Text>

        <ReferenceSelect
          label="Store"
          value={storeId}
          items={stores}
          onChange={setStoreId}
          placeholder="Select store"
        />

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Device name"
          style={{
            borderWidth: 1,
            borderColor: "#CBD5E1",
            padding: 10,
            borderRadius: 8,
          }}
        />

        <Button
          label="Register this device as POS"
          onPress={() => void register()}
          disabled={!storeId || !name.trim()}
        />
      </Card>

      <Card padding="md">
        <Text variant="title">Pair a Poynt terminal</Text>
        <Text color="textMuted">
          Generate a one-time code for the Poynt terminal. The code fixes that terminal to this organization and store.
        </Text>

        <ReferenceSelect
          label="Store"
          value={poyntStoreId}
          items={stores}
          onChange={setPoyntStoreId}
          placeholder="Select store"
        />

        <Button
          label="Generate Poynt pairing code"
          onPress={() => void createPoyntPairingCode()}
          disabled={!poyntStoreId}
        />

        {poyntPairing ? (
          <View style={{ gap: 4 }}>
            <Text variant="title">{poyntPairing.pairingCode}</Text>
            <Text color="textMuted">
              Enter this code on the Poynt terminal. It expires at {poyntPairing.expiresAt} and can be used once.
            </Text>
          </View>
        ) : null}
      </Card>

      {loading ? (
        <StateView kind="loading" message="Loading fixed POS devices…" />
      ) : (
        devices.map((device) => (
          <Card key={device.deviceId} padding="md">
            <Text variant="title">{device.deviceName}</Text>

            <Text color="textMuted">
              {device.storeName ?? device.storeId}
              {" · "}
              {device.revokedAt ? "Revoked" : "Active"}
            </Text>

            {!device.revokedAt ? (
              <Button
                label="Revoke"
                variant="secondary"
                onPress={() => void revoke(device.deviceId)}
              />
            ) : null}
          </Card>
        ))
      )}

      {error ? <Text color="danger">{error}</Text> : null}
    </View>
  );
}
