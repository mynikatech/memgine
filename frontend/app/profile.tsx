import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { Button, Input, Text } from "@/src/ui";

export default function ProfileScreen() {
  const router = useRouter();
  const auth = useAuth();

  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  if (auth.loading) {
    return (
      <View style={styles.page}>
        <Text>Loading profile…</Text>
      </View>
    );
  }

  if (!auth.session) {
    return <Redirect href={APP_ROUTES.login} />;
  }

  const savePassword = async () => {
    setMessage(null);

    try {
      await auth.setPassword(password);
      setPassword("");
      setMessage("Password updated.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Password update failed.",
      );
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View>
            <Text variant="title">Profile</Text>
            <Text color="textMuted">{auth.session.displayName}</Text>
          </View>

          <Button
            label="Back"
            variant="outline"
            onPress={() => router.back()}
          />
        </View>

        <View style={styles.card}>
          <Text variant="bodyStrong">Password</Text>

          <Text color="textMuted">
            Set or update the password used for phone and password sign-in.
          </Text>

          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="New password"
          />

          <Button
            label="Save password"
            onPress={() => void savePassword()}
            disabled={!password}
          />

          {message ? (
            <Text
              color={message === "Password updated." ? "success" : "danger"}
            >
              {message}
            </Text>
          ) : null}
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
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E4E7EB",
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
});
