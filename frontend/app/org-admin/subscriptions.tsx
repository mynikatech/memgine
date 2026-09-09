import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  MembershipProduct,
  OrganizationUser,
  Subscription,
  SubscriptionPlan,
  User,
} from "@/src/core";
import { services } from "@/src/core";
import { useBusiness } from "@/src/providers";
import { DataTable, DataTableColumn, Input, Text } from "@/src/ui";

type SubscriptionRow = {
  subscription: Subscription;
  organizationUser: OrganizationUser;
  user?: User;
  subscriptionPlan?: SubscriptionPlan;
  membershipProduct?: MembershipProduct;
};

function displayName(user?: User): string {
  if (!user) return "Unknown Customer";
  return (
    user.displayName?.trim() ||
    `${user.firstName ?? ""} ${user.middleName ?? ""} ${user.lastName ?? ""}`
      .replace(/\s+/g, " ")
      .trim() ||
    user.userCode
  );
}

function phone(user?: User): string {
  if (!user?.primaryPhone) return "—";
  return (
    `${user.primaryPhone.callingCode ?? ""} ${user.primaryPhone.number ?? ""}`.trim() ||
    "—"
  );
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatMoney(value?: {
  amountMinor: number;
  currency: string;
}): string {
  if (!value) return "—";
  return `${value.currency} ${(value.amountMinor / 100).toFixed(2)}`;
}

function formatStatus(statusId?: string): string {
  if (!statusId) return "Unknown";
  return statusId
    .replace(/^(subscription-status|status)-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="body" color="text">
        {value}
      </Text>
    </View>
  );
}

export default function OrgAdminSubscriptions() {
  const { organization } = useBusiness();
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SubscriptionRow | null>(null);
  const [activeStatusId, setActiveStatusId] = useState<string | undefined>();

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const [subscriptions, organizationUsers, users, products, statuses] =
          await Promise.all([
            services.subscription.listByOrganization(organization.id),
            services.organization.listOrganizationUsers(organization.id),
            services.organization.listUsers(),
            services.membershipProduct.listProducts(organization.id),
            services.status.listStatusesByEntityTypeCode("SUBSCRIPTION"),
          ]);

        const active = statuses.find(
          (item) => item.statusCode?.trim().toUpperCase() === "ACTIVE",
        );

        if (!mounted) return;
        setActiveStatusId(active?.id);

        const organizationUserMap = new Map(
          organizationUsers
            .filter((item) => !item.isDeleted)
            .map((item) => [item.id, item]),
        );
        const userMap = new Map(
          users
            .filter((item) => !item.isDeleted)
            .map((item) => [item.id, item]),
        );
        const productMap = new Map(
          products
            .filter((item) => !item.isDeleted)
            .map((item) => [item.id, item]),
        );

        const resolved: SubscriptionRow[] = [];

        for (const subscription of subscriptions) {
          if (subscription.isDeleted) continue;
          const organizationUser = organizationUserMap.get(
            subscription.organizationUserId,
          );
          if (!organizationUser) continue;

          const product = Array.from(productMap.values()).find((item) =>
            item.plans?.some(
              (plan) => plan.id === subscription.subscriptionPlanId,
            ),
          );
          const plan = product?.plans?.find(
            (item) =>
              item.id === subscription.subscriptionPlanId && !item.isDeleted,
          );

          resolved.push({
            subscription,
            organizationUser,
            user: userMap.get(organizationUser.userId),
            subscriptionPlan: plan,
            membershipProduct: product,
          });
        }

        if (mounted) setRows(resolved);
      } catch (error) {
        console.error("ORG ADMIN SUBSCRIPTIONS LOAD ERROR", error);
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [organization.id]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      ({ subscription, user, subscriptionPlan, membershipProduct }) =>
        subscription.subscriptionNumber.toLowerCase().includes(q) ||
        subscription.id.toLowerCase().includes(q) ||
        displayName(user).toLowerCase().includes(q) ||
        user?.primaryEmail?.toLowerCase().includes(q) ||
        phone(user).toLowerCase().includes(q) ||
        subscriptionPlan?.subscriptionPlanName.toLowerCase().includes(q) ||
        subscriptionPlan?.subscriptionPlanCode.toLowerCase().includes(q) ||
        membershipProduct?.membershipProductName.toLowerCase().includes(q) ||
        membershipProduct?.displayName?.toLowerCase().includes(q) ||
        formatStatus(subscription.subscriptionStatusId)
          .toLowerCase()
          .includes(q),
    );
  }, [rows, search]);

  const activeCount = useMemo(
    () =>
      activeStatusId
        ? rows.filter(
            (row) => row.subscription.subscriptionStatusId === activeStatusId,
          ).length
        : 0,
    [rows, activeStatusId],
  );

  const columns = useMemo<DataTableColumn<SubscriptionRow>[]>(
    () => [
      {
        key: "subscription",
        title: "Subscription",
        width: 220,
        render: (item) => (
          <View style={styles.primaryCell}>
            <Text variant="bodyStrong" color="text">
              {item.subscription.subscriptionNumber}
            </Text>
            <Text variant="caption" color="textMuted">
              ID: {item.subscription.id}
            </Text>
          </View>
        ),
      },
      {
        key: "customer",
        title: "Customer",
        width: 220,
        render: (item) => (
          <View style={styles.primaryCell}>
            <Text variant="body" color="text">
              {displayName(item.user)}
            </Text>
            <Text variant="caption" color="textMuted">
              {item.user?.primaryEmail ?? phone(item.user)}
            </Text>
          </View>
        ),
      },
      {
        key: "plan",
        title: "Subscription Plan",
        width: 220,
        render: (item) => (
          <View style={styles.primaryCell}>
            <Text variant="body" color="text">
              {item.subscriptionPlan?.subscriptionPlanName ??
                item.membershipProduct?.displayName ??
                "Unknown Plan"}
            </Text>
            <Text variant="caption" color="textMuted">
              {item.membershipProduct?.membershipProductName ??
                item.subscriptionPlan?.subscriptionPlanCode ??
                "—"}
            </Text>
          </View>
        ),
      },
      {
        key: "purchase",
        title: "Purchase Date",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {formatDate(item.subscription.subscriptionDate)}
          </Text>
        ),
      },
      {
        key: "start",
        title: "Start Date",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {formatDate(item.subscription.startDate)}
          </Text>
        ),
      },
      {
        key: "end",
        title: "End Date",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {formatDate(item.subscription.endDate)}
          </Text>
        ),
      },
      {
        key: "status",
        title: "Status",
        width: 150,
        render: (item) => (
          <Text variant="body" color="text">
            {formatStatus(item.subscription.subscriptionStatusId)}
          </Text>
        ),
      },
      {
        key: "amount",
        title: "Amount",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {formatMoney(item.subscription.totalAmount)}
          </Text>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="title" color="text">
            Subscriptions
          </Text>
          <Text variant="bodySmall" color="textMuted">
            View subscriptions purchased by customers of your organization.
          </Text>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryCard}>
            <Text variant="caption" color="textMuted">
              Total Subscriptions
            </Text>
            <Text variant="h2" color="text">
              {rows.length}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text variant="caption" color="textMuted">
              Active
            </Text>
            <Text variant="h2" color="text">
              {activeCount}
            </Text>
          </View>
        </View>

        <Input
          label="Search Subscriptions"
          value={search}
          onChangeText={setSearch}
          placeholder="Search customer, subscription, plan or status"
        />

        {loading ? (
          <View style={styles.center}>
            <Text variant="body" color="textMuted">
              Loading subscriptions...
            </Text>
          </View>
        ) : (
          <DataTable
            columns={columns}
            data={filteredRows}
            keyExtractor={(item) => item.subscription.id}
            emptyMessage={
              search.trim()
                ? "No subscriptions match your search."
                : "No subscriptions found for this organization."
            }
            actions={[{ label: "View", onPress: setSelected }]}
          />
        )}
      </ScrollView>

      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        {selected ? (
          <View style={styles.overlay}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <View>
                  <Text variant="h2" color="text">
                    {selected.subscription.subscriptionNumber}
                  </Text>
                  <Text variant="bodySmall" color="textMuted">
                    Subscription details
                  </Text>
                </View>
                <Pressable onPress={() => setSelected(null)}>
                  <Text variant="body" color="textMuted">
                    ✕
                  </Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                <View style={styles.detailsGrid}>
                  <DetailItem
                    label="Customer"
                    value={displayName(selected.user)}
                  />
                  <DetailItem
                    label="Customer Email"
                    value={selected.user?.primaryEmail ?? "—"}
                  />
                  <DetailItem
                    label="Customer Phone"
                    value={phone(selected.user)}
                  />
                  <DetailItem
                    label="Organization User ID"
                    value={selected.organizationUser.id}
                  />
                  <DetailItem
                    label="Subscription Plan"
                    value={
                      selected.subscriptionPlan?.subscriptionPlanName ?? "—"
                    }
                  />
                  <DetailItem
                    label="Plan Code"
                    value={
                      selected.subscriptionPlan?.subscriptionPlanCode ?? "—"
                    }
                  />
                  <DetailItem
                    label="Membership Product"
                    value={
                      selected.membershipProduct?.displayName ??
                      selected.membershipProduct?.membershipProductName ??
                      "—"
                    }
                  />
                  <DetailItem
                    label="Purchase Date"
                    value={formatDate(selected.subscription.subscriptionDate)}
                  />
                  <DetailItem
                    label="Start Date"
                    value={formatDate(selected.subscription.startDate)}
                  />
                  <DetailItem
                    label="End Date"
                    value={formatDate(selected.subscription.endDate)}
                  />
                  <DetailItem
                    label="Status"
                    value={formatStatus(
                      selected.subscription.subscriptionStatusId,
                    )}
                  />
                  <DetailItem
                    label="Total Amount"
                    value={formatMoney(selected.subscription.totalAmount)}
                  />
                  <DetailItem
                    label="Created At"
                    value={formatDateTime(selected.subscription.createdAt)}
                  />
                </View>
                <Pressable
                  style={styles.close}
                  onPress={() => setSelected(null)}
                >
                  <Text variant="body" color="text">
                    Close
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  screen: { padding: 18, gap: 18 },
  header: { gap: 4 },
  summary: { flexDirection: "row", gap: 16 },
  summaryCard: {
    width: 190,
    minHeight: 90,
    borderWidth: 1,
    borderColor: "#d6dce2",
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  center: { padding: 40, alignItems: "center" },
  primaryCell: { gap: 3 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    width: "90%",
    maxWidth: 900,
    maxHeight: "88%",
    backgroundColor: "white",
    borderRadius: 12,
    overflow: "hidden",
  },
  modalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e1e5e9",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalContent: { padding: 20, gap: 20 },
  detailsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  detailItem: { minWidth: 240, flexGrow: 1, gap: 4 },
  close: {
    borderWidth: 1,
    borderColor: "#d6dce2",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
});
