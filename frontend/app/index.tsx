import { Redirect } from "expo-router";
import { Platform } from "react-native";
import { APP_ROUTES } from "@/src/constants/navigation";
import { landingFor } from "@/src/core/auth/auth-navigation";
import { useAuth } from "@/src/providers";

/**
 * Platform-based entry router.
 * - Web/desktop  -> Staff workstation shell
 * - Native (iOS/Android) -> Customer mobile shell
 */
export default function Index() {
  const auth = useAuth();
  if (Platform.OS === "web") {
    return <Redirect href={APP_ROUTES.workspaces} />;
  }
  if (auth.loading) return null;
  if (!auth.session) return <Redirect href={APP_ROUTES.mobileEntry} />;
  return <Redirect href={(auth.mobileSessionMode === "business" ? landingFor(auth.session) : APP_ROUTES.customer.cards) as never} />;
}
