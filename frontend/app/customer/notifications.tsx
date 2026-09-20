import { useCallback,useState } from "react";
import { useFocusEffect } from "expo-router";
import { ScrollView,Pressable,Text,View } from "react-native";
import { services } from "@/src/core";
import type { AppNotification } from "@/src/data/api/notification-api";
export default function Notifications(){const [rows,setRows]=useState<AppNotification[]>([]);const [error,setError]=useState("");const load=useCallback(()=>services.inAppNotifications.list().then(setRows).catch(e=>setError(e.message)),[]);useFocusEffect(useCallback(()=>{load();},[load]));return <ScrollView contentContainerStyle={{padding:20,gap:12}}><Text style={{fontSize:24,fontWeight:"700"}}>Notifications</Text>{error?<Text>{error}</Text>:null}{rows.map(n=><Pressable key={n.id} onPress={async()=>{if(!n.readAt){await services.inAppNotifications.markRead(n.id);load();}}} style={{padding:14,borderRadius:10,backgroundColor:n.readAt?"#fff":"#e8f4f2"}}><Text style={{fontWeight:"700"}}>{n.title}</Text><Text>{n.message}</Text><Text>{new Date(n.createdAt).toLocaleString()}</Text></Pressable>)}</ScrollView>}
