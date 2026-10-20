import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/src/ui";
import type { RedemptionResolutionCandidate } from "@/src/data/api/redemption-resolution-api";
import { RedemptionResolutionPanel } from "@/src/ui/domain/RedemptionResolutionPanel";

function Detail({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ minWidth: 190, flexGrow: 1, flexBasis: 190, gap: 3 }}>
    <Text variant="caption" color="textMuted">{title}</Text>
    <Text variant="body" color="text">{children}</Text>
  </View>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ borderWidth: 1, borderColor: "#d6dce2", borderRadius: 10, padding: 16, gap: 12 }}>
    <Text variant="h3" color="text">{title}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>{children}</View>
  </View>;
}
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};
export function RedemptionDetails({ organizationId, item, supportRequestId, readOnly, onChanged }: {
  organizationId: string;
  item: RedemptionResolutionCandidate;
  supportRequestId?: string;
  readOnly?: boolean;
  onChanged?: () => void;
}) {
  const paid = Boolean(item.commerceTransactionId && (item.paymentAmountMinor ?? 0) > 0);
  return <View style={{ gap: 14 }}>
    <View style={{ gap: 4 }}>
      <Text variant="h2" color="text">{item.redemptionNumber}</Text>
      <Text variant="bodySmall" color="textMuted">{date(item.redeemedAt)} · {item.itemStatus}</Text>
    </View>
    <Section title="Customer & Membership">
      <Detail title="Customer">{item.customerName || "—"}</Detail>
      <Detail title="Phone">{item.customerPhone || "—"}</Detail>
      <Detail title="Email">{item.customerEmail || "—"}</Detail>
      <Detail title="Subscription">{item.subscriptionNumber || item.subscriptionId}</Detail>
    </Section>
    <Section title="Redemption Information">
      <Detail title="Redeemed item">{item.itemName}</Detail>
      <Detail title="Type">{item.itemType}</Detail>
      <Detail title="Status">{item.itemStatus}</Detail>
      <Detail title="Store">{item.storeName || "—"}</Detail>
      <Detail title="Processed by">{item.staffName || "—"}</Detail>
      <Detail title="Transaction">{item.redemptionNumber}</Detail>
    </Section>
    <Section title="Payment Information">
      <Detail title="Payment linkage">{item.commerceTransactionId ? "Counter commerce transaction" : "No linked counter payment"}</Detail>
      <Detail title="Recorded commerce total">{paid ? `${item.currencyCode ?? ""} ${((item.paymentAmountMinor ?? 0) / 100).toFixed(2)}` : "No charge to refund"}</Detail>
      <Detail title="Commerce status">{item.paymentStatus || "—"}</Detail>
      <View style={{ width: "100%" }}>
        <Text variant="caption" color="textMuted">Refund eligibility is verified by the server before a refund request. A linked amount alone does not prove that money is refundable. Paid multi-item transactions require financial allocation review.</Text>
      </View>
    </Section>
    <Section title="Resolution & History">
      {item.resolutionId && <View style={{ width: "100%", gap: 4 }}>
        <Text variant="bodyStrong" color="text">Existing resolution: {item.resolutionId}</Text>
        <Text variant="bodySmall" color="textMuted">Status: {item.actionStatus || "Pending"}</Text>
      </View>}
      <View style={{ width: "100%" }}>
        <RedemptionResolutionPanel key={item.itemId} organizationId={organizationId} item={item} supportRequestId={supportRequestId} readOnly={readOnly} onChanged={onChanged} />
      </View>
    </Section>
  </View>;
}
