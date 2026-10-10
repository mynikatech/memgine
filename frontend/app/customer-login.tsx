import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { APP_ROUTES } from "@/src/constants/navigation";
import { services, type CountryReference } from "@/src/core";
import { AuthRequestError, useAuth } from "@/src/providers";
import { Button, Input, PhoneField, Text, type PhoneValue } from "@/src/ui";

export default function CustomerLoginScreen() {
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
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
  const [customerAccountNotFound, setCustomerAccountNotFound] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const focusedSectionRef = useRef<View | null>(null);
  const phoneSectionRef = useRef<View | null>(null);
  const otpSectionRef = useRef<View | null>(null);

  const scrollFocusedSectionIntoView = useCallback(() => {
    if (Platform.OS === "web") return;
    const node = findNodeHandle(focusedSectionRef.current);
    if (!node) return;
    scrollRef.current
      ?.getScrollResponder()
      .scrollResponderScrollNativeHandleToKeyboard(node, 0, true);
  }, []);

  const focusSection = useCallback(
    (section: RefObject<View | null>) => {
      focusedSectionRef.current = section.current;
      requestAnimationFrame(scrollFocusedSectionIntoView);
    },
    [scrollFocusedSectionIntoView],
  );

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = Keyboard.addListener(
      "keyboardDidShow",
      scrollFocusedSectionIntoView,
    );
    return () => subscription.remove();
  }, [scrollFocusedSectionIntoView]);

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
  const requestedReturnTo = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;
  const returnTo =
    requestedReturnTo?.startsWith("/join") ||
    requestedReturnTo?.startsWith("/discover/")
      ? requestedReturnTo
      : APP_ROUTES.customer.cards;
  if (!auth.loading && auth.session) {
    if (Platform.OS !== "web" && auth.mobileSessionMode === "business") {
      return (
        <View style={styles.page}>
          <View style={styles.card}>
            <Text variant="title">Continue as Customer?</Text>
            <Text color="textMuted">
              You are currently signed in for business access. Continuing signs
              out that session before customer sign in.
            </Text>
            <Button
              label="Continue as Customer"
              fullWidth
              onPress={() => void auth.logout()}
            />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => router.replace(APP_ROUTES.root as never)}
            />
          </View>
        </View>
      );
    }
    return <Redirect href={returnTo as never} />;
  }

  const requestOtp = async () => {
    setBusy(true);
    setError(null);
    setCustomerAccountNotFound(false);
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
    setCustomerAccountNotFound(false);
    try {
      await auth.verifyCustomerOtp(challengeId, otp);
      if (Platform.OS !== "web") await auth.setMobileSessionMode("customer");
      router.replace(returnTo as never);
    } catch (cause) {
      if (
        cause instanceof AuthRequestError &&
        cause.code === "CUSTOMER_ACCOUNT_NOT_FOUND"
      ) {
        setCustomerAccountNotFound(true);
        setError("No active Memgine account was found for this mobile number.");
        return;
      }
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
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator
      >
        <View style={styles.card}>
          <Text variant="title">Your Memberships</Text>
          <Text color="textMuted">
            Sign in with your mobile number and one-time code.
          </Text>
          <View ref={phoneSectionRef} collapsable={false}>
            <PhoneField
              label="Mobile number"
              required
              value={phone}
              countries={countries}
              onChange={setPhone}
              onPhoneFocus={() => focusSection(phoneSectionRef)}
              maxDigits={10}
              testID="customer-login-phone"
            />
          </View>
          {challengeId ? (
            <View ref={otpSectionRef} collapsable={false} style={styles.otpSection}>
              <Input
                label="One-time code"
                required
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                maxLength={6}
                onFocus={() => focusSection(otpSectionRef)}
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
                  setCustomerAccountNotFound(false);
                  setError(null);
                }}
              />
            </View>
          ) : (
            <Button
              label={busy ? "Sending…" : "Send code"}
              onPress={() => void requestOtp()}
              disabled={busy || !phone.number}
              fullWidth
            />
          )}
          {error ? <Text color="danger">{error}</Text> : null}
          {customerAccountNotFound ? (
            <Button
              label="Join Memgine"
              onPress={() => router.push(APP_ROUTES.register as never)}
              fullWidth
            />
          ) : null}
          <View style={styles.joinRow}>
            <Text color="textMuted">New to Memgine?</Text>

            <Pressable onPress={() => router.push(APP_ROUTES.register as never)}>
              <Text color="primary">Join Memgine</Text>
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
    paddingBottom: 180,
  },
  page: {
    flex: 1,
    backgroundColor: "#F5F6F8",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  joinRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
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
  otpSection: {
    gap: 18,
  },
});
