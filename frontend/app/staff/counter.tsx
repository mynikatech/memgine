import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  Customer,
  encodeRedemptionToken,
  listActiveMemberships,
  MembershipOption,
  MembershipProduct,
  mockServices,
  redeemBenefits,
  redeemFromToken,
  RedemptionContext,
  RedemptionMethod,
  RedemptionResult,
  RedemptionServices,
  Store,
} from "@/src/core";

import { useBusiness, useTranslation } from "@/src/providers";
import { COLORS, RADIUS, SPACING } from "@/src/theme/colors";
import { getSubscriptionPeriodLabel } from "@/src/core/domain/membership-helpers";

const services: RedemptionServices = {
  subscription: mockServices.subscription,
  subscriptionPlan: mockServices.subscriptionPlan,
  benefit: mockServices.benefit,
  redemption: mockServices.redemption,
  customer: mockServices.customer,
  membershipProduct: mockServices.membershipProduct,
  organization: mockServices.organization,
};
type Mode = "qr" | "phone" | "assisted" | "new";

const RESULT_STYLE: Record<
  RedemptionResult["kind"],
  { fg: string; bg: string }
> = {
  SUCCESS: { fg: "#15803D", bg: "#DCFCE7" },
  PARTIAL: { fg: "#B45309", bg: "#FEF3C7" },
  FAILED: { fg: "#B91C1C", bg: "#FEE2E2" },
  INVALID: { fg: "#B91C1C", bg: "#FEE2E2" },
};

export default function StaffCounter() {
  // Staff context is FIXED to the authenticated staff's organization.
  const { organization, principal } = useBusiness();
  const router = useRouter();
  const { t, formatMoney } = useTranslation();

  const orgId = organization.id;

  const staffId = principal.kind === "STAFF" ? principal.staffId : "staff";

  const staffRole = principal.kind === "STAFF" ? principal.role : "STAFF";

  const [store, setStore] = useState<Store | null>(null);

  const [promoCode, setPromoCode] = useState("");

  const [action, setAction] = useState<"redeem" | "sell">("redeem");

  const [mode, setMode] = useState<Mode>("qr");

  const [availableForSale, setAvailableForSale] = useState<MembershipProduct[]>(
    [],
  );

  const [newName, setNewName] = useState("");

  const [newPhone, setNewPhone] = useState("");

  const [result, setResult] = useState<RedemptionResult | null>(null);

  const [error, setError] = useState("");

  const [busy, setBusy] = useState(false);

  // QR
  const [tokenText, setTokenText] = useState("");

  const [samples, setSamples] = useState<{ label: string; raw: string }[]>([]);

  // Phone + OTP
  const [phone, setPhone] = useState("");

  const [otpRequestId, setOtpRequestId] = useState("");

  const [devCode, setDevCode] = useState("");

  const [otpCode, setOtpCode] = useState("");

  const [otpSent, setOtpSent] = useState(false);

  // Staff-assisted lookup
  const [searchTerm, setSearchTerm] = useState("");

  const [searchResults, setSearchResults] = useState<Customer[]>([]);

  const [searched, setSearched] = useState(false);

  // Identified customer
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [memberships, setMemberships] = useState<MembershipOption[]>([]);

  const [selectedSubId, setSelectedSubId] = useState("");

  const [selectedBenefitIds, setSelectedBenefitIds] = useState<Set<string>>(
    new Set(),
  );

  const storeId = store?.id ?? "";

  /*
   * ------------------------------------------------------------
   * Resolve the customer behind a subscription.
   *
   * Subscription no longer contains customerId.
   *
   * Subscription
   *      ↓ organizationUserId
   * OrganizationUser
   *      ↓ userId
   * Customer
   * ------------------------------------------------------------
   */
  const getCustomerForSubscription = useCallback(
    async (subscriptionId: string) => {
      const subscription =
        await mockServices.subscription.getSubscription(subscriptionId);

      if (!subscription) {
        return null;
      }

      const organizationUser =
        await mockServices.organization.getOrganizationUser(
          subscription.organizationUserId,
        );

      if (!organizationUser) {
        return null;
      }

      const customer = await mockServices.customer.getCustomer(
        organizationUser.userId,
      );

      return customer
        ? {
            subscription,
            organizationUser,
            customer,
          }
        : null;
    },
    [],
  );

  /*
   * ------------------------------------------------------------
   * Resolve the MembershipProduct behind a subscription.
   *
   * Subscription
   *      ↓ subscriptionPlanId
   * SubscriptionPlan
   *      ↓ membershipProductId
   * MembershipProduct
   * ------------------------------------------------------------
   */
  const getProductForSubscription = useCallback(
    async (subscriptionId: string) => {
      const subscription =
        await mockServices.subscription.getSubscription(subscriptionId);

      if (!subscription) {
        return null;
      }

      const plan = await mockServices.subscriptionPlan.getPlan(
        subscription.subscriptionPlanId,
      );

      if (!plan) {
        return null;
      }

      const product = await mockServices.membershipProduct.getProduct(
        plan.membershipProductId,
      );

      if (!product) {
        return null;
      }

      return {
        subscription,
        plan,
        product,
      };
    },
    [],
  );

  const resetIdentity = useCallback(() => {
    setTokenText("");
    setPhone("");
    setOtpRequestId("");
    setDevCode("");
    setOtpCode("");
    setOtpSent(false);

    setSearchTerm("");
    setSearchResults([]);
    setSearched(false);

    setNewName("");
    setNewPhone("");

    setCustomer(null);
    setMemberships([]);
    setSelectedSubId("");
    setSelectedBenefitIds(new Set());

    setResult(null);
    setError("");
  }, []);

  /*
   * ------------------------------------------------------------
   * Load fixed store context + generate sample QR tokens.
   * ------------------------------------------------------------
   */
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const orgStores = await mockServices.organization.listStores(orgId);

        const subscriptions =
          await mockServices.subscription.listByOrganization(orgId);

        /*
         * Subscription no longer has "status".
         *
         * The current status is represented by:
         *
         * subscriptionStatusId
         *
         * and the reference-data value is:
         *
         * subscription-status-active
         */
        const activeSubscriptions = subscriptions.filter(
          (subscription) =>
            subscription.subscriptionStatusId === "subscription-status-active",
        );

        const built: {
          label: string;
          raw: string;
        }[] = [];

        for (const subscription of activeSubscriptions) {
          /*
           * Resolve OrganizationUser → Customer.
           */
          const organizationUser =
            await mockServices.organization.getOrganizationUser(
              subscription.organizationUserId,
            );

          if (!organizationUser) {
            continue;
          }

          const customer = await mockServices.customer.getCustomer(
            organizationUser.userId,
          );

          /*
           * Resolve SubscriptionPlan → MembershipProduct.
           */
          const plan = await mockServices.subscriptionPlan.getPlan(
            subscription.subscriptionPlanId,
          );

          if (!plan) {
            continue;
          }

          const product = await mockServices.membershipProduct.getProduct(
            plan.membershipProductId,
          );

          if (!product) {
            continue;
          }

          const benefits = await mockServices.benefit.listByProduct(
            plan.membershipProductId,
          );

          built.push({
            label: `${customer?.fullName ?? organizationUser.userId} · ${
              product.displayName ?? product.membershipProductName
            }`,

            /*
             * Redemption token format is intentionally unchanged.
             *
             * The token is an operational QR payload, not the
             * Subscription entity itself.
             */
            raw: encodeRedemptionToken({
              version: 1,
              code: `RDM-${subscription.id.toUpperCase()}`,
              customerId: organizationUser.userId,
              organizationId: orgId,
              subscriptionId: subscription.id,
              benefitIds: benefits.map((benefit) => benefit.id),
              createdAt: new Date().toISOString(),
            }),
          });
        }

        if (!active) {
          return;
        }

        setStore(orgStores[0] ?? null);

        setSamples(built);

        resetIdentity();
      } catch {
        if (!active) {
          return;
        }

        setStore(null);
        setSamples([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [orgId, resetIdentity]);

  /*
   * ------------------------------------------------------------
   * Redemption context
   *
   * Redemption itself remains organization-level because the staff
   * member is operating inside one business/store.
   * ------------------------------------------------------------
   */
  const ctx = (method: RedemptionMethod): RedemptionContext => ({
    organizationId: orgId,
    storeId,
    staffId,
    method,
    promoCode: promoCode.trim() || undefined,
  });

  /*
   * ------------------------------------------------------------
   * Membership selection
   * ------------------------------------------------------------
   */
  const selectMembership = (
    subId: string,
    opts: MembershipOption[] = memberships,
  ) => {
    setSelectedSubId(subId);

    const opt = opts.find((item) => item.subscription.id === subId);

    setSelectedBenefitIds(
      new Set(
        (opt?.benefits ?? [])
          .filter((benefit) => benefit.available)
          .map((benefit) => benefit.id),
      ),
    );
  };

  /*
   * ------------------------------------------------------------
   * Identify customer
   * ------------------------------------------------------------
   */
  const identifyCustomer = async (customerId: string) => {
    const cust = await mockServices.customer.getCustomer(customerId);

    setCustomer(cust);

    if (!cust) {
      setMemberships([]);
      setAvailableForSale([]);
      setSelectedSubId("");
      setSelectedBenefitIds(new Set());
      return;
    }

    /*
     * listActiveMemberships has the organization/customer abstraction
     * used by the redemption UI.
     *
     * Its implementation will resolve the OrganizationUser +
     * SubscriptionPlan relationship.
     */
    const opts = await listActiveMemberships(services, orgId, customerId);

    setMemberships(opts);

    /*
     * ----------------------------------------------------------
     * Determine owned MembershipProducts.
     *
     * MembershipOption contains Subscription, but Subscription
     * no longer has membershipProductId.
     *
     * Resolve:
     *
     * Subscription → SubscriptionPlan → MembershipProduct
     * ----------------------------------------------------------
     */
    const ownedProductIds = new Set<string>();

    for (const option of opts) {
      const plan = await mockServices.subscriptionPlan.getPlan(
        option.subscription.subscriptionPlanId,
      );

      if (plan) {
        ownedProductIds.add(plan.membershipProductId);
      }
    }

    /*
     * Available published products that the customer
     * does not already own.
     */
    const catalog = await mockServices.membershipProduct.listProducts(orgId);

    setAvailableForSale(
      catalog.filter(
        (product) =>
          product.productStatusId === "product-status-active" &&
          !ownedProductIds.has(product.id),
      ),
    );

    if (opts.length) {
      selectMembership(opts[0].subscription.id, opts);
    } else {
      setSelectedSubId("");
      setSelectedBenefitIds(new Set());
    }
  };

  /*
   * ------------------------------------------------------------
   * Create or find customer
   * ------------------------------------------------------------
   */
  const createOrFindThenIdentify = async () => {
    setError("");

    if (!newName.trim() || !newPhone.trim()) {
      setError("Enter both name and phone.");
      return;
    }

    const existing = (
      await mockServices.customer.findCustomers({
        phone: newPhone.trim(),
      })
    )[0];

    const cust =
      existing ??
      (await mockServices.customer.createCustomer({
        fullName: newName.trim(),
        phone: newPhone.trim(),
      }));

    await identifyCustomer(cust.id);
  };

  /*
   * ------------------------------------------------------------
   * Price
   * ------------------------------------------------------------
   */
  const priceLabel = (product: MembershipProduct) => {
    const plan = product.plans[0];

    if (!plan) {
      return "";
    }

    const interval = getSubscriptionPeriodLabel(plan);

    return `${formatMoney(plan.price.amountMinor)} · ${interval}`;
  };

  /*
   * ------------------------------------------------------------
   * Sell membership
   * ------------------------------------------------------------
   */
  const sellProduct = (productId: string) => {
    if (!customer) {
      return;
    }

    router.push(
      `/join?organizationId=${orgId}&productId=${productId}&customerId=${customer.id}&staffId=${staffId}&storeId=${storeId}&source=STAFF_ASSISTED`,
    );
  };

  /*
   * ------------------------------------------------------------
   * QR redemption
   * ------------------------------------------------------------
   */
  const runQr = async () => {
    setBusy(true);
    setResult(null);

    const res = await redeemFromToken(
      services,
      ctx(RedemptionMethod.QR),
      tokenText,
    );

    setResult(res);
    setBusy(false);
  };

  /*
   * ------------------------------------------------------------
   * OTP
   * ------------------------------------------------------------
   */
  const sendOtp = async () => {
    setError("");

    if (!phone.trim()) {
      setError("Enter a phone number.");
      return;
    }

    const res = await mockServices.auth.sendOtp({
      mobile: phone.trim(),
    });

    setOtpRequestId(res.requestId);

    setDevCode(res.devCode);

    setOtpSent(true);
  };

  const verifyOtp = async () => {
    setError("");

    const res = await mockServices.auth.verifyOtp({
      requestId: otpRequestId,
      code: otpCode.trim(),
    });

    if (!res.verified || !res.customerId) {
      setError("Incorrect code. Try again.");
      return;
    }

    await identifyCustomer(res.customerId);
  };

  /*
   * ------------------------------------------------------------
   * Staff-assisted customer search
   * ------------------------------------------------------------
   */
  const runSearch = async () => {
    setError("");
    setCustomer(null);
    setMemberships([]);

    const term = searchTerm.trim();

    if (!term) {
      setError("Enter a phone number or name to search.");
      return;
    }

    const byName = await mockServices.customer.findCustomers({
      nameContains: term,
    });

    const byPhone = await mockServices.customer.findCustomers({
      phone: term,
    });

    const merged = [...byName];

    for (const c of byPhone) {
      if (!merged.some((m) => m.id === c.id)) {
        merged.push(c);
      }
    }

    setSearchResults(merged);

    setSearched(true);
  };

  /*
   * ------------------------------------------------------------
   * Manual redemption
   * ------------------------------------------------------------
   */
  const runManual = async (method: RedemptionMethod) => {
    setBusy(true);
    setResult(null);

    const res = await redeemBenefits(services, ctx(method), {
      subscriptionId: selectedSubId,

      benefitIds: Array.from(selectedBenefitIds),
    });

    setResult(res);

    if (customer) {
      const opts = await listActiveMemberships(services, orgId, customer.id);

      setMemberships(opts);

      const opt = opts.find((item) => item.subscription.id === selectedSubId);

      setSelectedBenefitIds(
        new Set(
          (opt?.benefits ?? [])
            .filter((benefit) => benefit.available)
            .map((benefit) => benefit.id),
        ),
      );
    }

    setBusy(false);
  };

  const toggleBenefit = (id: string) =>
    setSelectedBenefitIds((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });

  const selectedOption = memberships.find(
    (option) => option.subscription.id === selectedSubId,
  );

  const selectedCount = useMemo(
    () =>
      (selectedOption?.benefits ?? []).filter(
        (benefit) => benefit.available && selectedBenefitIds.has(benefit.id),
      ).length,
    [selectedOption, selectedBenefitIds],
  );

  /*
   * ------------------------------------------------------------
   * Benefit selection
   * ------------------------------------------------------------
   */
  const renderBenefitSelection = (method: RedemptionMethod) => {
    if (!customer) {
      return null;
    }

    return (
      <View
        style={{
          gap: SPACING.xs,
        }}
      >
        <Text style={styles.identified}>Customer: {customer.fullName}</Text>

        {memberships.length === 0 ? (
          <Text style={styles.muted}>
            No active memberships at this business.
          </Text>
        ) : (
          <>
            {memberships.length > 1 ? (
              <View style={styles.rowWrap}>
                {memberships.map((option) => {
                  const on = option.subscription.id === selectedSubId;

                  return (
                    <Pressable
                      key={option.subscription.id}
                      testID={`counter-membership-${option.subscription.id}`}
                      onPress={() => selectMembership(option.subscription.id)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {option.tier ?? option.productName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {selectedOption?.benefits.map((benefit) => {
              const on =
                benefit.available && selectedBenefitIds.has(benefit.id);

              return (
                <Pressable
                  key={benefit.id}
                  testID={`counter-benefit-${benefit.id}`}
                  disabled={!benefit.available}
                  onPress={() => toggleBenefit(benefit.id)}
                  style={[
                    styles.benefitRow,
                    !benefit.available && {
                      opacity: 0.5,
                    },
                  ]}
                >
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Text style={styles.benefitTitle}>
                      {" "}
                      {benefit.displayName ?? benefit.benefitName}
                    </Text>

                    {benefit.description ? (
                      <Text style={styles.muted}>{benefit.description}</Text>
                    ) : null}
                  </View>

                  {!benefit.available ? (
                    <Text style={styles.usedTag}>USED</Text>
                  ) : null}
                </Pressable>
              );
            })}

            <View style={styles.redeemBar}>
              <Text style={styles.muted}>{selectedCount} selected</Text>

              <Pressable
                testID="counter-redeem-manual"
                disabled={selectedCount === 0 || busy}
                onPress={() => runManual(method)}
                style={[
                  styles.primaryBtn,
                  (selectedCount === 0 || busy) && styles.btnDisabled,
                ]}
              >
                <Text style={styles.primaryBtnText}>Redeem Selected</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    );
  };

  /*
   * ------------------------------------------------------------
   * Sale catalog
   * ------------------------------------------------------------
   */
  const renderSaleCatalog = () => {
    if (!customer) {
      return null;
    }

    return (
      <View
        style={{
          gap: SPACING.xs,
        }}
      >
        <Text style={styles.identified}>Customer: {customer.fullName}</Text>

        {memberships.length ? (
          <>
            <Text style={styles.label}>Current memberships</Text>

            {memberships.map((option) => (
              <Text key={option.subscription.id} style={styles.muted}>
                • {option.tier ?? option.productName} (owned)
              </Text>
            ))}
          </>
        ) : null}

        <Text style={styles.label}>Available memberships</Text>

        {availableForSale.length ? (
          availableForSale.map((product) => (
            <View key={product.id} style={styles.saleRow}>
              <View
                style={{
                  flex: 1,
                }}
              >
                <Text style={styles.benefitTitle}>
                  {product.displayName ?? product.membershipProductName}
                </Text>

                <Text style={styles.muted}>{priceLabel(product)}</Text>
              </View>

              <Pressable
                testID={`counter-sell-${product.id}`}
                onPress={() => sellProduct(product.id)}
                style={styles.primaryBtnInline}
              >
                <Text style={styles.primaryBtnText}>Sell</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>No available products.</Text>
        )}
      </View>
    );
  };

  const afterIdentify = (method: RedemptionMethod) =>
    action === "sell" ? renderSaleCatalog() : renderBenefitSelection(method);

  /*
   * ------------------------------------------------------------
   * Render
   * ------------------------------------------------------------
   */
  return (
    <ScrollView
      testID="staff-counter-screen"
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.h1}>Counter</Text>

      <Text style={styles.muted}>
        Redeem member benefits — QR or staff-assisted.
      </Text>

      {/* Fixed staff context */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Signed in</Text>

        <View style={styles.ctxRow}>
          <Text style={styles.ctxLabel}>Business</Text>

          <Text style={styles.ctxValue}>{organization.displayName}</Text>
        </View>

        <View style={styles.ctxRow}>
          <Text style={styles.ctxLabel}>Store</Text>

          <Text style={styles.ctxValue}>{store?.name ?? "—"}</Text>
        </View>

        <View style={styles.ctxRow}>
          <Text style={styles.ctxLabel}>Staff</Text>

          <Text style={styles.ctxValue}>
            {staffId} · {staffRole}
          </Text>
        </View>

        <Text style={styles.label}>Staff promo / referral code (optional)</Text>

        <TextInput
          testID="counter-promo"
          value={promoCode}
          onChangeText={setPromoCode}
          placeholder="e.g. STAFF-AVA"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
        />
      </View>

      {/* Redeem vs Sell */}
      <View style={styles.modeRow}>
        {(["redeem", "sell"] as const).map((currentAction) => {
          const on = currentAction === action;

          return (
            <Pressable
              key={currentAction}
              testID={`counter-action-${currentAction}`}
              onPress={() => {
                setAction(currentAction);

                setMode(currentAction === "redeem" ? "qr" : "phone");

                resetIdentity();
              }}
              style={[styles.modeBtn, on && styles.modeBtnOn]}
            >
              <Text style={[styles.modeText, on && styles.modeTextOn]}>
                {currentAction === "redeem" ? "Redeem" : "Sell Membership"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Mode */}
      <View style={styles.modeRow}>
        {(action === "redeem"
          ? (["qr", "phone", "assisted"] as Mode[])
          : (["phone", "assisted", "new"] as Mode[])
        ).map((currentMode) => {
          const on = currentMode === mode;

          const label =
            currentMode === "qr"
              ? "Scan QR"
              : currentMode === "phone"
                ? "Phone + OTP"
                : currentMode === "assisted"
                  ? "Staff-Assisted"
                  : "New Customer";

          return (
            <Pressable
              key={currentMode}
              testID={`counter-mode-${currentMode}`}
              onPress={() => {
                setMode(currentMode);
                resetIdentity();
              }}
              style={[styles.modeBtn, on && styles.modeBtnOn]}
            >
              <Text style={[styles.modeText, on && styles.modeTextOn]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* QR */}
      {action === "redeem" && mode === "qr" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scan Redemption QR</Text>

          <Text style={styles.muted}>
            Paste the customer&apos;s redemption token (mocked scanner).
          </Text>

          <TextInput
            testID="counter-qr-input"
            value={tokenText}
            onChangeText={setTokenText}
            placeholder="Redemption token payload…"
            placeholderTextColor={COLORS.textMuted}
            multiline
            style={[styles.input, styles.inputMultiline]}
          />

          {samples.length ? (
            <>
              <Text style={styles.label}>Simulate a customer QR</Text>

              <View style={styles.rowWrap}>
                {samples.map((sample, index) => (
                  <Pressable
                    key={index}
                    testID={`counter-sample-${index}`}
                    onPress={() => setTokenText(sample.raw)}
                    style={styles.chip}
                  >
                    <Text style={styles.chipText}>{sample.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Pressable
            testID="counter-redeem-qr"
            disabled={!tokenText.trim() || busy}
            onPress={runQr}
            style={[
              styles.primaryBtn,
              (!tokenText.trim() || busy) && styles.btnDisabled,
            ]}
          >
            <Text style={styles.primaryBtnText}>Redeem from QR</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Phone + OTP */}
      {mode === "phone" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phone + OTP</Text>

          <TextInput
            testID="counter-phone-input"
            value={phone}
            onChangeText={setPhone}
            placeholder="Customer phone number"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            editable={!otpSent}
          />

          {!otpSent ? (
            <Pressable
              testID="counter-send-otp"
              onPress={sendOtp}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Send OTP</Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.tiny}>Dev code: {devCode}</Text>

              <TextInput
                testID="counter-otp-input"
                value={otpCode}
                onChangeText={setOtpCode}
                placeholder="Enter OTP"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                style={styles.input}
              />

              <Pressable
                testID="counter-verify-otp"
                onPress={verifyOtp}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Verify</Text>
              </Pressable>
            </>
          )}

          {afterIdentify(RedemptionMethod.OTP)}
        </View>
      ) : null}

      {/* Staff-Assisted */}
      {mode === "assisted" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Staff-Assisted Lookup</Text>

          <Text style={styles.muted}>
            For customers without their phone/app. Search by phone or name — no
            OTP.
          </Text>

          <View style={styles.searchRow}>
            <TextInput
              testID="counter-search-input"
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Customer phone or name"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              style={[
                styles.input,
                {
                  flex: 1,
                },
              ]}
            />

            <Pressable
              testID="counter-search"
              onPress={runSearch}
              style={styles.primaryBtnInline}
            >
              <Text style={styles.primaryBtnText}>Search</Text>
            </Pressable>
          </View>

          {searched && searchResults.length === 0 ? (
            <Text style={styles.muted}>No matching customers.</Text>
          ) : null}

          {!customer && searchResults.length > 0 ? (
            <View
              style={{
                gap: 6,
              }}
            >
              {searchResults.map((searchCustomer) => (
                <Pressable
                  key={searchCustomer.id}
                  testID={`counter-customer-${searchCustomer.id}`}
                  onPress={() => identifyCustomer(searchCustomer.id)}
                  style={styles.customerRow}
                >
                  <Text style={styles.benefitTitle}>
                    {searchCustomer.fullName}
                  </Text>

                  <Text style={styles.muted}>
                    {searchCustomer.phone ??
                      searchCustomer.email ??
                      searchCustomer.id}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {afterIdentify(RedemptionMethod.STAFF_ASSISTED)}
        </View>
      ) : null}

      {/* New Customer */}
      {action === "sell" && mode === "new" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>New Customer</Text>

          <Text style={styles.muted}>
            Create a new member. If the phone already exists, that customer is
            used.
          </Text>

          {!customer ? (
            <>
              <TextInput
                testID="counter-new-name"
                value={newName}
                onChangeText={setNewName}
                placeholder="Full name"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
              />

              <TextInput
                testID="counter-new-phone"
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="Phone number"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
                style={styles.input}
              />

              <Pressable
                testID="counter-new-continue"
                onPress={createOrFindThenIdentify}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
              </Pressable>
            </>
          ) : null}

          {afterIdentify(RedemptionMethod.STAFF_ASSISTED)}
        </View>
      ) : null}

      {error ? (
        <Text testID="counter-error" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      {/* Result */}
      {result ? (
        <View
          testID="counter-result"
          style={[
            styles.card,
            {
              backgroundColor: RESULT_STYLE[result.kind].bg,
            },
          ]}
        >
          <Text
            style={[
              styles.resultKind,
              {
                color: RESULT_STYLE[result.kind].fg,
              },
            ]}
          >
            {result.kind}
          </Text>

          <Text style={styles.resultMsg}>{result.message}</Text>

          {result.customer ? (
            <Text style={styles.tiny}>
              {result.customer.fullName}

              {result.subscription ? ` · ${result.subscription.id}` : ""}
            </Text>
          ) : null}

          {result.outcomes.map((outcome) => (
            <Text key={outcome.benefitId} style={styles.outcome}>
              • {outcome.title} — {outcome.status}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    padding: SPACING.md,
    gap: SPACING.sm,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },

  h1: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.text,
  },

  muted: {
    fontSize: 13,
    color: COLORS.textMuted,
  },

  tiny: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  label: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: 8,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },

  ctxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  ctxLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },

  ctxValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },

  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
  },

  inputMultiline: {
    minHeight: 70,
    textAlignVertical: "top",
  },

  searchRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },

  customerRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: 12,
    backgroundColor: COLORS.background,
  },

  saleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: 12,
    backgroundColor: COLORS.background,
  },

  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
  },

  chipOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },

  chipText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "600",
  },

  chipTextOn: {
    color: COLORS.accent,
  },

  modeRow: {
    flexDirection: "row",
    gap: 8,
  },

  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    backgroundColor: COLORS.surface,
  },

  modeBtnOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },

  modeText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textMuted,
  },

  modeTextOn: {
    color: COLORS.accent,
  },

  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },

  primaryBtnInline: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtnText: {
    color: COLORS.background,
    fontSize: 15,
    fontWeight: "700",
  },

  btnDisabled: {
    opacity: 0.45,
  },

  identified: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: SPACING.xs,
  },

  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },

  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  checkOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },

  checkMark: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: "700",
  },

  benefitTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
  },

  usedTag: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textMuted,
  },

  redeemBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.xs,
  },

  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "600",
  },

  resultKind: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  resultMsg: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
  },

  outcome: {
    fontSize: 13,
    color: COLORS.text,
  },
});
