import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  Customer,
  MembershipProduct,
  OrganizationUser,
  Subscription,
  SubscriptionPlan,
} from "@/src/core";

import { services } from "@/src/core";

import { useBusiness } from "@/src/providers";
import { DataTable, DataTableColumn, Input, Text } from "@/src/ui";

type SubscriptionRow = {
  subscription: Subscription;
  organizationUser: OrganizationUser;
  customer?: Customer;
  subscriptionPlan?: SubscriptionPlan;
  membershipProduct?: MembershipProduct;
};

export default function OrgAdminSubscriptions() {
  const { organization } = useBusiness();

  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [selectedSubscription, setSelectedSubscription] =
    useState<SubscriptionRow | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [subscriptions, organizationUsers] = await Promise.all([
          services.subscription.listByOrganization(organization.id),
          services.organization.listOrganizationUsers(organization.id),
        ]);

        const organizationUserMap = new Map<string, OrganizationUser>(
          organizationUsers
            .filter((item) => !item.isDeleted)
            .map((item) => [item.id, item]),
        );

        const resolved = await Promise.all(
          subscriptions
            .filter((subscription) => !subscription.isDeleted)
            .map(async (subscription): Promise<SubscriptionRow | null> => {
              const organizationUser = organizationUserMap.get(
                subscription.organizationUserId,
              );

              if (!organizationUser) {
                return null;
              }

              const [customer, subscriptionPlan] = await Promise.all([
                services.customer.getCustomer(organizationUser.userId),
                services.subscriptionPlan.getPlan(
                  subscription.subscriptionPlanId,
                ),
              ]);

              let membershipProduct: MembershipProduct | undefined;

              if (subscriptionPlan) {
                membershipProduct =
                  (await services.membershipProduct.getProduct(
                    subscriptionPlan.membershipProductId,
                  )) ?? undefined;
              }

              return {
                subscription,
                organizationUser,
                customer: customer ?? undefined,
                subscriptionPlan: subscriptionPlan ?? undefined,
                membershipProduct,
              };
            }),
        );

        if (!mounted) {
          return;
        }

        const validRows = resolved.filter(
          (item): item is SubscriptionRow => item !== null,
        );

        setRows(validRows);
      } catch {
        if (!mounted) {
          return;
        }

        setRows([]);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return rows;
    }

    return rows.filter(
      ({ subscription, customer, subscriptionPlan, membershipProduct }) =>
        subscription.subscriptionNumber.toLowerCase().includes(query) ||
        subscription.id.toLowerCase().includes(query) ||
        subscription.subscriptionStatusId.toLowerCase().includes(query) ||
        subscription.organizationUserId.toLowerCase().includes(query) ||
        subscriptionPlan?.subscriptionPlanName.toLowerCase().includes(query) ||
        subscriptionPlan?.subscriptionPlanCode.toLowerCase().includes(query) ||
        membershipProduct?.membershipProductName
          .toLowerCase()
          .includes(query) ||
        membershipProduct?.displayName?.toLowerCase().includes(query) ||
        customer?.fullName.toLowerCase().includes(query) ||
        customer?.email?.toLowerCase().includes(query) ||
        customer?.phone?.toLowerCase().includes(query),
    );
  }, [rows, search]);

  const activeCount = useMemo(
    () =>
      rows.filter(
        ({ subscription }) =>
          subscription.subscriptionStatusId === "subscription-status-active",
      ).length,
    [rows],
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
              {item.customer?.fullName ?? "Unknown Customer"}
            </Text>

            <Text variant="caption" color="textMuted">
              {item.customer?.email ?? item.customer?.phone ?? "—"}
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
              {item.subscriptionPlan?.subscriptionPlanName ?? "Unknown Plan"}
            </Text>

            <Text variant="caption" color="textMuted">
              {item.membershipProduct?.displayName ??
                item.membershipProduct?.membershipProductName ??
                item.subscriptionPlan?.subscriptionPlanCode ??
                "—"}
            </Text>
          </View>
        ),
      },

      {
        key: "subscriptionDate",
        title: "Purchase Date",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {formatDate(item.subscription.subscriptionDate)}
          </Text>
        ),
      },

      {
        key: "startDate",
        title: "Start Date",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {formatDate(item.subscription.startDate)}
          </Text>
        ),
      },

      {
        key: "endDate",
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

  const handleView = (row: SubscriptionRow) => {
    setSelectedSubscription(row);
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="title" color="text">
              Subscriptions
            </Text>

            <Text variant="bodySmall" color="textMuted">
              View subscriptions purchased by customers of your organization.
            </Text>
          </View>
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

        <View style={styles.searchContainer}>
          <Input
            label="Search Subscriptions"
            value={search}
            onChangeText={setSearch}
            placeholder="Search customer, subscription, plan or status"
          />
        </View>

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
            actions={[
              {
                label: "View",
                onPress: handleView,
              },
            ]}
          />
        )}
      </ScrollView>

      <Modal
        visible={selectedSubscription !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedSubscription(null)}
      >
        {selectedSubscription ? (
          <View style={styles.modalOverlay}>
            <View style={styles.viewModal}>
              <View style={styles.modalHeader}>
                <View style={styles.headerText}>
                  <View style={styles.subscriptionTitleRow}>
                    <Text variant="h2" color="text">
                      {selectedSubscription.subscription.subscriptionNumber}
                    </Text>

                    <View style={styles.statusBadge}>
                      <Text variant="caption" color="text">
                        {formatStatus(
                          selectedSubscription.subscription
                            .subscriptionStatusId,
                        )}
                      </Text>
                    </View>
                  </View>

                  <Text variant="bodySmall" color="textMuted">
                    Subscription details
                  </Text>
                </View>

                <Pressable
                  onPress={() => setSelectedSubscription(null)}
                  style={styles.closeButton}
                >
                  <Text variant="body" color="textMuted">
                    ✕
                  </Text>
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalContent}
              >
                <View style={styles.detailsGrid}>
                  <DetailItem
                    label="Subscription Number"
                    value={selectedSubscription.subscription.subscriptionNumber}
                  />

                  <DetailItem
                    label="Subscription ID"
                    value={selectedSubscription.subscription.id}
                  />

                  <DetailItem
                    label="Customer"
                    value={
                      selectedSubscription.customer?.fullName ??
                      "Unknown Customer"
                    }
                  />

                  <DetailItem
                    label="Customer Email"
                    value={selectedSubscription.customer?.email ?? "—"}
                  />

                  <DetailItem
                    label="Customer Phone"
                    value={selectedSubscription.customer?.phone ?? "—"}
                  />

                  <DetailItem
                    label="Organization User ID"
                    value={selectedSubscription.organizationUser.id}
                  />

                  <DetailItem
                    label="Subscription Plan"
                    value={
                      selectedSubscription.subscriptionPlan
                        ?.subscriptionPlanName ??
                      selectedSubscription.subscriptionPlan
                        ?.subscriptionPlanCode ??
                      "—"
                    }
                  />

                  <DetailItem
                    label="Plan Code"
                    value={
                      selectedSubscription.subscriptionPlan
                        ?.subscriptionPlanCode ?? "—"
                    }
                  />

                  <DetailItem
                    label="Membership Product"
                    value={
                      selectedSubscription.membershipProduct?.displayName ??
                      selectedSubscription.membershipProduct
                        ?.membershipProductName ??
                      "—"
                    }
                  />

                  <DetailItem
                    label="Purchase Date"
                    value={formatDate(
                      selectedSubscription.subscription.subscriptionDate,
                    )}
                  />

                  <DetailItem
                    label="Start Date"
                    value={formatDate(
                      selectedSubscription.subscription.startDate,
                    )}
                  />

                  <DetailItem
                    label="End Date"
                    value={formatDate(
                      selectedSubscription.subscription.endDate,
                    )}
                  />

                  <DetailItem
                    label="Status"
                    value={formatStatus(
                      selectedSubscription.subscription.subscriptionStatusId,
                    )}
                  />

                  <DetailItem
                    label="Total Amount"
                    value={formatMoney(
                      selectedSubscription.subscription.totalAmount,
                    )}
                  />

                  <DetailItem
                    label="Created At"
                    value={formatDateTime(
                      selectedSubscription.subscription.createdAt,
                    )}
                  />

                  <DetailItem
                    label="Version"
                    value={String(selectedSubscription.subscription.versionNo)}
                  />
                </View>

                {selectedSubscription.subscriptionPlan ? (
                  <View style={styles.infoCard}>
                    <Text variant="bodyStrong" color="text">
                      Subscription Plan
                    </Text>

                    <DetailItem
                      label="Plan Name"
                      value={
                        selectedSubscription.subscriptionPlan
                          .subscriptionPlanName
                      }
                    />

                    <DetailItem
                      label="Plan Code"
                      value={
                        selectedSubscription.subscriptionPlan
                          .subscriptionPlanCode
                      }
                    />

                    <DetailItem
                      label="Description"
                      value={
                        selectedSubscription.subscriptionPlan.description ?? "—"
                      }
                    />

                    <DetailItem
                      label="Period"
                      value={`${selectedSubscription.subscriptionPlan.subscriptionPeriod} ${selectedSubscription.subscriptionPlan.subscriptionPeriodUnit}`}
                    />

                    <DetailItem
                      label="Plan Price"
                      value={formatMoney(
                        selectedSubscription.subscriptionPlan.price,
                      )}
                    />

                    <DetailItem
                      label="Plan Status"
                      value={formatStatus(
                        selectedSubscription.subscriptionPlan
                          .subscriptionPlanStatusId,
                      )}
                    />
                  </View>
                ) : null}

                {selectedSubscription.membershipProduct ? (
                  <View style={styles.infoCard}>
                    <Text variant="bodyStrong" color="text">
                      Membership Product
                    </Text>

                    <DetailItem
                      label="Product Name"
                      value={
                        selectedSubscription.membershipProduct
                          .membershipProductName
                      }
                    />

                    <DetailItem
                      label="Display Name"
                      value={
                        selectedSubscription.membershipProduct.displayName ??
                        "—"
                      }
                    />

                    <DetailItem
                      label="Product Code"
                      value={
                        selectedSubscription.membershipProduct
                          .membershipProductCode
                      }
                    />

                    <DetailItem
                      label="Description"
                      value={
                        selectedSubscription.membershipProduct.description ??
                        "—"
                      }
                    />
                  </View>
                ) : null}

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setSelectedSubscription(null)}
                    style={styles.secondaryButton}
                  >
                    <Text variant="body" color="text">
                      Close
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
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

function formatDate(value: string): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatDateTime(value: string): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatStatus(value: string): string {
  if (!value) {
    return "Unknown";
  }

  const normalized = value
    .replace(/^subscription-status-/i, "")
    .replace(/^subscription-plan-status-/i, "")
    .replace(/^status-/i, "");

  return normalized
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoney(value: { amountMinor: number; currency: string }): string {
  return `${value.currency} ${(value.amountMinor / 100).toFixed(2)}`;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  screen: {
    padding: 24,
    gap: 24,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },

  headerText: {
    flex: 1,
    gap: 4,
  },

  summary: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },

  summaryCard: {
    minWidth: 190,
    padding: 18,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    gap: 8,
  },

  searchContainer: {
    maxWidth: 600,
  },

  primaryCell: {
    gap: 2,
  },

  center: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  viewModal: {
    width: "100%",
    maxWidth: 700,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    gap: 20,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },

  subscriptionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },

  modalContent: {
    gap: 20,
    paddingBottom: 4,
  },

  detailsGrid: {
    gap: 16,
  },

  detailItem: {
    gap: 3,
  },

  infoCard: {
    gap: 14,
    padding: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },

  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
});
