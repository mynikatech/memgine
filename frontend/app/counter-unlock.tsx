import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { APP_ROUTES } from "@/src/constants/navigation";
import { posApi, type PosContext } from "@/src/data/api/pos-api";
import { useAuth } from "@/src/providers";
import { Button, Card, StateView, Text } from "@/src/ui";

export default function CounterUnlock(){
 const router=useRouter(); const {unlockPos}=useAuth(); const [context,setContext]=useState<PosContext|null>(null); const [staffId,setStaffId]=useState(""); const [pin,setPin]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false);
 useEffect(()=>{void posApi.context().then(r=>{if(r.success)setContext(r.data);else setError(r.error.message)}).finally(()=>setLoading(false))},[]);
 const unlock=async()=>{setBusy(true);setError("");try{const session=await unlockPos(staffId,pin);router.replace(APP_ROUTES.counter.organization(session.posContext?.organizationId??context!.organizationId) as never)}catch(e){setError(e instanceof Error?e.message:"PIN is incorrect or unavailable")}finally{setBusy(false)}};
 if(loading)return <StateView kind="loading" message="Loading fixed POS…"/>;
 if(!context)return <View style={styles.page}><Card padding="lg"><Text variant="title">This device is not registered as a fixed POS.</Text><Button label="Sign in normally" onPress={()=>router.replace(APP_ROUTES.login)} /></Card></View>;
 return <View style={styles.page}><Card padding="lg"><Text variant="title">{context.organizationName}</Text><Text color="textMuted">{context.storeName} · {context.deviceName}</Text><View style={styles.staff}>{context.staff.map(s=><Pressable key={s.staffId} onPress={()=>setStaffId(s.staffId)} style={[styles.option,staffId===s.staffId&&styles.selected]}><Text>{s.displayName}</Text><Text color="textMuted">{s.staffCode}{s.pinConfigured?"":" · PIN unavailable"}</Text></Pressable>)}</View><TextInput value={pin} onChangeText={v=>setPin(v.replace(/\D/g,"").slice(0,4))} keyboardType="number-pad" secureTextEntry placeholder="4-digit PIN" style={styles.input} maxLength={4}/><Button label={busy?"Unlocking…":"Unlock"} onPress={()=>void unlock()} disabled={busy||!staffId||pin.length!==4}/>{error?<Text color="danger">{error}</Text>:null}</Card></View>;
}
const styles=StyleSheet.create({page:{flex:1,justifyContent:"center",padding:24},staff:{gap:8},option:{borderWidth:1,borderColor:"#CBD5E1",padding:12,borderRadius:8},selected:{borderColor:"#0F766E",backgroundColor:"#E6FFFA"},input:{borderWidth:1,borderColor:"#CBD5E1",padding:12,borderRadius:8}});
