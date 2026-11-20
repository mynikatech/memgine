import { useEffect, useState } from "react";
import { Alert, Platform, Share, TextInput, View } from "react-native";
import { apis } from "@/src/data";
import { useTheme } from "@/src/providers";
import { Button } from "@/src/ui/Button";
import { Text } from "@/src/ui/Text";

type Props = {
  organizationId: string;
  productId: string;
  isNewProduct: boolean;
  readOnly: boolean;
  pendingCode?: string;
  onCodeChange: (code: string) => void;
};

/** Only mounted for the CORPORATE product type; no customer-facing code is exposed. */
export function CorporateMembershipCodeSection({
  organizationId, productId, isNewProduct, readOnly, pendingCode, onCodeChange,
}: Props) {
  const theme = useTheme();
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState("");
  const code = pendingCode || savedCode || "";

  useEffect(() => {
    if (isNewProduct) return;
    let active = true;
    void apis.membershipProduct.getCorporateCode(organizationId, productId).then((result) => {
      if (active && result.success) setSavedCode(result.data.code);
    });
    return () => { active = false; };
  }, [organizationId, productId, isNewProduct]);

  const generate = async () => {
    setBusy(true);
    try {
      let nextCode = "";
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await apis.membershipProduct.generateCorporateCode(organizationId);
        if (!result.success) throw new Error(result.error.message);
        nextCode = result.data.code;
        if (nextCode !== code) break;
      }
      if (!nextCode || nextCode === code) throw new Error("Unable to generate a different code. Try again.");
      onCodeChange(nextCode);
      setRevealed(true);
      setMessage("New code generated. Select Save Changes to activate it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate code.");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = () => {
    if (!code) { void generate(); return; }
    if (Platform.OS === "web") {
      if (window.confirm("Regenerate this code? The old code stops working for new purchases once you save changes.")) {
        void generate();
      }
      return;
    }
    Alert.alert(
      "Regenerate Corporate Code?",
      "The old code will stop working for new purchases after you save changes. Existing memberships will stay active.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Regenerate", style: "destructive", onPress: () => void generate() },
      ],
    );
  };

  const copyOrShare = async () => {
    if (!code) return;
    if (Platform.OS === "web") {
      try {
        await navigator.clipboard.writeText(code);
        setMessage("Code copied.");
      } catch { setMessage("Select the code and copy it manually."); }
    } else {
      await Share.share({ message: code });
    }
  };

  return (
    <View style={{ gap: theme.spacing.sm, padding: theme.spacing.md,
      borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg }}>
      <Text variant="bodyStrong">Corporate Membership Access</Text>
      <Text variant="bodySmall" color="textSecondary">
        Customers need this six-digit code to purchase the membership. Share it only with authorized members.
      </Text>
      <TextInput
        value={code ? (revealed ? code : "••••••") : "No code generated"}
        editable={false}
        selectTextOnFocus
        style={{ padding: 12, color: theme.colors.text, borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceAlt }}
        testID="corporate-membership-code"
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
        {code ? <Button label={revealed ? "Hide" : "Show"} size="sm" variant="outline"
          onPress={() => setRevealed(!revealed)} /> : null}
        {code && revealed ? <Button label={Platform.OS === "web" ? "Copy" : "Share"}
          size="sm" variant="outline" onPress={() => void copyOrShare()} /> : null}
        {!readOnly ? <Button label={code ? "Regenerate Code" : "Generate Code"}
          size="sm" disabled={busy} onPress={regenerate} /> : null}
      </View>
      {message ? <Text variant="caption" color="textMuted">{message}</Text> : null}
      {pendingCode ? <Text variant="caption" color="textMuted">
        Code pending. Save Changes to activate this code.
      </Text> : null}
    </View>
  );
}
