import { Redirect, useRouter } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { landingFor } from "@/src/core/auth/auth-navigation";
import { useAuth } from "@/src/providers";
import { Button, Text } from "@/src/ui";

/** Native-only neutral entry. Web continues to use the normal /login route. */
export default function MobileEntryScreen() {
  const router = useRouter();
  const auth = useAuth();

  if (Platform.OS === "web") return <Redirect href={APP_ROUTES.login} />;
  if (auth.loading) return <View style={styles.page}><Text>Restoring your session…</Text></View>;
  if (auth.session) return <Redirect href={(auth.mobileSessionMode === "business" ? landingFor(auth.session) : APP_ROUTES.customer.cards) as never} />;

  return <View style={styles.page}><View style={styles.card}>
    <Text variant="title">Welcome to Memgine</Text>
    <Text color="textMuted">Choose how you would like to sign in.</Text>
    <Button label="Customer Sign In" fullWidth onPress={() => router.push(APP_ROUTES.customerLogin as never)} />
    <Button label="Business / Staff Sign In" variant="outline" fullWidth onPress={() => router.push(APP_ROUTES.login as never)} />
  </View></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F5F6F8", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 480, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 28, gap: 18, borderWidth: 1, borderColor: "#E4E7EB" },
});
