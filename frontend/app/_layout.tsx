import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { LogBox, Platform, Pressable, Text, View } from "react-native";

import { services } from "@/src/core";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import {
  BusinessProvider,
  AuthProvider,
  CustomerContextProvider,
  LocalizationProvider,
} from "@/src/providers";
import { CounterSessionProvider } from "@/src/core/services/counter-session-context";

import { runPdmStatusIdMigrationV1 } from "../src/data/migrations/pdm-status-id-migration-v1";
import { runOrganizationStatusIdMigrationV2 } from "../src/data/migrations/organization-status-id-migration-v2";

if (Platform.OS === "web") {
  runPdmStatusIdMigrationV1();
  runOrganizationStatusIdMigrationV2();
}
// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [referenceDataState, setReferenceDataState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [referenceDataError, setReferenceDataError] = useState<string | null>(
    null,
  );
  const [retryToken, setRetryToken] = useState(0);
  const templateRefreshStarted = useRef(false);

  useEffect(() => {
    if ((loaded || error) && referenceDataState !== "loading") {
      void SplashScreen.hideAsync();
    }
  }, [loaded, error, referenceDataState]);

  useEffect(() => {
    if (!loaded && !error) {
      return;
    }

    let cancelled = false;

    async function initializeReferenceData() {
      setReferenceDataState("loading");
      setReferenceDataError(null);

      if (!templateRefreshStarted.current) {
        templateRefreshStarted.current = true;
        void services.template.refresh().catch((templateError) => {
          console.error("Failed to refresh templates:", templateError);
        });
      }

      try {
        await Promise.all([
          services.referenceData.initialize(),
          services.status.initialize(),
        ]);

        if (!cancelled) {
          setReferenceDataState("ready");
        }
      } catch (initializationError) {
        if (!cancelled) {
          setReferenceDataState("error");
          setReferenceDataError(
            initializationError instanceof Error
              ? initializationError.message
              : "Unable to load application reference data.",
          );
        }
      }
    }

    void initializeReferenceData();

    return () => {
      cancelled = true;
    };
  }, [loaded, error, retryToken]);

  // If the CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!loaded && !error) return null;

  if (referenceDataState === "loading") return null;

  if (referenceDataState === "error") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text style={{ marginBottom: 16, textAlign: "center" }}>
          {referenceDataError ?? "Unable to load application reference data."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setRetryToken((value) => value + 1)}
          style={{ paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <Text>Retry</Text>
        </Pressable>
      </View>
    );
  }

  // Reusable foundation providers (Stage 2B). Business context + localization
  // are available to all routes; the Stage 1 navigation shells are unchanged.
  return (
    <AuthProvider>
      <BusinessProvider>
        <LocalizationProvider>
        <CustomerContextProvider>
          <CounterSessionProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </CounterSessionProvider>
        </CustomerContextProvider>
        </LocalizationProvider>
      </BusinessProvider>
    </AuthProvider>
  );
}
