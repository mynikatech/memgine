import { Redirect, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { services, type CountryReference } from "@/src/core";
import { useAuth } from "@/src/providers";
import { Button, Input, PhoneField, Text, type PhoneValue } from "@/src/ui";

export default function CustomerLoginScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [countries, setCountries] = useState<CountryReference[]>([]);
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
      if (defaultCountry)
        setPhone((current) => ({
          ...current,
          countryId: defaultCountry.id,
          callingCode: defaultCountry.callingCode,
        }));
    });
  }, []);

  const country = useMemo(
    () => countries.find((item) => item.id === phone.countryId),
    [countries, phone.countryId],
  );
  const regionCode = country?.countryCode ?? "CA";
  if (!auth.loading && auth.session)
    return <Redirect href={APP_ROUTES.customer.cards} />;

  const requestOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      const challenge = await auth.requestCustomerOtp(phone.number, regionCode);
      setChallengeId(challenge.challengeId);
      setDevCode(challenge.devCode ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Login could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const verifyOtp = async () => {
    if (!challengeId) return;
    setBusy(true);
    setError(null);
    try {
      await auth.verifyCustomerOtp(challengeId, otp);
      router.replace(APP_ROUTES.customer.cards);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Login could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text variant="title">Your Memberships</Text>
        <Text color="textMuted">
          Sign in with your mobile number and one-time code.
        </Text>
        <PhoneField
          label="Mobile number"
          required
          value={phone}
          countries={countries}
          onChange={setPhone}
          maxDigits={10}
          testID="customer-login-phone"
        />
        {challengeId ? (
          <>
            <Input
              label="One-time code"
              required
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              testID="customer-login-otp"
            />
            {devCode ? (
              <Text color="textMuted">Development code: {devCode}</Text>
            ) : null}
            <Button
              label={busy ? "Verifying…" : "Verify code"}
              onPress={() => void verifyOtp()}
              disabled={busy || otp.length !== 6}
              fullWidth
            />
            <Button
              label="Use another number"
              variant="ghost"
              onPress={() => {
                setChallengeId(null);
                setOtp("");
                setDevCode(null);
              }}
            />
          </>
        ) : (
          <Button
            label={busy ? "Sending…" : "Send code"}
            onPress={() => void requestOtp()}
            disabled={busy || !phone.number}
            fullWidth
          />
        )}
        {error ? <Text color="danger">{error}</Text> : null}
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
    padding: 24,
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
});
