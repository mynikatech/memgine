import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { membershipTermsApi } from "@/src/data/api/membership-terms-api";

export function MembershipTermsEditor({ organizationId }: { organizationId: string }) {
  const [terms, setTerms] = useState("");
  const [original, setOriginal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const result = await membershipTermsApi.get(organizationId);
      if (!result.success) throw new Error(result.error.message);
      const value = result.data.terms ?? "";
      setTerms(value); setOriginal(value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load terms."); }
    finally { setBusy(false); }
  }, [organizationId]);
  useEffect(() => { void reload(); }, [reload]);
  const save = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await membershipTermsApi.save(organizationId, terms);
      if (!result.success) throw new Error(result.error.message);
      const value = result.data.terms ?? "";
      setTerms(value); setOriginal(value); setNotice("Membership terms saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save terms."); }
    finally { setBusy(false); }
  };
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Membership Terms & Conditions</Text>
      <Text style={styles.description}>General membership policies shown to customers alongside the selected plan details. This is separate from your Disclaimer.</Text>
      <TextInput style={styles.input} multiline textAlignVertical="top" editable={!busy}
        value={terms} onChangeText={(value) => { setTerms(value); setNotice(null); }}
        maxLength={30000} placeholder="Enter membership terms and conditions" accessibilityLabel="Membership Terms and Conditions" />
      <Text style={styles.counter}>{terms.length}/30000</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Pressable style={[styles.button, (busy || terms === original) && styles.disabled]}
        disabled={busy || terms === original} onPress={() => void save()} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Membership Terms</Text>}
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
 section:{padding:18,borderWidth:1,borderColor:"#d0d5dd",borderRadius:12,marginVertical:12},
 title:{fontSize:17,fontWeight:"600",marginBottom:7},
 description:{fontSize:13,color:"#667085",marginBottom:12},
 input:{minHeight:170,borderWidth:1,borderColor:"#98a2b3",borderRadius:8,padding:12,fontSize:14},
 counter:{textAlign:"right",fontSize:12,color:"#667085",marginTop:5},
 error:{color:"#b42318",marginVertical:9},notice:{color:"#067647",marginVertical:9},
 button:{backgroundColor:"#175cd3",padding:13,borderRadius:8,alignItems:"center",marginTop:12},
 disabled:{opacity:.45},buttonText:{color:"#fff",fontWeight:"600"},
});
