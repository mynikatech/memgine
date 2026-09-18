import * as React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import type {
  User,
  MembershipProduct,
  OrganizationUser,
  Redemption,
  Subscription,
} from "@/src/core";
import { services } from "@/src/core";
import { APP_ROUTES } from "@/src/constants/navigation";
import { useBusiness, useTranslation } from "@/src/providers";
import { useCounterSession } from "@/src/core/services/counter-session-context";
import { Screen } from "@/src/layout";
import {
  Badge,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  Header,
  Section,
  StateView,
  Text,
} from "@/src/ui";

type Status = "loading" | "error" | "ready";

type CustomerRedemption = {
  redemption: Redemption;
  benefitName: string;
  storeName: string;
  productName: string;
};

type CustomerRow = {
  user: User;
  organizationUser: OrganizationUser;
  subscriptions: Subscription[];
  productsBySubscriptionId: Record<string, MembershipProduct | undefined>;
  membershipNamesBySubscriptionId: Record<string, string | undefined>;
  redemptions: CustomerRedemption[];
};

function getDisplayName(user: User): string {
  return (
    user.displayName?.trim() ||
    `${user.firstName ?? ""} ${user.middleName ?? ""} ${user.lastName ?? ""}`
      .replace(/\s+/g, " ")
      .trim() ||
    user.userCode
  );
}

function getPhoneDisplay(user: User): string {
  return `${user.primaryPhone?.callingCode ?? ""} ${
    user.primaryPhone?.number ?? ""
  }`.trim();
}

function formatStatusId(statusId: string | undefined): string {
  if (!statusId) {
    return "Unknown";
  }

  const known: Record<string, string> = {
    "status-active": "Active",
    "status-inactive": "Inactive",
    "status-suspended": "Suspended",
    "user-status-active": "Active",
    "user-status-inactive": "Inactive",
    "user-status-suspended": "Suspended",
    "organization-user-status-active": "Active",
    "organization-user-status-inactive": "Inactive",
    "organization-user-status-suspended": "Suspended",
  };

  if (known[statusId]) {
    return known[statusId];
  }

  return statusId
    .replace(/^(user-status|organization-user-status|status)-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusTone(statusId: string | undefined): "success" | "neutral" {
  return formatStatusId(statusId).toLowerCase() === "active"
    ? "success"
    : "neutral";
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

export default function StaffCustomers() {
  const router = useRouter();
  const params = useLocalSearchParams<{ organizationId?: string }>();
  const { organization } = useBusiness();
  const { formatDate } = useTranslation();
  const { context } = useCounterSession();

  const orgId = params.organizationId ?? organization.id;
  const [organizationDisplayName, setOrganizationDisplayName] =
    React.useState("");
  const customersRequest = React.useRef(0);

  const [status, setStatus] = React.useState<Status>("loading");
  const [loadError, setLoadError] = React.useState("Please try again.");
  const [rows, setRows] = React.useState<CustomerRow[]>([]);
  const [search, setSearch] = React.useState("");
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<
    string | null
  >(null);
  const [
    activeSubscriptionEntityStatusId,
    setActiveSubscriptionEntityStatusId,
  ] = React.useState<string | undefined>(undefined);

  const validContext = context?.organizationId === orgId ? context : null;

  React.useEffect(() => {
    let active = true;
    services.organization
      .getOrganization(orgId)
      .then((resolvedOrganization) => {
        if (!active) return;
        if (!resolvedOrganization || resolvedOrganization.isDeleted) {
          throw new Error(`Organization not found: ${orgId}`);
        }
        setOrganizationDisplayName(resolvedOrganization.displayName ?? "");
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load organization.",
        );
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  React.useEffect(() => {
    if (validContext) return;
    router.replace(APP_ROUTES.counter.organization(orgId) as never);
  }, [orgId, router, validContext]);

  const loadCustomers = React.useCallback(async () => {
    if (!validContext) return;
    const requestId = ++customersRequest.current;
    setStatus("loading");
    try {
      const [customers, subscriptions, redemptions, products, statuses] =
        await Promise.all([
          services.counter.customers(validContext),
          services.counter.subscriptions(validContext),
          services.counter.redemptions(validContext),
          services.membershipProduct.listProducts(orgId),
          services.status.listStatusesByEntityTypeCode("SUBSCRIPTION"),
        ]);
      if (requestId !== customersRequest.current) return;
      const activeStatusId = statuses.find(
        (item) => item.statusCode?.toUpperCase() === "ACTIVE",
      )?.id;
      const mappedRows: CustomerRow[] = customers.map((item) => {
        const user = {
          id: item.userId,
          userCode: item.userCode,
          firstName: item.firstName,
          middleName: item.middleName ?? undefined,
          lastName: item.lastName ?? "",
          displayName: item.displayName ?? undefined,
          primaryEmail: item.primaryEmail ?? undefined,
          primaryPhone: {
            countryId: "",
            callingCode: "",
            number: item.primaryPhone,
          },
          userStatusId: item.userStatusId,
          isDeleted: false,
        } as User;
        const organizationUser = {
          id: item.organizationUserId,
          organizationId: orgId,
          userId: item.userId,
          organizationUserTypeId: item.organizationUserTypeId,
          organizationUserStatusId: item.organizationUserStatusId,
          joiningDate: item.joiningDate,
          isDeleted: false,
        } as OrganizationUser;
        const ownSubscriptions = subscriptions.filter(
          (sub) => sub.organizationUserId === item.organizationUserId,
        );
        const mappedSubscriptions = ownSubscriptions.map(
          (sub) =>
            ({
              id: sub.id,
              subscriptionNumber: sub.subscriptionNumber,
              organizationUserId: sub.organizationUserId,
              subscriptionPlanId: sub.subscriptionPlanId,
              subscriptionDate: sub.subscriptionDate,
              startDate: sub.startDate,
              endDate: sub.endDate,
              subscriptionStatusId: sub.subscriptionStatusId,
              totalAmount: {
                amountMinor: Math.round(sub.totalAmount * 100),
                currency: sub.currencyCode,
              },
              isDeleted: false,
            }) as Subscription,
        );
        const productsBySubscriptionId: CustomerRow["productsBySubscriptionId"] =
          {};
        const membershipNamesBySubscriptionId: CustomerRow["membershipNamesBySubscriptionId"] =
          {};
        ownSubscriptions.forEach((sub) => {
          productsBySubscriptionId[sub.id] = products.find(
            (product) => product.id === sub.membershipProductId,
          );
          membershipNamesBySubscriptionId[sub.id] = sub.subscriptionPlanName;
        });
        const subscriptionIds = new Set(ownSubscriptions.map((sub) => sub.id));
        const ownRedemptions: CustomerRedemption[] = redemptions
          .filter((row) => subscriptionIds.has(row.subscriptionId))
          .map((row) => ({
            redemption: {
              id: row.id,
              redemptionNumber: row.redemptionNumber,
              subscriptionId: row.subscriptionId,
              benefitId: row.benefitId,
              storeId: row.storeId,
              staffId: row.staffId ?? undefined,
              redemptionDateTime: row.redemptionDateTime,
              quantity: row.quantity,
              redemptionStatusId: row.redemptionStatusId,
              remarks: row.remarks ?? undefined,
              isDeleted: false,
            } as Redemption,
            benefitName: row.benefitName,
            storeName: row.storeName,
            productName:
              ownSubscriptions.find((sub) => sub.id === row.subscriptionId)
                ?.membershipProductName ?? "Membership",
          }));
        return {
          user,
          organizationUser,
          subscriptions: mappedSubscriptions,
          productsBySubscriptionId,
          membershipNamesBySubscriptionId,
          redemptions: ownRedemptions,
        };
      });
      setActiveSubscriptionEntityStatusId(activeStatusId);
      setRows(mappedRows);
      setStatus("ready");
    } catch (error) {
      if (requestId !== customersRequest.current) return;
      setRows([]);
      setLoadError(
        error instanceof Error ? error.message : "Unable to load customers.",
      );
      setStatus("error");
    }
  }, [
    orgId,
    validContext?.organizationId,
    validContext?.staffId,
    validContext?.storeId,
  ]);

  useFocusEffect(
    React.useCallback(() => {
      if (validContext) loadCustomers();
      return () => {
        ++customersRequest.current;
      };
    }, [loadCustomers, validContext]),
  );

  const filteredRows = React.useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      return rows;
    }

    return rows.filter(({ user }) => {
      const name =
        `${user.displayName ?? ""} ${user.firstName ?? ""} ${user.middleName ?? ""} ${user.lastName ?? ""}`.toLowerCase();

      const phone =
        `${user.primaryPhone.callingCode ?? ""} ${user.primaryPhone.number ?? ""}`.toLowerCase();
      const phoneDigits = phone.replace(/\D/g, "").slice(-10);
      const searchDigits = value.replace(/\D/g, "").slice(-10);

      const email = user.primaryEmail?.toLowerCase() ?? "";

      return (
        name.includes(value) ||
        phone.includes(value) ||
        email.includes(value) ||
        (searchDigits.length > 0 && phoneDigits.includes(searchDigits))
      );
    });
  }, [rows, search]);

  const selectedRow = selectedCustomerId
    ? rows.find((row) => row.user.id === selectedCustomerId)
    : undefined;

  const customerColumns = React.useMemo<DataTableColumn<CustomerRow>[]>(
    () => [
      {
        key: "name",
        title: "Customer",
        width: 240,
        render: (item) => (
          <View style={styles.customerCell}>
            <Text variant="bodyStrong" color="text">
              {getDisplayName(item.user)}
            </Text>
            <Text variant="caption" color="textMuted">
              {`Joined ${new Date(
                item.organizationUser.joiningDate,
              ).toLocaleDateString()}`}
            </Text>
          </View>
        ),
      },
      {
        key: "email",
        title: "Email",
        width: 240,
        render: (item) => (
          <Text variant="body" color="text">
            {item.user.primaryEmail ?? "—"}
          </Text>
        ),
      },
      {
        key: "phone",
        title: "Phone",
        width: 180,
        render: (item) => (
          <Text variant="body" color="text">
            {getPhoneDisplay(item.user) || "—"}
          </Text>
        ),
      },
      {
        key: "status",
        title: "Status",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {formatStatusId(item.organizationUser.organizationUserStatusId)}
          </Text>
        ),
      },
      {
        key: "membership",
        title: "Membership",
        width: 220,
        render: (item) => {
          const memberships = item.subscriptions
            .filter(
              (subscription) =>
                !subscription.isDeleted &&
                (activeSubscriptionEntityStatusId === undefined ||
                  subscription.subscriptionStatusId ===
                    activeSubscriptionEntityStatusId),
            )
            .map((subscription) => ({
              tier: item.membershipNamesBySubscriptionId[
                subscription.id
              ]?.trim(),
              product:
                item.productsBySubscriptionId[
                  subscription.id
                ]?.membershipProductName?.trim() ||
                item.productsBySubscriptionId[
                  subscription.id
                ]?.displayName?.trim(),
            }))
            .filter((membership) => membership.tier || membership.product);

          return memberships.length > 0 ? (
            <View style={{ gap: 8 }}>
              {memberships.map((membership, index) => (
                <View
                  key={`${membership.tier ?? "membership"}-${membership.product ?? "product"}-${index}`}
                >
                  {membership.tier ? (
                    <Text variant="body" color="text">
                      {membership.tier}
                    </Text>
                  ) : null}
                  {membership.product ? (
                    <Text variant="caption" color="textMuted">
                      {membership.product}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text variant="body" color="textMuted">
              No membership
            </Text>
          );
        },
      },
    ],
    [activeSubscriptionEntityStatusId],
  );

  if (!validContext || status === "loading") {
    return (
      <Screen
        testID="staff-customers-screen"
        edges={["top"]}
        header={<Header title="Customers" subtitle={organizationDisplayName} />}
      >
        <StateView
          kind="loading"
          message="Loading customers..."
          testID="staff-customers-loading"
        />
      </Screen>
    );
  }

  if (status === "error") {
    return (
      <Screen
        testID="staff-customers-screen"
        edges={["top"]}
        header={<Header title="Customers" subtitle={organizationDisplayName} />}
      >
        <StateView
          kind="error"
          title="Unable to load customers"
          message={loadError}
          actionLabel="Retry"
          onAction={loadCustomers}
          testID="staff-customers-error"
        />
      </Screen>
    );
  }

  /*
   * ------------------------------------------------------------
   * CUSTOMER DETAIL
   * ------------------------------------------------------------
   */
  if (selectedRow) {
    const activeSubscription = activeSubscriptionEntityStatusId
      ? selectedRow.subscriptions.find(
          (subscription) =>
            subscription.subscriptionStatusId ===
            activeSubscriptionEntityStatusId,
        )
      : undefined;

    const activeProduct = activeSubscription
      ? selectedRow.productsBySubscriptionId[activeSubscription.id]
      : undefined;

    const totalRedeemed = selectedRow.redemptions.reduce(
      (total, item) => total + (item.redemption.quantity ?? 1),
      0,
    );

    const sortedRedemptions = selectedRow.redemptions
      .slice()
      .sort(
        (a, b) =>
          new Date(b.redemption.redemptionDateTime).getTime() -
          new Date(a.redemption.redemptionDateTime).getTime(),
      );

    return (
      <Screen
        testID="staff-customer-detail-screen"
        edges={["top"]}
        header={<Header title="Customer" subtitle={organizationDisplayName} />}
      >
        <ScrollView
          contentContainerStyle={styles.detailContent}
          showsVerticalScrollIndicator={false}
        >
          <Button
            label="← Back to Customers"
            variant="ghost"
            onPress={() => setSelectedCustomerId(null)}
          />

          {/* Customer profile */}
          <Card padding="lg">
            <View style={styles.customerHeader}>
              <View style={styles.avatar}>
                <Text variant="h2" color="text">
                  {(getDisplayName(selectedRow.user) ?? "?")
                    .trim()
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>

              <View style={styles.customerHeaderText}>
                <Text variant="h2" color="text">
                  {getDisplayName(selectedRow.user)}
                </Text>

                {getPhoneDisplay(selectedRow.user) ? (
                  <Text variant="body" color="textMuted">
                    {getPhoneDisplay(selectedRow.user)}
                  </Text>
                ) : null}

                {selectedRow.user.primaryEmail ? (
                  <Text variant="bodySmall" color="textMuted">
                    {selectedRow.user.primaryEmail}
                  </Text>
                ) : null}
              </View>

              <Badge
                label={formatStatusId(
                  selectedRow.user.userStatusId,
                ).toUpperCase()}
                tone={statusTone(selectedRow.user.userStatusId)}
              />
            </View>
          </Card>

          {/* Organization relationship */}
          <Card padding="lg">
            <Text variant="bodyStrong" color="text">
              Business Relationship
            </Text>

            <View style={styles.infoRow}>
              <Text variant="bodySmall" color="textMuted">
                Customer status
              </Text>
              <Text variant="bodySmall" color="text">
                {formatStatusId(
                  selectedRow.organizationUser.organizationUserStatusId,
                )}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text variant="bodySmall" color="textMuted">
                Joined business
              </Text>
              <Text variant="bodySmall" color="text">
                {selectedRow.organizationUser.joiningDate
                  ? formatDate(selectedRow.organizationUser.joiningDate)
                  : "—"}
              </Text>
            </View>
          </Card>

          {/* Membership */}
          <Section title="Memberships">
            {selectedRow.subscriptions.length === 0 ? (
              <Card padding="lg">
                <Text variant="body" color="textMuted">
                  No memberships found for this customer.
                </Text>
              </Card>
            ) : (
              selectedRow.subscriptions.map((subscription) => {
                const product =
                  selectedRow.productsBySubscriptionId[subscription.id];

                const isActive =
                  activeSubscriptionEntityStatusId !== undefined &&
                  subscription.subscriptionStatusId ===
                    activeSubscriptionEntityStatusId;

                return (
                  <Card key={subscription.id} padding="lg">
                    <View style={styles.membershipHeader}>
                      <View style={styles.membershipText}>
                        <Text variant="h2" color="text">
                          {selectedRow.membershipNamesBySubscriptionId[
                            subscription.id
                          ] ?? "Membership"}
                        </Text>

                        <Text variant="bodySmall" color="textMuted">
                          {product?.membershipProductName ??
                            product?.displayName ??
                            "Membership Product"}
                        </Text>
                      </View>

                      <Badge
                        label={isActive ? "ACTIVE" : "INACTIVE"}
                        tone={isActive ? "success" : "neutral"}
                      />
                    </View>

                    <View style={styles.infoRow}>
                      <Text variant="bodySmall" color="textMuted">
                        Start date
                      </Text>

                      <Text variant="bodySmall" color="text">
                        {subscription.startDate
                          ? formatDate(subscription.startDate)
                          : "—"}
                      </Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Text variant="bodySmall" color="textMuted">
                        Valid until
                      </Text>

                      <Text variant="bodySmall" color="text">
                        {subscription.endDate
                          ? formatDate(subscription.endDate)
                          : "—"}
                      </Text>
                    </View>

                    {isActive ? (
                      <View style={styles.membershipAction}>
                        <Pressable
                          onPress={() =>
                            router.push(
                              APP_ROUTES.business.subscription(
                                subscription.id,
                              ) as never,
                            )
                          }
                          testID={`view-membership-${subscription.id}`}
                        >
                          <Text variant="bodyStrong" color="text">
                            View Customer Experience →
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </Section>

          {/* Redemption summary */}
          <Section title="Redemption History">
            {selectedRow.redemptions.length === 0 ? (
              <Card padding="lg">
                <Text variant="body" color="textMuted">
                  No redemptions yet.
                </Text>
              </Card>
            ) : (
              <>
                <Card padding="lg">
                  <Text variant="h2" color="text">
                    {totalRedeemed}
                  </Text>

                  <Text variant="body" color="textMuted">
                    Total benefits redeemed
                  </Text>

                  <Text
                    variant="bodySmall"
                    color="textMuted"
                    style={styles.summarySecondary}
                  >
                    {selectedRow.redemptions.length} redemption{" "}
                    {selectedRow.redemptions.length === 1
                      ? "transaction"
                      : "transactions"}
                  </Text>
                </Card>

                <View style={styles.redemptionList}>
                  {sortedRedemptions.map(
                    ({ redemption, benefitName, storeName, productName }) => (
                      <Card key={redemption.id} padding="md">
                        <View style={styles.redemptionRow}>
                          <View style={styles.redemptionMain}>
                            <Text variant="bodyStrong" color="text">
                              {benefitName}
                            </Text>

                            <Text variant="bodySmall" color="textMuted">
                              {storeName}
                            </Text>

                            <Text variant="caption" color="textMuted">
                              {productName}
                            </Text>
                          </View>

                          <View style={styles.redemptionRight}>
                            <Text variant="bodySmall" color="textMuted">
                              {formatDate(redemption.redemptionDateTime)}
                            </Text>

                            <Text variant="caption" color="textMuted">
                              × {redemption.quantity ?? 1}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    ),
                  )}
                </View>
              </>
            )}
          </Section>
        </ScrollView>
      </Screen>
    );
  }

  /*
   * ------------------------------------------------------------
   * CUSTOMER DIRECTORY
   * ------------------------------------------------------------
   */
  return (
    <Screen
      testID="staff-customers-screen"
      edges={["top"]}
      header={<Header title="Customers" subtitle={organizationDisplayName} />}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text variant="h2" color="text">
            Customers
          </Text>

          <Text variant="body" color="textMuted" style={styles.subtitle}>
            Search customers and view their memberships.
          </Text>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, phone or email"
          placeholderTextColor="#888"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          testID="staff-customer-search"
        />

        <Section title={`Customers (${filteredRows.length})`}>
          {filteredRows.length === 0 ? (
            <Card padding="lg">
              <Text variant="body" color="textMuted">
                {search.trim()
                  ? "No customers match your search."
                  : "No customers are associated with this business yet."}
              </Text>
            </Card>
          ) : (
            <DataTable
              columns={customerColumns}
              data={filteredRows}
              keyExtractor={(item) => item.organizationUser.id}
              actions={[
                {
                  label: "View",
                  onPress: (item) => setSelectedCustomerId(item.user.id),
                },
              ]}
            />
          )}
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 20,
  },

  detailContent: {
    padding: 20,
    gap: 20,
  },

  subtitle: {
    marginTop: 6,
  },

  searchInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D8D8D8",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  customerCell: {
    gap: 3,
  },

  rowMain: {
    flex: 1,
    gap: 3,
  },

  rowRight: {
    alignItems: "flex-end",
  },

  avatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F0EB",
  },

  customerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },

  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F0EB",
  },

  customerHeaderText: {
    flex: 1,
    gap: 3,
  },

  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#EAEAEA",
  },

  detailItem: {
    width: "46%",
    gap: 4,
  },

  membershipHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  membershipText: {
    flex: 1,
    gap: 3,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },

  membershipAction: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#EAEAEA",
  },

  summarySecondary: {
    marginTop: 4,
  },

  redemptionList: {
    gap: 10,
  },

  redemptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  redemptionMain: {
    flex: 1,
    gap: 3,
  },

  redemptionRight: {
    alignItems: "flex-end",
    gap: 3,
  },
});
