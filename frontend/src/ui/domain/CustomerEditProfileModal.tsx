import { useEffect, useState } from "react";
import { View } from "react-native";

import type { CountryReference } from "@/src/core";
import { services } from "@/src/core/services/service-registry";
import {
  CustomerDataApi,
  type CustomerOtpChallenge,
  type CustomerSelfProfile,
} from "@/src/data/api/customer-data-api";
import { useTheme } from "@/src/providers";
import {
  Button,
  Card,
  Input,
  Modal,
  PhoneField,
  Text,
  type PhoneValue,
} from "@/src/ui";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: (profile: CustomerSelfProfile) => Promise<void> | void;
};

type PhoneStep = "enter" | "old" | "replacement";
const customerDataApi = new CustomerDataApi();

function startingPhoneValue(
  countries: CountryReference[],
  existing: string,
): PhoneValue {
  const byPrefix = [...countries]
    .filter((country) => {
      const prefix = country.callingCode?.startsWith("+")
        ? country.callingCode
        : `+${country.callingCode ?? ""}`;
      return prefix.length > 1 && existing.startsWith(prefix);
    })
    .sort((a, b) => {
      const difference = b.callingCode.length - a.callingCode.length;
      if (difference !== 0) return difference;
      if (a.countryCode === "CA") return -1;
      if (b.countryCode === "CA") return 1;
      return 0;
    });
  const country =
    byPrefix[0] ??
    countries.find((item) => item.countryCode === "CA") ??
    countries[0];
  return {
    countryId: country?.id ?? "",
    callingCode: country?.callingCode ?? "",
    number: "",
  };
}

export function CustomerEditProfileModal({ visible, onClose, onSaved }: Props) {
  const theme = useTheme();
  const [profile, setProfile] = useState<CustomerSelfProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("enter");
  const [oldChallengeId, setOldChallengeId] = useState("");
  const [newChallengeId, setNewChallengeId] = useState("");
  const [challenge, setChallenge] = useState<CustomerOtpChallenge | null>(null);
  const [otp, setOtp] = useState("");
  const [countries, setCountries] = useState<CountryReference[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [phoneValue, setPhoneValue] = useState<PhoneValue>({
    countryId: "",
    callingCode: "",
    number: "",
  });

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setBusy(false);
    setProfileError(null);
    setPhoneError(null);
    setPhoneVisible(false);
    setPhoneStep("enter");
    void customerDataApi
      .selfProfile()
      .then((result) => {
        if (!active) return;
        if (!result.success) {
          setProfileError(result.error.message);
          return;
        }
        setProfile(result.data);
        setFirstName(result.data.firstName ?? "");
        setMiddleName(result.data.middleName ?? "");
        setLastName(result.data.lastName ?? "");
        setEmail(result.data.primaryEmail ?? "");
      })
      .catch(() => {
        if (active)
          setProfileError("Could not load your profile. Please try again.");
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const save = async () => {
    if (!profile || busy) return;
    if (!firstName.trim() || !lastName.trim()) {
      setProfileError("First name and last name are required.");
      return;
    }
    setBusy(true);
    setProfileError(null);
    try {
      const result = await customerDataApi.saveSelfProfile({
        firstName: firstName.trim(),
        middleName: middleName.trim() || null,
        lastName: lastName.trim(),
        primaryEmail: email.trim() || null,
        versionNo: profile.versionNo,
      });
      if (!result.success) {
        setProfileError(result.error.message);
        return;
      }
      setProfile(result.data);
      await onSaved(result.data);
      onClose();
    } catch {
      setProfileError("Profile changes could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const openPhoneChange = async () => {
    if (!profile || busy) return;
    setPhoneVisible(true);
    setPhoneStep("enter");
    setPhoneError(null);
    setOtp("");
    setOldChallengeId("");
    setNewChallengeId("");
    setChallenge(null);
    setLoadingCountries(true);
    try {
      const rows = await services.referenceData.listCountries();
      const active = rows.filter(
        (country) => country.active && !!country.callingCode,
      );
      setCountries(active);
      setPhoneValue(startingPhoneValue(active, profile.primaryPhone));
      if (active.length === 0)
        setPhoneError("Country options are unavailable. Please try again.");
    } catch {
      setPhoneError("Country options could not be loaded. Please try again.");
    } finally {
      setLoadingCountries(false);
    }
  };

  const selectedCountry = countries.find(
    (country) => country.id === phoneValue.countryId,
  );
  const newPhone = `+${phoneValue.callingCode.replace(/\D/g, "")}${phoneValue.number.replace(/\D/g, "")}`;

  const startVerification = async () => {
    if (busy || !selectedCountry || !phoneValue.number.trim()) return;
    if (newPhone === profile?.primaryPhone) {
      setPhoneError("Enter a different mobile number.");
      return;
    }
    setBusy(true);
    setPhoneError(null);
    try {
      const result = await customerDataApi.requestCurrentPhoneChange({
        newPhone,
        regionCode: selectedCountry.countryCode,
      });
      if (!result.success) {
        setPhoneError(result.error.message);
        return;
      }
      setChallenge(result.data);
      setOtp("");
      if (result.data.requiresCurrentPhoneVerification) {
        setOldChallengeId(result.data.challengeId);
        setPhoneStep("old");
      } else {
        setNewChallengeId(result.data.challengeId);
        setPhoneStep("replacement");
      }
    } catch {
      setPhoneError(
        "A verification code could not be requested. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyCurrent = async () => {
    if (busy || !oldChallengeId || otp.length !== 6) return;
    setBusy(true);
    setPhoneError(null);
    try {
      const result = await customerDataApi.verifyCurrentPhoneChange({
        challengeId: oldChallengeId,
        otp,
        newPhone,
        regionCode: selectedCountry?.countryCode,
      });
      if (!result.success) {
        setPhoneError(result.error.message);
        return;
      }
      setChallenge(result.data);
      setNewChallengeId(result.data.challengeId);
      setOtp("");
      setPhoneStep("replacement");
    } catch {
      setPhoneError("Current mobile verification failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmReplacement = async () => {
    if (busy || !newChallengeId || otp.length !== 6) return;
    setBusy(true);
    setPhoneError(null);
    try {
      const result = await customerDataApi.confirmReplacementPhone({
        challengeId: newChallengeId,
        otp,
      });
      if (!result.success) {
        setPhoneError(result.error.message);
        return;
      }
      setProfile(result.data);
      setPhoneVisible(false);
      await onSaved(result.data);
    } catch {
      setPhoneError("Mobile number could not be changed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        visible={visible && !phoneVisible}
        onClose={() => {
          if (!busy) onClose();
        }}
        title="Edit Profile"
        scrollable
        maxWidth={640}
        testID="customer-edit-profile-modal"
      >
        <Card padding="lg">
          <View style={{ gap: theme.spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: theme.spacing.md,
              }}
            >
              <View style={{ flex: 1, minWidth: 220 }}>
                <Input
                  label="First Name"
                  required
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  maxLength={100}
                />
              </View>
              <View style={{ flex: 1, minWidth: 220 }}>
                <Input
                  label="Last Name"
                  required
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  maxLength={100}
                />
              </View>
            </View>
            <Input
              label="Middle Name"
              value={middleName}
              onChangeText={setMiddleName}
              autoCapitalize="words"
              maxLength={100}
            />
            <Input
              label="Email Address (Optional)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={254}
            />
            <Text variant="caption" color="textMuted">
              Used for support notifications, not for login.
            </Text>
            <Input
              label="Mobile Number (Required)"
              value={profile?.primaryPhone ?? ""}
              onChangeText={() => undefined}
              editable={false}
            />
            <Button
              label="Change Mobile Number"
              variant="outline"
              onPress={() => void openPhoneChange()}
              disabled={busy || !profile}
            />
            <Text variant="caption" color="textMuted">
              Changing your mobile number requires verification. Your mobile
              number is used for login and account access.
            </Text>
            {profileError ? (
              <Text variant="bodySmall" color="danger">
                {profileError}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: theme.spacing.md,
                justifyContent: "flex-end",
              }}
            >
              <Button
                label="Cancel"
                variant="outline"
                onPress={onClose}
                disabled={busy}
              />
              <Button
                label={busy ? "Saving…" : "Save Changes"}
                onPress={() => void save()}
                disabled={busy || !profile}
              />
            </View>
          </View>
        </Card>
      </Modal>

      <Modal
        visible={visible && phoneVisible}
        onClose={() => {
          if (!busy) setPhoneVisible(false);
        }}
        title="Change Mobile Number"
        scrollable
        maxWidth={640}
        testID="customer-phone-change-modal"
      >
        <View style={{ gap: theme.spacing.md }}>
          {phoneStep === "enter" ? (
            <>
              <Text variant="bodySmall" color="textMuted">
                Current number: {profile?.primaryPhone}
              </Text>
              {loadingCountries ? (
                <Text variant="bodySmall" color="textMuted">
                  Loading countries…
                </Text>
              ) : countries.length ? (
                <PhoneField
                  label="New Mobile Number"
                  required
                  value={phoneValue}
                  onChange={(value) => {
                    setPhoneValue(value);
                    setPhoneError(null);
                  }}
                  countries={countries}
                  maxDigits={
                    ["CA", "US", "IN"].includes(
                      selectedCountry?.countryCode ?? "",
                    )
                      ? 10
                      : 15
                  }
                  testID="customer-replacement-phone"
                />
              ) : null}
              <Button
                label={busy ? "Requesting…" : "Continue"}
                onPress={() => void startVerification()}
                disabled={
                  busy ||
                  loadingCountries ||
                  !selectedCountry ||
                  !phoneValue.number
                }
              />
            </>
          ) : null}

          {phoneStep === "old" ? (
            <>
              <Text variant="body">
                For your account&apos;s security, enter the verification code
                sent to your current mobile number.
              </Text>
              <Input
                label="Current-number verification code"
                value={otp}
                onChangeText={(text) => {
                  setOtp(text.replace(/\D/g, "").slice(0, 6));
                  setPhoneError(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
                testID="customer-old-phone-otp"
              />
              <Button
                label={busy ? "Verifying…" : "Verify Current Number"}
                onPress={() => void verifyCurrent()}
                disabled={busy || otp.length !== 6}
              />
            </>
          ) : null}

          {phoneStep === "replacement" ? (
            <>
              <Text variant="body">
                Enter the verification code sent to {newPhone}.
              </Text>
              <Input
                label="New-number verification code"
                value={otp}
                onChangeText={(text) => {
                  setOtp(text.replace(/\D/g, "").slice(0, 6));
                  setPhoneError(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
                testID="customer-new-phone-otp"
              />
              <Button
                label={busy ? "Confirming…" : "Confirm Mobile Number"}
                onPress={() => void confirmReplacement()}
                disabled={busy || otp.length !== 6}
              />
            </>
          ) : null}

          {challenge?.devCode ? (
            <Text variant="caption" color="textMuted">
              Development verification code: {challenge.devCode}
            </Text>
          ) : null}
          {phoneError ? (
            <Text variant="bodySmall" color="danger">
              {phoneError}
            </Text>
          ) : null}
          <Button
            label={phoneStep === "enter" ? "Cancel" : "Back"}
            variant="outline"
            disabled={busy}
            onPress={() => {
              if (phoneStep === "enter") setPhoneVisible(false);
              else {
                setPhoneStep("enter");
                setOtp("");
                setPhoneError(null);
                setChallenge(null);
              }
            }}
          />
        </View>
      </Modal>
    </>
  );
}
