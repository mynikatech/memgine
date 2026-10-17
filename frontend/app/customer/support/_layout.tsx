import { Stack } from "expo-router";

/** The Support tab owns a stack: only its inbox is a customer destination. */
export default function CustomerSupportLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
