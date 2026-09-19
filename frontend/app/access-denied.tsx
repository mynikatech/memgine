import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { Button, Text } from "@/src/ui";

export default function AccessDeniedScreen() {
  const router = useRouter();
  const auth = useAuth();

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text variant="title">Access denied</Text>

        <Text color="textMuted">
          You do not have permission to access this workspace.
        </Text>

        {auth.session ? (
          <Text color="textMuted">Signed in as {auth.session.displayName}</Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Back to workspaces"
            onPress={() => router.replace(APP_ROUTES.workspaces as never)}
          />

          <Button
            label="Sign out"
            variant="outline"
            onPress={() =>
              void auth
                .logout()
                .then(() => router.replace(APP_ROUTES.login as never))
            }
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#F5F6F8",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E4E7EB",
    borderRadius: 12,
    padding: 24,
    gap: 16,
  },
  actions: {
    gap: 8,
  },
});
