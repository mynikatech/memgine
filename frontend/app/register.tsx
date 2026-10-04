import { Redirect, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { services, type CountryReference } from "@/src/core";
import { useAuth } from "@/src/providers";
import { Button, Input, PhoneField, Text, type PhoneValue } from "@/src/ui";

export default function RegisterScreen() {
  const router = useRouter();
  const auth = useAuth();

  const [countries, setCountries] = useState<CountryReference[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<PhoneValue>({
    countryId: "",
    callingCode: "+1",
    number: "",
  });
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void services.referenceData.listCountries().then((items) => {
      const active = items.filter((country) => country.active);
      setCountries(active);

      const defaultCountry =
        active.find((country) => country.countryCode === "CA") ??
        active.find((country) => country.countryCode === "IN") ??
        active[0];

      if (defaultCountry) {
        setPhone((current) => ({
          ...current,
          countryId: defaultCountry.id,
          callingCode: defaultCountry.callingCode,
        }));
      }
    });
  }, []);

  const selectedCountry = useMemo(
    () => countries.find((country) => country.id === phone.countryId),
    [countries, phone.countryId],
  );

  if (!auth.loading && auth.session) {
    return <Redirect href={APP_ROUTES.customer.cards as never} />;
  }

  const regionCode = selectedCountry?.countryCode ?? "CA";

  const requestOtp = async () => {
    setBusy(true);
    setError(null);

    try {
      const challenge = await auth.requestRegistrationOtp(
        phone.number,
        regionCode,
      );
      setChallengeId(challenge.challengeId);
      setDevCode(challenge.devCode ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Registration could not be started.",
      );
    } finally {
      setBusy(false);
    }
  };

  const completeRegistration = async () => {
    if (!challengeId) return;

    setBusy(true);
    setError(null);

    try {
      await auth.verifyRegistrationOtp(
        challengeId,
        otp,
        firstName.trim(),
        lastName.trim(),
        email.trim() || undefined,
      );

      if (Platform.OS !== "web") {
        await auth.setMobileSessionMode("customer");
      }

      router.replace(APP_ROUTES.customer.cards as never);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Registration could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const validDetails =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    phone.number.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text variant="title">Join Memgine</Text>

          <Text color="textMuted">
            Create your Memgine account to discover businesses, join
            memberships and keep your membership cards in one place.
          </Text>

          {!challengeId ? (
            <>
              <Input
                label="First name"
                required
                value={firstName}
                onChangeText={setFirstName}
                testID="register-first-name"
              />

              <Input
                label="Last name"
                required
                value={lastName}
                onChangeText={setLastName}
                testID="register-last-name"
              />

              <Input
                label="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                testID="register-email"
              />

              <PhoneField
                label="Mobile number"
                required
                value={phone}
                countries={countries}
                onChange={setPhone}
                maxDigits={10}
                testID="register-phone"
              />

              <Button
                label={busy ? "Sending code…" : "Continue"}
                onPress={() => void requestOtp()}
                disabled={busy || !validDetails}
                fullWidth
              />
            </>
          ) : (
            <>
              <Text color="textMuted">
                Enter the verification code sent to your mobile number.
              </Text>

              <Input
                label="Verification code"
                required
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                maxLength={6}
                testID="register-otp"
              />

              {devCode ? (
                <Text color="textMuted">Development code: {devCode}</Text>
              ) : null}

              <Button
                label={busy ? "Joining…" : "Join Memgine"}
                onPress={() => void completeRegistration()}
                disabled={busy || otp.length !== 6}
                fullWidth
              />

              <Button
                label="Change details"
                variant="ghost"
                onPress={() => {
                  setChallengeId(null);
                  setOtp("");
                  setDevCode(null);
                  setError(null);
                }}
              />
            </>
          )}

          {error ? <Text color="danger">{error}</Text> : null}

          <View style={styles.signInRow}>
            <Text color="textMuted">Already have a Memgine account?</Text>
            <Pressable onPress={() => router.replace(APP_ROUTES.login as never)}>
              <Text color="primary">Sign in</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 64,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 28,
    gap: 18,
    borderWidth: 1,
    borderColor: "#E4E7EB",
  },
  signInRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
});
