import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { CustomerDataApi, type CustomerSelfProfile } from "@/src/data/api/customer-data-api";
import { useTheme } from "@/src/providers";
import { Button, Card, Input, Modal, Text } from "@/src/ui";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: (profile: CustomerSelfProfile) => Promise<void> | void;
};

type PhoneStep = "request" | "old" | "replacement";
const customerDataApi = new CustomerDataApi();

export function CustomerEditProfileModal({ visible, onClose, onSaved }: Props) {
  const theme = useTheme();
  const [profile, setProfile] = useState<CustomerSelfProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("request");
  const [oldChallengeId, setOldChallengeId] = useState("");
  const [newChallengeId, setNewChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    if (!visible) return;
    setError(null); setBusy(false); setPhoneVisible(false); setPhoneStep("request");
    void customerDataApi.selfProfile().then((result) => {
      if (!result.success) { setError(result.error.message); return; }
      setProfile(result.data);
      setFirstName(result.data.firstName ?? "");
      setMiddleName(result.data.middleName ?? "");
      setLastName(result.data.lastName ?? "");
      setEmail(result.data.primaryEmail ?? "");
    });
  }, [visible]);

  const save = async () => {
    if (!profile || busy) return;
    if (!firstName.trim()) { setError("First name is required."); return; }
    setBusy(true); setError(null);
    try {
      const result = await customerDataApi.saveSelfProfile({ firstName, middleName: middleName || null, lastName: lastName || null, primaryEmail: email || null, versionNo: profile.versionNo });
      if (!result.success) { setError(result.error.message); return; }
      setProfile(result.data);
      await onSaved(result.data);
      onClose();
    } catch { setError("Profile changes could not be saved. Please try again."); } finally { setBusy(false); }
  };

  const beginPhoneChange = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await customerDataApi.requestCurrentPhoneChange();
      if (!result.success) { setError(result.error.message); return; }
      setOldChallengeId(result.data.challengeId); setOtp(""); setPhoneStep("old"); setPhoneVisible(true);
    } catch { setError("A verification code could not be requested. Please try again."); } finally { setBusy(false); }
  };
  const verifyCurrent = async () => {
    if (busy || !oldChallengeId) return;
    setBusy(true); setError(null);
    try {
      const result = await customerDataApi.verifyCurrentPhoneChange({ challengeId: oldChallengeId, otp, newPhone });
      if (!result.success) { setError(result.error.message); return; }
      setNewChallengeId(result.data.challengeId); setOtp(""); setPhoneStep("replacement");
    } catch { setError("Mobile verification could not be completed. Please try again."); } finally { setBusy(false); }
  };
  const confirmReplacement = async () => {
    if (busy || !newChallengeId) return;
    setBusy(true); setError(null);
    try {
      const result = await customerDataApi.confirmReplacementPhone({ challengeId: newChallengeId, otp });
      if (!result.success) { setError(result.error.message); return; }
      setProfile(result.data); setPhoneVisible(false); await onSaved(result.data);
    } catch { setError("Mobile number could not be changed. Please try again."); } finally { setBusy(false); }
  };

  return <Modal visible={visible} onClose={() => !busy && onClose()} title="Edit Profile" scrollable maxWidth={640} testID="customer-edit-profile-modal">
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.spacing.md }}>
        <Card padding="lg"><View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md }}>
            <View style={{ flex: 1, minWidth: 220 }}><Input label="First Name" required value={firstName} onChangeText={setFirstName} autoCapitalize="words" maxLength={100} /></View>
            <View style={{ flex: 1, minWidth: 220 }}><Input label="Last Name" required value={lastName} onChangeText={setLastName} autoCapitalize="words" maxLength={100} /></View>
          </View>
          <Input label="Middle Name" value={middleName} onChangeText={setMiddleName} autoCapitalize="words" maxLength={100} />
          <Input label="Email Address (Optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} />
          <Text variant="caption" color="textMuted">Used for support notifications, not for login.</Text>
          <Input label="Mobile Number (Required)" value={profile?.primaryPhone ?? ""} onChangeText={() => undefined} editable={false} />
          <Button label="Change Mobile Number" variant="outline" onPress={() => void beginPhoneChange()} disabled={busy || !profile} />
          <Text variant="caption" color="textMuted">Changing your mobile number requires OTP verification. Your mobile number is used for login and account access.</Text>
          {error ? <Text variant="bodySmall" color="danger">{error}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md, justifyContent: "flex-end" }}>
            <Button label="Cancel" variant="outline" onPress={onClose} disabled={busy} />
            <Button label={busy ? "Saving…" : "Save Changes"} onPress={() => void save()} disabled={busy || !profile} />
          </View>
        </View></Card>
      </ScrollView>
    </KeyboardAvoidingView>
    <Modal visible={phoneVisible} onClose={() => !busy && setPhoneVisible(false)} title="Change Mobile Number" scrollable testID="customer-phone-change-modal">
      <View style={{ gap: theme.spacing.md }}>
        {phoneStep === "old" ? <><Text variant="body">Enter the code sent to your current mobile number.</Text><Input label="Verification code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6}/><Input label="New mobile number" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" placeholder="+14165550123"/><Button label={busy ? "Verifying…" : "Continue"} onPress={() => void verifyCurrent()} disabled={busy || otp.length !== 6 || !newPhone.trim()} /></> : null}
        {phoneStep === "replacement" ? <><Text variant="body">Enter the code sent to your new mobile number.</Text><Input label="Verification code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6}/><Button label={busy ? "Confirming…" : "Confirm Mobile Number"} onPress={() => void confirmReplacement()} disabled={busy || otp.length !== 6} /></> : null}
        {error ? <Text variant="bodySmall" color="danger">{error}</Text> : null}
      </View>
    </Modal>
  </Modal>;
}
