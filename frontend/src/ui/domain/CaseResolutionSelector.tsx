import { useEffect, useState } from "react";
import { View } from "react-native";
import { ReferenceSelect, Text } from "@/src/ui";
import { refundResolutionApi, type ResolutionOption } from "@/src/data/api/refund-resolution-api";

export function CaseResolutionSelector({ organizationId, scope, action, onActionChange, showIssue = false }: {
  organizationId: string;
  scope: "SUPPORT" | "PAYMENT";
  action: string;
  onActionChange: (action: string) => void;
  showIssue?: boolean;
}) {
  const [options, setOptions] = useState<ResolutionOption[]>([]);
  const [issue, setIssue] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setOptions([]); setIssue(""); setError(""); onActionChange("");
    void refundResolutionApi.options(organizationId, scope).then(result => {
      if (!active) return;
      if (!result.success) throw new Error(result.error?.message ?? "Unable to load resolution options");
      setOptions(result.data);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load options"); });
    return () => { active = false; };
  }, [organizationId, scope]);
  const issues = options.filter(option => option.type === "ISSUE");
  const actions = options.filter(option => option.type === "ACTION");
  return <View style={{ gap: 12 }}>
    <Text variant="h3" color="text">Resolution decision</Text>
    {showIssue && <ReferenceSelect label="What happened?" value={issue} allowClear
      placeholder="Choose an issue" items={issues} getItemId={item => item.code}
      renderItemLabel={item => item.name} onChange={setIssue}/>}
    <ReferenceSelect label="What action should we take?" value={action} allowClear
      placeholder={options.length ? "Choose a resolution action" : "Loading actions…"}
      items={actions} getItemId={item => item.code} renderItemLabel={item => item.name}
      onChange={onActionChange}/>
    {!!error && <Text variant="bodySmall" color="text">{error}</Text>}
  </View>;
}
