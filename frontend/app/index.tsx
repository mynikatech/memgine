import { Redirect } from "expo-router";
import { Platform } from "react-native";
import { APP_ROUTES } from "@/src/constants/navigation";

/**
 * Platform-based entry router.
 * - Web/desktop  -> Staff workstation shell
 * - Native (iOS/Android) -> Customer mobile shell
 */
export default function Index() {
  if (Platform.OS === "web") {
    return <Redirect href={APP_ROUTES.counter.root} />;
  }
  return <Redirect href={APP_ROUTES.customer.cards} />;
}
