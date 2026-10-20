import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Input, Text } from "@/src/ui";
import { redemptionResolutionApi, type RedemptionResolutionCandidate } from "@/src/data/api/redemption-resolution-api";
import { RedemptionDetails } from "@/src/ui/domain/RedemptionDetails";

/** Scoped to the authenticated support request's customer, never a free-form customer selector. */
export function SupportRedemptionResolution({ organizationId, supportRequestId, customerUserId, readOnly = false }: {
  organizationId: string;
  supportRequestId: string;
  customerUserId: string;
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<RedemptionResolutionCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await redemptionResolutionApi.candidates(organizationId);
      if (!response.success) throw new Error(response.error?.message ?? "Unable to read redemption history");
      setRows(response.data.filter(item => item.customerUserId === customerUserId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [organizationId, customerUserId]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => rows.filter(item => !search.trim() ||
    [item.itemName, item.redemptionNumber, item.subscriptionNumber].some(value => value?.toLowerCase().includes(search.trim().toLowerCase()))), [rows, search]);
  const selected = rows.find(item => item.itemId === selectedId) ?? null;
  return <View style={{ gap: 12 }}>
    <Text variant="bodyStrong" color="text">Benefit / Offer Redemption Resolution</Text>
    <Text variant="bodySmall" color="textMuted">Select a redemption belonging to this support-request customer. The correction will be linked to this case.</Text>
    <Input label="Search customer's redemptions" placeholder="Benefit, offer or transaction number" value={search} onChangeText={setSearch}/>
    <Button label="Refresh redemptions" onPress={() => { void load(); }} disabled={loading}/>
    {loading && <Text variant="caption" color="textMuted">Loading...</Text>}
    {!!error && <Text variant="bodySmall" color="text">{error}</Text>}
    {!loading && filtered.length === 0 && !error && <Text variant="bodySmall" color="textMuted">No completed benefit or offer redemption found for this customer.</Text>}
    {!selected && filtered.map(item => <Pressable key={item.itemId} onPress={() => setSelectedId(item.itemId)}
      style={{ padding: 12, borderWidth: 1, borderColor: "#d6dce2", borderRadius: 8, gap: 4 }}>
      <Text variant="bodyStrong" color="text">{item.itemName} · {item.itemType}</Text>
      <Text variant="caption" color="textMuted">{item.redemptionNumber} · {item.itemStatus} · {item.subscriptionNumber}</Text>
    </Pressable>)}
    {!!selected && <View style={{ gap: 12 }}>
      <Pressable onPress={() => setSelectedId(null)}><Text variant="bodySmall" color="text">← Back to customer's redemptions</Text></Pressable>
      <RedemptionDetails organizationId={organizationId} item={selected} supportRequestId={supportRequestId} readOnly={readOnly} onChanged={() => { void load(); }}/>
    </View>}
  </View>;
}
