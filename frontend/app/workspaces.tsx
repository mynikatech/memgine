import { Redirect, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { authWorkspaces, unauthenticatedLanding } from "@/src/core/auth/auth-navigation";
import { APP_ROUTES } from "@/src/constants/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { Button, Text } from "@/src/ui";

export default function WorkspacesScreen() {
  const router = useRouter();
  const auth = useAuth();

  if (auth.loading) {
    return (
      <View style={styles.page}>
        <Text>Loading your access…</Text>
      </View>
    );
  }

  if (!auth.session) {
    return <Redirect href={unauthenticatedLanding() as never} />;
  }

  const workspaces = authWorkspaces(auth.session);

  return (
    <View style={styles.page}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View>
            <Text variant="title">Choose a workspace</Text>
            <Text color="textMuted">
              Signed in as {auth.session.displayName}
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              label="Profile"
              variant="outline"
              onPress={() => router.push("/profile" as never)}
            />

            <Button
              label="Sign out"
              variant="outline"
              onPress={() =>
                void auth
                  .logout()
                  .then(() => router.replace(unauthenticatedLanding() as never))
              }
            />
          </View>
        </View>

        {workspaces.length ? (
          workspaces.map((workspace) => (
            <Pressable
              key={workspace.key}
              onPress={() => router.push(workspace.href as never)}
              style={styles.workspace}
            >
              <Text variant="bodyStrong">{workspace.title}</Text>
              <Text color="textMuted">{workspace.subtitle}</Text>
            </Pressable>
          ))
        ) : (
          <Text color="danger">
            No active web workspace is assigned to this account.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#F5F6F8",
    alignItems: "center",
    padding: 32,
  },
  panel: {
    width: "100%",
    maxWidth: 720,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  workspace: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E4E7EB",
    borderRadius: 12,
    padding: 20,
    gap: 4,
  },
});
