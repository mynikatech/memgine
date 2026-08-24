import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";

import { services } from "@/src/core";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import {
  BusinessProvider,
  CustomerContextProvider,
  LocalizationProvider,
} from "@/src/providers";

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

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  useEffect(() => {
    if (!loaded && !error) {
      return;
    }

    async function refreshReferenceData() {
      try {
        await Promise.all([
          services.referenceData.refresh(),
          services.template.refresh(),
        ]);
        console.log("Reference data refreshed successfully.");
      } catch (refreshError) {
        console.error("Failed to refresh reference data:", refreshError);
      }
    }

    void refreshReferenceData();
  }, [loaded, error]);

  // If the CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!loaded && !error) return null;

  // Reusable foundation providers (Stage 2B). Business context + localization
  // are available to all routes; the Stage 1 navigation shells are unchanged.
  return (
    <BusinessProvider>
      <LocalizationProvider>
        <CustomerContextProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </CustomerContextProvider>
      </LocalizationProvider>
    </BusinessProvider>
  );
}
