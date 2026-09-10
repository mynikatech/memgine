import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, View } from "react-native";

import type {
  Benefit,
  CardStyle,
  MembershipProduct,
  OrganizationUser,
  Subscription,
  Status as DomainStatus,
  User,
} from "@/src/core";

import { services } from "@/src/core";
import { mockServices } from "@/src/core/mocks/mock-services";

import { APP_ROUTES } from "@/src/constants/navigation";
import { Screen } from "@/src/layout";
import {
  BusinessThemeScope,
  useBusiness,
  useCustomerContext,
  useTranslation,
} from "@/src/providers";
import { buildTheme, Theme } from "@/src/theme/theme";
import {
  Badge,
  Card,
  Header,
  ReferenceSelect,
  Section,
  StateView,
  Text,
} from "@/src/ui";
import { MembershipCard } from "@/src/ui/domain";

type Status = "loading" | "error" | "ready";

type CustomerOption = {
  id: string;
  name: string;
  source: "local" | "mock";
};

type CardVM = {
  subscription: Subscription;
  subscriptionStatus?: DomainStatus;
  organizationUser: OrganizationUser;
  product: MembershipProduct;
  benefits: Benefit[];
};

type OrgGroup = {
  organizationId: string;
  organizationName: string;
  theme: Theme;
  cardStyle: CardStyle;
  logoUrl?: string;
  tagline?: string;
  heroImageUrl?: string;
  cards: CardVM[];
};

/**
 * Customer Membership Wallet.
 *
 * Production/customer data path:
 *
 * Authenticated customer
 *   -> global User
 *      -> OrganizationUser(s)
 *         -> Subscription(s)
 *            -> MembershipProduct.plans[]
 *               -> Benefits
 *
 * For the current local/demo phase a temporary customer selector is exposed
 * so multiple customers can be tested. John Smith is resolved from persisted
 * AsyncStorage data. Ada Baker remains an explicitly isolated mock option so
 * the existing mocked business experiences can still be compared.
 *
 * TODO: replace the temporary selector with the authenticated User ID once
 * customer phone authentication is wired in.
 */
export default function MyCards() {
  const router = useRouter();
  const { configuration, setActiveBusiness } = useBusiness();
  const {
    customerId,
    setActiveContext,
    clearActiveContext,
    setActiveCustomer,
  } = useCustomerContext();
  const { t, formatDate } = useTranslation();

  const [status, setStatus] = useState<Status>("loading");
  const [groups, setGroups] = useState<OrgGroup[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId);

  const loadCustomers = useCallback(async () => {
    const byId = new Map<string, CustomerOption>();

    // Real persisted customers only. A User becomes a customer in this
    // selector when it has a customer OrganizationUser relationship.
    const [users, organizations] = await Promise.all([
      services.organization.listUsers(),
      services.organization.listOrganizations(),
    ]);

    const customerUserIds = new Set<string>();

    const organizationUsers = await Promise.all(
      organizations.map((item) =>
        services.organization.listOrganizationUsers(item.id),
      ),
    );

    for (const user of organizationUsers.flat()) {
      if (
        !user.isDeleted &&
        user.organizationUserTypeId.trim().toLowerCase().includes("customer")
      ) {
        customerUserIds.add(user.userId);
      }
    }

    for (const user of users) {
      const candidate = user as User;
      if (candidate.isDeleted || !customerUserIds.has(candidate.id)) {
        continue;
      }

      const name =
        candidate.displayName?.trim() ||
        `${candidate.firstName} ${candidate.lastName}`.trim();

      if (name) {
        byId.set(candidate.id, {
          id: candidate.id,
          name,
          source: "local",
        });
      }
    }

    // Temporary comparison persona. This is the only customer mock retained
    // here; it is intentionally not mixed into the persisted John flow.
    byId.set("cust-1", {
      id: "cust-1",
      name: "Ada Baker (Mock)",
      source: "mock",
    });

    const options = Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    setCustomerOptions(options);

    // Prefer the current context when it represents a real persisted user;
    // otherwise default to the first persisted customer rather than cust-1.
    const current = options.find((item) => item.id === customerId);
    const next =
      current ?? options.find((item) => item.source === "local") ?? options[0];

    if (next) {
      setSelectedCustomerId(next.id);
      setActiveCustomer(next.id);
      return next;
    }

    return null;
  }, [customerId, setActiveCustomer]);

  const load = useCallback(
    async (selectedId: string) => {
      setStatus("loading");

      try {
        const selected = customerOptions.find((item) => item.id === selectedId);

        if (!selected) {
          setGroups([]);
          setStatus("ready");
          return;
        }

        const grouped: OrgGroup[] = [];

        if (selected.source === "mock") {
          /**
           * Temporary mock comparison path for Ada Baker only.
           * This preserves the existing mocked business experiences while the
           * real customer path is migrated to persisted data.
           */
          const organizationUsers =
            await mockServices.organization.listOrganizationUsersByUser(
              selected.id,
            );

          const subscriptionLists = await Promise.all(
            organizationUsers.map((organizationUser: OrganizationUser) =>
              mockServices.subscription.listByOrganizationUser(
                organizationUser.id,
              ),
            ),
          );

          const subscriptions = subscriptionLists.flat();

          for (const subscription of subscriptions) {
            if (subscription.isDeleted) continue;

            const organizationUser = organizationUsers.find(
              (item: OrganizationUser) =>
                item.id === subscription.organizationUserId,
            );
            if (!organizationUser) continue;

            const plan = await mockServices.subscriptionPlan.getPlan(
              subscription.subscriptionPlanId,
            );
            if (!plan) continue;

            const product = await mockServices.membershipProduct.getProduct(
              plan.membershipProductId,
            );
            if (!product) continue;

            const benefits = await mockServices.benefit.listByProduct(
              plan.membershipProductId,
            );

            const organizationId = organizationUser.organizationId;
            let group = grouped.find(
              (item) => item.organizationId === organizationId,
            );

            if (!group) {
              const [ctx, persistedOrganization, branding] = await Promise.all([
                services.organization.getBusinessContext(organizationId),
                services.organization.getOrganization(organizationId),
                services.organization.getOrganizationBranding(organizationId),
              ]);

              // The card must be branded by the subscription's own
              // organization. Never fall back to the currently selected
              // business here because setActiveBusiness changes when a card
              // is opened and would otherwise relabel every other card.
              const organizationName =
                persistedOrganization?.displayName?.trim() ||
                persistedOrganization?.name?.trim() ||
                ctx?.organization.displayName?.trim() ||
                ctx?.organization.name?.trim() ||
                `Business ${organizationId}`;

              group = {
                organizationId,
                organizationName,
                logoUrl: branding?.logoUrl,
                theme: buildTheme(ctx?.configuration.branding),
                cardStyle:
                  ctx?.configuration.customerExperience.cardStyle ??
                  configuration.customerExperience.cardStyle,
                cards: [],
              };

              grouped.push(group);
            }

            group.cards.push({
              subscription,
              organizationUser,
              product,
              benefits,
            });
          }
        } else {
          /**
           * Real customer path.
           * Everything below comes from the canonical service/repository
           * boundary, which currently persists to AsyncStorage.
           */
          const organizationUsers =
            await services.organization.listOrganizationUsersByUser(
              selected.id,
            );

          const subscriptionLists = await Promise.all(
            organizationUsers.map((organizationUser) =>
              services.subscription.listByOrganizationUser(organizationUser.id),
            ),
          );

          const subscriptions = subscriptionLists.flat();

          for (const subscription of subscriptions) {
            if (subscription.isDeleted) continue;

            const organizationUser = organizationUsers.find(
              (item: OrganizationUser) =>
                item.id === subscription.organizationUserId,
            );
            if (!organizationUser) continue;

            const organizationId = organizationUser.organizationId;

            /**
             * Canonical relationship:
             * Subscription.subscriptionPlanId
             *   -> MembershipProduct.plans[].id
             */
            const products =
              await services.membershipProduct.listProducts(organizationId);

            const product = products.find((item) =>
              item.plans.some(
                (plan) => plan.id === subscription.subscriptionPlanId,
              ),
            );

            if (!product) continue;

            const plan = product.plans.find(
              (item) => item.id === subscription.subscriptionPlanId,
            );

            if (!plan) continue;

            // Subscription records use the canonical EntityStatus ID. Resolve
            // through EntityStatus first, then support persisted records that
            // already contain the canonical Status ID.
            const entityStatus = await services.status.getEntityStatus(
              subscription.subscriptionStatusId,
            );
            const subscriptionStatus =
              (entityStatus
                ? await services.status.getStatus(entityStatus.statusId)
                : await services.status.getStatus(
                    subscription.subscriptionStatusId,
                  )) ?? undefined;

            /**
             * Benefits belong to the organization and are linked from the
             * membership product through benefitIds.
             */
            const allBenefits =
              await services.benefit.listByOrganization(organizationId);

            const benefits = allBenefits.filter((benefit) =>
              product.benefitIds.includes(benefit.id),
            );

            let group = grouped.find(
              (item) => item.organizationId === organizationId,
            );

            if (!group) {
              const [ctx, persistedOrganization, branding] = await Promise.all([
                services.organization.getBusinessContext(organizationId),
                services.organization.getOrganization(organizationId),
                services.organization.getOrganizationBranding(organizationId),
              ]);

              // Resolve the business from this card's OrganizationUser, not
              // from the globally active business context. Opening one
              // membership must never rename the other membership cards.
              const organizationName =
                persistedOrganization?.displayName?.trim() ||
                persistedOrganization?.name?.trim() ||
                ctx?.organization.displayName?.trim() ||
                ctx?.organization.name?.trim() ||
                `Business ${organizationId}`;

              group = {
                organizationId,
                organizationName,
                logoUrl: branding?.logoUrl,
                theme: buildTheme(ctx?.configuration.branding),
                cardStyle:
                  ctx?.configuration.customerExperience.cardStyle ??
                  configuration.customerExperience.cardStyle,
                cards: [],
              };

              grouped.push(group);
            }

            group.cards.push({
              subscription,
              subscriptionStatus,
              organizationUser,
              product,
              benefits,
            });
          }
        }

        setGroups(grouped);
        setStatus("ready");
      } catch (error) {
        console.error("[CustomerCards] failed to load customer wallet", error);
        setGroups([]);
        setStatus("error");
      }
    },
    [configuration.customerExperience.cardStyle, customerOptions],
  );

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        setStatus("loading");
        const selected = await loadCustomers();
        if (mounted && selected) {
          await load(selected.id);
        }
      } catch (error) {
        console.error("[CustomerCards] failed to load customers", error);
        if (mounted) {
          setStatus("error");
        }
      }
    };

    void initialize();

    return () => {
      mounted = false;
    };
  }, [loadCustomers]);

  useEffect(() => {
    if (!selectedCustomerId) return;
    if (!customerOptions.some((item) => item.id === selectedCustomerId)) return;

    setActiveCustomer(selectedCustomerId);
    void load(selectedCustomerId);
  }, [selectedCustomerId, customerOptions, setActiveCustomer, load]);

  const handleCustomerChange = useCallback(
    (id: string) => {
      setSelectedCustomerId(id);
      setActiveCustomer(id);
      // Changing the customer must not leave the previous business/subscription
      // active while the new wallet is loading.
      clearActiveContext();
    },
    [clearActiveContext, setActiveCustomer],
  );

  const hasCards = groups.some((group) => group.cards.length > 0);

  const customerSelectItems = useMemo(
    () =>
      customerOptions.map((item) => ({
        id: item.id,
        name: item.name,
      })),
    [customerOptions],
  );

  const openBusiness = (vm: CardVM) => {
    const organizationId = vm.organizationUser.organizationId;

    setActiveBusiness(organizationId);
    setActiveContext(organizationId, vm.subscription.id);

    router.push(APP_ROUTES.business.subscription(vm.subscription.id) as never);
  };

  return (
    <Screen
      testID="customer-cards-screen"
      edges={["top"]}
      header={
        <Header
          title={t("cards.title")}
          subtitle={t("cards.subtitle")}
          testID="cards-header"
        />
      }
    >
      {customerOptions.length > 0 ? (
        <Card padding="md">
          <ReferenceSelect
            label="Customer (temporary test selector)"
            value={selectedCustomerId}
            items={customerSelectItems}
            onChange={handleCustomerChange}
            placeholder="Select customer"
            testID="customer-selector"
          />
          <View style={{ marginTop: 8 }}>
            <Text variant="caption" color="textMuted">
              In production this will come from the authenticated customer
              phone/User ID.
            </Text>
          </View>
        </Card>
      ) : null}

      {status === "loading" ? (
        <StateView
          kind="loading"
          message={t("common.loading")}
          testID="cards-state"
        />
      ) : status === "error" ? (
        <StateView
          kind="error"
          title={t("common.error")}
          actionLabel={t("common.retry")}
          onAction={() => {
            if (selectedCustomerId) {
              void load(selectedCustomerId);
            }
          }}
          testID="cards-state"
        />
      ) : !hasCards ? (
        <StateView
          kind="empty"
          title={t("cards.empty")}
          message={t("cards.emptyBody")}
          testID="cards-state"
        />
      ) : (
        groups.map((group) => (
          <BusinessThemeScope key={group.organizationId} theme={group.theme}>
            <Section
              title={group.organizationName}
              testID={`cards-group-${group.organizationId}`}
            >
              {group.heroImageUrl ? (
                <View
                  style={{
                    width: "100%",
                    height: 190,
                    borderRadius: 16,
                    overflow: "hidden",
                    marginBottom: 12,
                  }}
                >
                  <Image
                    source={{ uri: group.heroImageUrl }}
                    resizeMode="cover"
                    style={{ width: "100%", height: "100%" }}
                    accessibilityLabel={`${group.organizationName} hero`}
                  />
                </View>
              ) : null}

              {group.tagline ? (
                <Text
                  variant="body"
                  color="textSecondary"
                  style={{ marginBottom: 12 }}
                >
                  {group.tagline}
                </Text>
              ) : null}

              {group.cards.map((vm) => {
                const isActive =
                  vm.subscriptionStatus?.statusCode?.trim().toUpperCase() ===
                    "ACTIVE" ||
                  (!vm.subscriptionStatus &&
                    !!vm.subscription.endDate &&
                    new Date(vm.subscription.endDate).getTime() > Date.now());

                return (
                  <Pressable
                    key={vm.subscription.id}
                    testID={`card-${vm.subscription.id}`}
                    onPress={() => openBusiness(vm)}
                  >
                    <Card padding="md">
                      <MembershipCard
                        organizationName={group.organizationName}
                        logoUrl={group.logoUrl}
                        tier={
                          [
                            vm.product.plans.find(
                              (plan) =>
                                plan.id === vm.subscription.subscriptionPlanId,
                            )?.subscriptionPlanName ??
                              vm.product.plans[0]?.subscriptionPlanName,
                            vm.product.membershipProductName,
                          ]
                            .filter(Boolean)
                            .join(" ") ||
                          vm.product.displayName ||
                          "Membership"
                        }
                        validUntil={
                          vm.subscription.endDate
                            ? formatDate(vm.subscription.endDate)
                            : "—"
                        }
                        active={isActive}
                        cardStyle={group.cardStyle}
                      />

                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: 12,
                        }}
                      >
                        <Text variant="bodySmall" color="textMuted">
                          {t("cards.benefitsSummary", {
                            count: vm.benefits.length,
                          })}
                        </Text>

                        <Badge label={t("cards.view")} tone="brand" />
                      </View>
                    </Card>
                  </Pressable>
                );
              })}
            </Section>
          </BusinessThemeScope>
        ))
      )}
    </Screen>
  );
}
