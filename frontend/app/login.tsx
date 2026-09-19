import { Redirect, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { services, type CountryReference } from "@/src/core";
import { landingFor } from "@/src/core/auth/auth-navigation";
import { APP_ROUTES } from "@/src/constants/navigation";
import { useAuth } from "@/src/providers/AuthProvider";
import { Button, Input, PhoneField, Text, type PhoneValue } from "@/src/ui";

type LoginMode = "password" | "otp";

export default function LoginScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [mode, setMode] = useState<LoginMode>("password");
  const [countries, setCountries] = useState<CountryReference[]>([]);
  const [phone, setPhone] = useState<PhoneValue>({ countryId: "", callingCode: "+1", number: "" });
  const [password, setPassword] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void services.referenceData.listCountries().then((items) => {
      const active = items.filter((country) => country.active);
      setCountries(active);
      const defaultCountry = active.find((country) => country.countryCode === "CA")
        ?? active.find((country) => country.countryCode === "IN")
        ?? active[0];
      if (defaultCountry) setPhone((current) => ({ ...current, countryId: defaultCountry.id, callingCode: defaultCountry.callingCode }));
    });
  }, []);

  const selectedCountry = useMemo(
    () => countries.find((country) => country.id === phone.countryId),
    [countries, phone.countryId],
  );

  if (!auth.loading && auth.session) return <Redirect href={landingFor(auth.session) as never} />;

  const regionCode = selectedCountry?.countryCode ?? "CA";
  const complete = (session: Awaited<ReturnType<typeof auth.passwordLogin>>) =>
    router.replace(landingFor(session) as never);

  const submitPassword = async () => {
    setBusy(true); setError(null);
    try { complete(await auth.passwordLogin(phone.number, regionCode, password)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Login failed."); }
    finally { setBusy(false); }
  };

  const requestOtp = async () => {
    setBusy(true); setError(null);
    try {
      const challenge = await auth.requestOtp(phone.number, regionCode);
      setChallengeId(challenge.challengeId);
      setDevCode(challenge.devCode ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "OTP request failed."); }
    finally { setBusy(false); }
  };

  const verifyOtp = async () => {
    if (!challengeId) return;
    setBusy(true); setError(null);
    try { complete(await auth.verifyOtp(challengeId, otp)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "OTP verification failed."); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text variant="title">Sign in to Memgine</Text>
        <Text color="textMuted">Use your mobile number and password or a one-time code.</Text>
        <View style={styles.tabs}>
          {(["password", "otp"] as const).map((item) => (
            <Pressable key={item} onPress={() => { setMode(item); setChallengeId(null); setError(null); }} style={[styles.tab, mode === item && styles.tabActive]}>
              <Text color={mode === item ? "primary" : "textMuted"}>{item === "password" ? "Password" : "One-time code"}</Text>
            </Pressable>
          ))}
        </View>
        <PhoneField label="Mobile number" required value={phone} countries={countries} onChange={setPhone} maxDigits={15} testID="login-phone" />
        {mode === "password" ? (
          <>
            <Input label="Password" required secureTextEntry value={password} onChangeText={setPassword} testID="login-password" />
            <Button label={busy ? "Signing in…" : "Sign in"} onPress={() => void submitPassword()} disabled={busy || !phone.number || !password} fullWidth />
          </>
        ) : challengeId ? (
          <>
            <Input label="One-time code" required keyboardType="number-pad" value={otp} onChangeText={setOtp} maxLength={6} testID="login-otp" />
            {devCode ? <Text color="textMuted">Development code: {devCode}</Text> : null}
            <Button label={busy ? "Verifying…" : "Verify code"} onPress={() => void verifyOtp()} disabled={busy || otp.length !== 6} fullWidth />
            <Button label="Use another number" variant="ghost" onPress={() => { setChallengeId(null); setOtp(""); setDevCode(null); }} />
          </>
        ) : (
          <Button label={busy ? "Sending…" : "Send code"} onPress={() => void requestOtp()} disabled={busy || !phone.number} fullWidth />
        )}
        {error ? <Text color="danger">{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F5F6F8", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 480, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 28, gap: 18, borderWidth: 1, borderColor: "#E4E7EB" },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, alignItems: "center", padding: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: "#0F766E" },
});
