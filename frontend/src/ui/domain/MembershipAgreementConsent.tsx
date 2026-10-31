import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/** UI component only: the parent must verify and persist consent server-side before payment. */
export type MembershipAgreementConsentProps = {
  terms: string;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  merchantName?: string;
  disabled?: boolean;
};

export function MembershipAgreementConsent({ terms, accepted, onAcceptedChange, merchantName, disabled = false }: MembershipAgreementConsentProps) {
  const [open, setOpen] = useState(false);
  const hasTerms = terms.trim().length > 0;
  return (
    <View style={styles.container}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} disabled={!hasTerms}>
        <Text style={[styles.link, !hasTerms && styles.disabled]}>Read Membership Terms & Conditions</Text>
      </Pressable>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted, disabled: disabled || !hasTerms }}
        disabled={disabled || !hasTerms}
        onPress={() => onAcceptedChange(!accepted)}
        style={styles.checkboxRow}
      >
        <Text style={styles.checkboxMark}>{accepted ? "☑" : "☐"}</Text>
        <Text style={styles.body}>I have read and agree to the Membership Terms & Conditions.</Text>
      </Pressable>
      {!hasTerms ? <Text style={styles.warning}>Membership terms are unavailable. Please contact the merchant before purchasing.</Text> : null}
      <Modal animationType="slide" visible={open} onRequestClose={() => setOpen(false)} transparent>
        <View style={styles.scrim}>
          <View style={styles.dialog}>
            <Text style={styles.heading}>Membership Terms & Conditions</Text>
            {merchantName ? <Text style={styles.merchant}>{merchantName}</Text> : null}
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
              <Text selectable style={styles.terms}>{terms}</Text>
            </ScrollView>
            <Pressable accessibilityRole="button" style={styles.close} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, paddingVertical: 12 },
  link: { fontSize: 14, fontWeight: "600", color: "#1D4ED8", textDecorationLine: "underline" },
  disabled: { opacity: 0.5 },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
  checkboxMark: { fontSize: 22, lineHeight: 25, color: "#1D4ED8" },
  body: { fontSize: 14, lineHeight: 22, flex: 1, color: "#1F2937" },
  warning: { fontSize: 13, color: "#B45309" },
  scrim: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)", padding: 20 },
  dialog: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 20, maxHeight: "85%", gap: 12 },
  heading: { fontSize: 19, fontWeight: "700", color: "#111827" },
  merchant: { fontSize: 14, color: "#4B5563" },
  scroll: { flexShrink: 1 },
  content: { paddingVertical: 12 },
  terms: { fontSize: 14, lineHeight: 22, color: "#111827" },
  close: { alignSelf: "flex-end", padding: 12 },
  closeText: { color: "#1D4ED8", fontWeight: "700" },
});
