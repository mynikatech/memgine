import { Redirect } from "expo-router";
import { Platform } from "react-native";

/**
 * Platform-based entry router.
 * - Web/desktop  -> Staff workstation shell
 * - Native (iOS/Android) -> Customer mobile shell
 */
export default function Index() {
  if (Platform.OS === "web") {
    return <Redirect href="/staff/counter" />;
  }
  return <Redirect href="/cards" />;
}
