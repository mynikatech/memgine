import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  BillingInterval,
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
  SubscriptionStatus,
} from "@/src/core";
import { useBusiness, useTranslation } from "@/src/providers";
import { COLORS, RADIUS, SPACING } from "@/src/theme/colors";

const services: RedemptionServices = {
  subscription: mockServices.subscription,
  benefit: mockServices.benefit,
  redemption: mockServices.redemption,
  customer: mockServices.customer,
  membershipProduct: mockServices.membershipProduct,
};

type Mode = "qr" | "phone" | "assisted" | "new";

const RESULT_STYLE: Record<RedemptionResult["kind"], { fg: string; bg: string }> = {
  SUCCESS: { fg: "#15803D", bg: "#DCFCE7" },
  PARTIAL: { fg: "#B45309", bg: "#FEF3C7" },
  FAILED: { fg: "#B91C1C", bg: "#FEE2E2" },
  INVALID: { fg: "#B91C1C", bg: "#FEE2E2" },
};

export default function StaffCounter() {
  // Staff context is FIXED to the authenticated staff's org (mock principal).
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
  const [availableForSale, setAvailableForSale] = useState<MembershipProduct[]>([]);
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

  // Identified customer (manual flows)
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [selectedSubId, setSelectedSubId] = useState("");
  const [selectedBenefitIds, setSelectedBenefitIds] = useState<Set<string>>(new Set());

  const storeId = store?.id ?? "";

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

  // Load fixed store context + generate sample QR tokens for the staff's org.
  useEffect(() => {
    let active = true;
    (async () => {
      const orgStores = await mockServices.organization.listStores(orgId);
      const subs = (await mockServices.subscription.listByOrganization(orgId)).filter(
        (s) => s.status === SubscriptionStatus.ACTIVE,
      );
      const built: { label: string; raw: string }[] = [];
      for (const sub of subs) {
        const product = await mockServices.membershipProduct.getProduct(sub.membershipProductId);
        const cust = await mockServices.customer.getCustomer(sub.customerId);
        const benefits = await mockServices.benefit.listByProduct(sub.membershipProductId);
        built.push({
          label: `${cust?.fullName ?? sub.customerId} · ${product?.tier ?? product?.name ?? sub.membershipProductId}`,
          raw: encodeRedemptionToken({
            version: 1,
            code: `RDM-${sub.id.toUpperCase()}`,
            customerId: sub.customerId,
            organizationId: sub.organizationId,
            subscriptionId: sub.id,
            benefitIds: benefits.map((b) => b.id),
            createdAt: new Date().toISOString(),
          }),
        });
      }
      if (!active) return;
      setStore(orgStores[0] ?? null);
      setSamples(built);
      resetIdentity();
    })();
    return () => {
      active = false;
    };
  }, [orgId, resetIdentity]);

  const ctx = (method: RedemptionMethod): RedemptionContext => ({
    organizationId: orgId,
    storeId,
    staffId,
    method,
    promoCode: promoCode.trim() || undefined,
  });

  const selectMembership = (subId: string, opts: MembershipOption[] = memberships) => {
    setSelectedSubId(subId);
    const opt = opts.find((o) => o.subscription.id === subId);
    setSelectedBenefitIds(new Set((opt?.benefits ?? []).filter((b) => b.available).map((b) => b.id)));
  };

  const identifyCustomer = async (customerId: string) => {
    const cust = await mockServices.customer.getCustomer(customerId);
    setCustomer(cust);
    const opts = await listActiveMemberships(services, orgId, customerId);
    setMemberships(opts);
    // Available published products for this org the customer does not own.
    const catalog = await mockServices.membershipProduct.listProducts(orgId);
    const ownedProductIds = new Set(opts.map((o) => o.subscription.membershipProductId));
    setAvailableForSale(catalog.filter((p) => p.isPublished && !ownedProductIds.has(p.id)));
    if (opts.length) selectMembership(opts[0].subscription.id, opts);
    else {
      setSelectedSubId("");
      setSelectedBenefitIds(new Set());
    }
  };

  const createOrFindThenIdentify = async () => {
    setError("");
    if (!newName.trim() || !newPhone.trim()) {
      setError("Enter both name and phone.");
      return;
    }
    // Reuse an existing customer with this phone, else create a new mock one.
    const existing = (await mockServices.customer.findCustomers({ phone: newPhone.trim() }))[0];
    const cust = existing ?? (await mockServices.customer.createCustomer({
      fullName: newName.trim(),
      phone: newPhone.trim(),
    }));
    await identifyCustomer(cust.id);
  };

  const priceLabel = (p: MembershipProduct) => {
    const plan = p.plans[0];
    if (!plan) return "";
    const interval =
      plan.billingInterval === BillingInterval.MONTHLY
        ? t("join.perMonth")
        : plan.billingInterval === BillingInterval.YEARLY
          ? t("join.perYear")
          : t("join.oneTime");
    return `${formatMoney(plan.price.amountMinor)} · ${interval}`;
  };

  const sellProduct = (productId: string) => {
    if (!customer) return;
    router.push(
      `/join?organizationId=${orgId}&productId=${productId}&customerId=${customer.id}&staffId=${staffId}&storeId=${storeId}&source=STAFF_ASSISTED`,
    );
  };

  /* --------------------------------- actions -------------------------------- */

  const runQr = async () => {
    setBusy(true);
    setResult(null);
    const res = await redeemFromToken(services, ctx(RedemptionMethod.QR), tokenText);
    setResult(res);
    setBusy(false);
  };

  const sendOtp = async () => {
    setError("");
    if (!phone.trim()) {
      setError("Enter a phone number.");
      return;
    }
    const res = await mockServices.auth.sendOtp({ mobile: phone.trim() });
    setOtpRequestId(res.requestId);
    setDevCode(res.devCode);
    setOtpSent(true);
  };

  const verifyOtp = async () => {
    setError("");
    const res = await mockServices.auth.verifyOtp({ requestId: otpRequestId, code: otpCode.trim() });
    if (!res.verified || !res.customerId) {
      setError("Incorrect code. Try again.");
      return;
    }
    await identifyCustomer(res.customerId);
  };

  const runSearch = async () => {
    setError("");
    setCustomer(null);
    setMemberships([]);
    const term = searchTerm.trim();
    if (!term) {
      setError("Enter a phone number or name to search.");
      return;
    }
    const byName = await mockServices.customer.findCustomers({ nameContains: term });
    const byPhone = await mockServices.customer.findCustomers({ phone: term });
    const merged = [...byName];
    for (const c of byPhone) if (!merged.some((m) => m.id === c.id)) merged.push(c);
    setSearchResults(merged);
    setSearched(true);
  };

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
      const opt = opts.find((o) => o.subscription.id === selectedSubId);
      setSelectedBenefitIds(new Set((opt?.benefits ?? []).filter((b) => b.available).map((b) => b.id)));
    }
    setBusy(false);
  };

  const toggleBenefit = (id: string) =>
    setSelectedBenefitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedOption = memberships.find((o) => o.subscription.id === selectedSubId);
  const selectedCount = useMemo(
    () =>
      (selectedOption?.benefits ?? []).filter((b) => b.available && selectedBenefitIds.has(b.id)).length,
    [selectedOption, selectedBenefitIds],
  );

  /* --------------------------------- render --------------------------------- */

  const renderBenefitSelection = (method: RedemptionMethod) => {
    if (!customer) return null;
    return (
      <View style={{ gap: SPACING.xs }}>
        <Text style={styles.identified}>Customer: {customer.fullName}</Text>

        {memberships.length === 0 ? (
          <Text style={styles.muted}>No active memberships at this business.</Text>
        ) : (
          <>
            {memberships.length > 1 ? (
              <View style={styles.rowWrap}>
                {memberships.map((o) => {
                  const on = o.subscription.id === selectedSubId;
                  return (
                    <Pressable
                      key={o.subscription.id}
                      testID={`counter-membership-${o.subscription.id}`}
                      onPress={() => selectMembership(o.subscription.id)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {o.tier ?? o.productName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {selectedOption?.benefits.map((b) => {
              const on = b.available && selectedBenefitIds.has(b.id);
              return (
                <Pressable
                  key={b.id}
                  testID={`counter-benefit-${b.id}`}
                  disabled={!b.available}
                  onPress={() => toggleBenefit(b.id)}
                  style={[styles.benefitRow, !b.available && { opacity: 0.5 }]}
                >
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.benefitTitle}>{b.title}</Text>
                    {b.description ? <Text style={styles.muted}>{b.description}</Text> : null}
                  </View>
                  {!b.available ? <Text style={styles.usedTag}>USED</Text> : null}
                </Pressable>
              );
            })}

            <View style={styles.redeemBar}>
              <Text style={styles.muted}>{selectedCount} selected</Text>
              <Pressable
                testID="counter-redeem-manual"
                disabled={selectedCount === 0 || busy}
                onPress={() => runManual(method)}
                style={[styles.primaryBtn, (selectedCount === 0 || busy) && styles.btnDisabled]}
              >
                <Text style={styles.primaryBtnText}>Redeem Selected</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    );
  };

  const renderSaleCatalog = () => {
    if (!customer) return null;
    return (
      <View style={{ gap: SPACING.xs }}>
        <Text style={styles.identified}>Customer: {customer.fullName}</Text>
        {memberships.length ? (
          <>
            <Text style={styles.label}>Current memberships</Text>
            {memberships.map((o) => (
              <Text key={o.subscription.id} style={styles.muted}>
                • {o.tier ?? o.productName} (owned)
              </Text>
            ))}
          </>
        ) : null}
        <Text style={styles.label}>Available memberships</Text>
        {availableForSale.length ? (
          availableForSale.map((p) => (
            <View key={p.id} style={styles.saleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>{p.tier ?? p.name}</Text>
                <Text style={styles.muted}>{priceLabel(p)}</Text>
              </View>
              <Pressable
                testID={`counter-sell-${p.id}`}
                onPress={() => sellProduct(p.id)}
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


  return (
    <ScrollView
      testID="staff-counter-screen"
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.h1}>Counter</Text>
      <Text style={styles.muted}>Redeem member benefits — QR or staff-assisted.</Text>

      {/* Fixed staff context (no selectors) */}
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

      {/* Action: Redeem vs Sell */}
      <View style={styles.modeRow}>
        {(["redeem", "sell"] as const).map((a) => {
          const on = a === action;
          return (
            <Pressable
              key={a}
              testID={`counter-action-${a}`}
              onPress={() => {
                setAction(a);
                setMode(a === "redeem" ? "qr" : "phone");
                resetIdentity();
              }}
              style={[styles.modeBtn, on && styles.modeBtnOn]}
            >
              <Text style={[styles.modeText, on && styles.modeTextOn]}>
                {a === "redeem" ? "Redeem" : "Sell Membership"}
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
        ).map((m) => {
          const on = m === mode;
          const label =
            m === "qr"
              ? "Scan QR"
              : m === "phone"
                ? "Phone + OTP"
                : m === "assisted"
                  ? "Staff-Assisted"
                  : "New Customer";
          return (
            <Pressable
              key={m}
              testID={`counter-mode-${m}`}
              onPress={() => {
                setMode(m);
                resetIdentity();
              }}
              style={[styles.modeBtn, on && styles.modeBtnOn]}
            >
              <Text style={[styles.modeText, on && styles.modeTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* QR (redeem only) */}
      {action === "redeem" && mode === "qr" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scan Redemption QR</Text>
          <Text style={styles.muted}>Paste the customer&apos;s redemption token (mocked scanner).</Text>
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
                {samples.map((s, i) => (
                  <Pressable
                    key={i}
                    testID={`counter-sample-${i}`}
                    onPress={() => setTokenText(s.raw)}
                    style={styles.chip}
                  >
                    <Text style={styles.chipText}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <Pressable
            testID="counter-redeem-qr"
            disabled={!tokenText.trim() || busy}
            onPress={runQr}
            style={[styles.primaryBtn, (!tokenText.trim() || busy) && styles.btnDisabled]}
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
            <Pressable testID="counter-send-otp" onPress={sendOtp} style={styles.primaryBtn}>
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
              <Pressable testID="counter-verify-otp" onPress={verifyOtp} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Verify</Text>
              </Pressable>
            </>
          )}
          {afterIdentify(RedemptionMethod.OTP)}
        </View>
      ) : null}

      {/* Staff-Assisted lookup (no OTP) */}
      {mode === "assisted" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Staff-Assisted Lookup</Text>
          <Text style={styles.muted}>
            For customers without their phone/app. Search by phone or name — no OTP.
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              testID="counter-search-input"
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Customer phone or name"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              style={[styles.input, { flex: 1 }]}
            />
            <Pressable testID="counter-search" onPress={runSearch} style={styles.primaryBtnInline}>
              <Text style={styles.primaryBtnText}>Search</Text>
            </Pressable>
          </View>

          {searched && searchResults.length === 0 ? (
            <Text style={styles.muted}>No matching customers.</Text>
          ) : null}

          {!customer && searchResults.length > 0 ? (
            <View style={{ gap: 6 }}>
              {searchResults.map((c) => (
                <Pressable
                  key={c.id}
                  testID={`counter-customer-${c.id}`}
                  onPress={() => identifyCustomer(c.id)}
                  style={styles.customerRow}
                >
                  <Text style={styles.benefitTitle}>{c.fullName}</Text>
                  <Text style={styles.muted}>{c.phone ?? c.email ?? c.id}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {afterIdentify(RedemptionMethod.STAFF_ASSISTED)}
        </View>
      ) : null}

      {/* New Customer (sell only) */}
      {action === "sell" && mode === "new" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>New Customer</Text>
          <Text style={styles.muted}>
            Create a new member. If the phone already exists, that customer is used.
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
              <Pressable testID="counter-new-continue" onPress={createOrFindThenIdentify} style={styles.primaryBtn}>
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
          style={[styles.card, { backgroundColor: RESULT_STYLE[result.kind].bg }]}
        >
          <Text style={[styles.resultKind, { color: RESULT_STYLE[result.kind].fg }]}>
            {result.kind}
          </Text>
          <Text style={styles.resultMsg}>{result.message}</Text>
          {result.customer ? (
            <Text style={styles.tiny}>
              {result.customer.fullName}
              {result.subscription ? ` · ${result.subscription.id}` : ""}
            </Text>
          ) : null}
          {result.outcomes.map((o) => (
            <Text key={o.benefitId} style={styles.outcome}>
              • {o.title} — {o.status}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, gap: SPACING.sm, maxWidth: 760, width: "100%", alignSelf: "center" },
  h1: { fontSize: 24, fontWeight: "700", color: COLORS.text },
  muted: { fontSize: 13, color: COLORS.textMuted },
  tiny: { fontSize: 12, color: COLORS.textMuted },
  label: { fontSize: 12, fontWeight: "700", color: COLORS.textMuted, marginTop: SPACING.xs },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  ctxRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ctxLabel: { fontSize: 13, color: COLORS.textMuted },
  ctxValue: { fontSize: 14, fontWeight: "600", color: COLORS.text },
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
  inputMultiline: { minHeight: 70, textAlignVertical: "top" },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
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
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
  },
  chipOn: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  chipText: { fontSize: 13, color: COLORS.textMuted, fontWeight: "600" },
  chipTextOn: { color: COLORS.accent },
  modeRow: { flexDirection: "row", gap: 8 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    backgroundColor: COLORS.surface,
  },
  modeBtnOn: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  modeText: { fontSize: 14, fontWeight: "600", color: COLORS.textMuted },
  modeTextOn: { color: COLORS.accent },
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
  primaryBtnText: { color: COLORS.background, fontSize: 15, fontWeight: "700" },
  btnDisabled: { opacity: 0.45 },
  identified: { fontSize: 15, fontWeight: "700", color: COLORS.text, marginTop: SPACING.xs },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { borderColor: COLORS.accent, backgroundColor: COLORS.accent },
  checkMark: { color: COLORS.background, fontSize: 14, fontWeight: "700" },
  benefitTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  usedTag: { fontSize: 11, fontWeight: "700", color: COLORS.textMuted },
  redeemBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.xs,
  },
  errorText: { color: "#B91C1C", fontSize: 13, fontWeight: "600" },
  resultKind: { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  resultMsg: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  outcome: { fontSize: 13, color: COLORS.text },
});
