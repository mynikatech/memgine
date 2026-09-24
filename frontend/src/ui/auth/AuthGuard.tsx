import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { ReactNode } from "react";

import { unauthenticatedLanding } from "@/src/core/auth/auth-navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { COLORS } from "@/src/theme/colors";

export function AuthGuard({
  capability,
  organizationId,
  children,
}: {
  capability: string;
  organizationId?: string;
  children: ReactNode;
}) {
  const { loading, session, hasCapability } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href={unauthenticatedLanding() as never} />;
  }

  if (!hasCapability(capability, organizationId)) {
    return <Redirect href="/access-denied" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
