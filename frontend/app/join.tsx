import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { BillingInterval, PaymentMethod, PurchaseSource, SubscriptionStatus } from "@/src/core";
import type { Benefit, Customer, MembershipProduct, Subscription } from "@/src/core";
import { mockServices } from "@/src/core";
import { Screen } from "@/src/layout";
import { useBusiness, useCustomerContext, useTranslation } from "@/src/providers";
import { Badge, Button, Card, IconButton, Input, Section, StateView, Text } from "@/src/ui";
import { benefitIconForType, BenefitItem, BusinessHeader, ReceiptSummary } from "@/src/ui/domain";

/**
 * Customer acquisition & subscription purchase journey (Stage 4), reused for
 * both normal customer purchase and staff-assisted sales (source param).
 */
type Step = "landing" | "register" | "otp" | "review" | "processing" | "success";

const DEFAULT_CUSTOMER_ID = "cust-1";
const PAYMENT_METHODS: PaymentMethod[] = [PaymentMethod.UPI, PaymentMethod.CARD, PaymentMethod.CASH];

export default function JoinFlow() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    organizationId?: string;
    productId?: string;
    customerId?: string;
    staffId?: string;
    storeId?: string;
    source?: string;
  }>();
  const { organization, configuration, theme } = useBusiness();
  const { setActiveContext } = useCustomerContext();
  const { t, formatMoney, formatDate } = useTranslation();

  const orgId = params.organizationId ?? organization.id;
  const customerId = params.customerId ?? DEFAULT_CUSTOMER_ID;
  const isStaffSale = params.source === PurchaseSource.STAFF_ASSISTED;

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<MembershipProduct | null>(null);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [step, setStep] = useState<Step>(isStaffSale ? "review" : "landing");
  const [mobile, setMobile] = useState("");
  const [requestId, setRequestId] = useState("");
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState<string | undefined>();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [reference, setReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.UPI);

  useEffect(() => {
    (async () => {
      let pid = params.productId;
      if (!pid) {
        const list = await mockServices.membershipProduct.listProducts(orgId);
        pid = list[0]?.id;
      }
      const prod = pid ? await mockServices.membershipProduct.getProduct(pid) : null;
      const bens = pid ? await mockServices.benefit.listByProduct(pid) : [];
      const cust = await mockServices.customer.getCustomer(customerId);
      setProduct(prod);
      setBenefits(bens);
      setCustomer(cust);
      setLoading(false);
    })();
  }, []);

  const plan = product?.plans[0];
  const intervalLabel =
    plan?.billingInterval === BillingInterval.MONTHLY
      ? t("join.perMonth")
      : plan?.billingInterval === BillingInterval.YEARLY
        ? t("join.perYear")
        : t("join.oneTime");
  const priceText = plan ? `${formatMoney(plan.price.amountMinor)} · ${intervalLabel}` : "";

  const sendOtp = useCallback(async () => {
    const res = await mockServices.auth.sendOtp({ mobile });
    setRequestId(res.requestId);
    setDevCode(res.devCode);
    setCode("");
    setOtpError(undefined);
    setStep("otp");
  }, [mobile]);

  const verifyOtp = useCallback(async () => {
    const res = await mockServices.auth.verifyOtp({ requestId, code });
    if (!res.verified) {
      setOtpError("Incorrect code. Try the dev code shown above.");
      return;
    }
    setStep("review");
  }, [requestId, code]);

  const payAndSubscribe = useCallback(async () => {
    if (!product || !plan) return;
    setStep("processing");
    const payment = await mockServices.payment.pay({
      amountMinor: plan.price.amountMinor,
      currency: configuration.localization.defaultCurrency,
      description: product.name,
    });
    const sub = await mockServices.subscription.createSubscription({
      organizationId: orgId,
      customerId,
      membershipProductId: product.id,
      planId: plan.id,
      source: isStaffSale ? PurchaseSource.STAFF_ASSISTED : PurchaseSource.CUSTOMER,
      staffId: isStaffSale ? params.staffId : undefined,
      storeId: isStaffSale ? params.storeId : undefined,
      paymentMethod: isStaffSale ? paymentMethod : undefined,
    });
    setSubscription(sub);
    setReference(payment.reference);
    if (!isStaffSale) setActiveContext(sub.organizationId, sub.id);
    setStep("success");
  }, [product, plan, configuration.localization.defaultCurrency, setActiveContext, isStaffSale, customerId, orgId, params.staffId, params.storeId, paymentMethod]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/cards"));
  const goToCard = () => (isStaffSale ? close() : router.replace("/cards"));

  const headerRight = (
    <IconButton icon="close" color="textMuted" onPress={close} testID="join-close" />
  );

  if (loading || !product || !plan) {
    return (
      <Screen testID="join-screen" edges={["top"]} header={<BusinessHeader right={headerRight} />}>
        <StateView kind="loading" message={t("common.loading")} testID="join-loading" />
      </Screen>
    );
  }

  return (
    <Screen
      testID="join-screen"
      edges={["top"]}
      header={<BusinessHeader right={headerRight} testID="join-business-header" />}
    >
      {step === "landing" ? (
        <View style={{ gap: theme.spacing.lg }} testID="join-landing">
          <View>
            <Badge label={t("join.membership")} tone="brand" />
            <Text variant="display" color="text" style={{ marginTop: theme.spacing.sm }}>
              {product.tier ?? product.name}
            </Text>
            <Text variant="title" color="primary">
              {priceText}
            </Text>
          </View>
          <Text variant="body" color="textSecondary">
            {configuration.customerExperience.welcomeMessage}
          </Text>
          <Section title={t("join.includedBenefits")}>
            <Card padding="lg">
              <View style={{ gap: 18 }}>
                {benefits.map((b) => (
                  <BenefitItem
                    key={b.id}
                    title={b.title}
                    subtitle={b.description}
                    icon={benefitIconForType(b.type)}
                  />
                ))}
              </View>
            </Card>
          </Section>
          <Button
            label={t("join.joinCta", { business: organization.displayName })}
            fullWidth
            onPress={() => setStep("register")}
            testID="join-cta"
          />
        </View>
      ) : null}

      {step === "register" ? (
        <View style={{ gap: theme.spacing.lg }} testID="join-register">
          <Text variant="h2" color="text">
            {t("join.mobileLabel")}
          </Text>
          <Input
            label={t("join.mobileLabel")}
            value={mobile}
            onChangeText={setMobile}
            placeholder={t("join.mobilePlaceholder")}
            keyboardType="phone-pad"
            testID="join-mobile-input"
          />
          <Button
            label={t("join.sendOtp")}
            fullWidth
            disabled={mobile.replace(/\D/g, "").length < 8}
            onPress={sendOtp}
            testID="join-send-otp"
          />
        </View>
      ) : null}

      {step === "otp" ? (
        <View style={{ gap: theme.spacing.lg }} testID="join-otp">
          <Text variant="h2" color="text">
            {t("join.otpTitle")}
          </Text>
          <Text variant="bodySmall" color="textMuted">
            {t("join.otpSentTo", { mobile })}
          </Text>
          <Badge label={t("join.devOtp", { code: devCode })} tone="info" testID="join-dev-otp" />
          <Input
            label={t("join.otpLabel")}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            error={otpError}
            testID="join-otp-input"
          />
          <Button
            label={t("join.verify")}
            fullWidth
            disabled={code.length < 6}
            onPress={verifyOtp}
            testID="join-verify-otp"
          />
        </View>
      ) : null}

      {step === "review" ? (
        <View style={{ gap: theme.spacing.lg }} testID="join-review">
          <Text variant="h2" color="text">
            {t("join.reviewTitle")}
          </Text>
          <ReceiptSummary
            testID="join-review-summary"
            meta={[
              { label: t("join.business"), value: organization.displayName },
              ...(isStaffSale
                ? [{ label: t("join.customer"), value: customer?.fullName ?? customerId }]
                : []),
              { label: t("join.plan"), value: `${product.tier ?? product.name} · ${intervalLabel}` },
            ]}
            lines={[{ label: product.name, amountMinor: plan.price.amountMinor }]}
            totalMinor={plan.price.amountMinor}
          />
          {isStaffSale ? (
            <Section title={t("join.paymentMethod")}>
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                {PAYMENT_METHODS.map((m) => {
                  const on = m === paymentMethod;
                  return (
                    <Pressable
                      key={m}
                      testID={`join-pay-${m}`}
                      onPress={() => setPaymentMethod(m)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        alignItems: "center",
                        borderRadius: theme.radius.md,
                        borderWidth: 1,
                        borderColor: on ? theme.colors.primary : theme.colors.border,
                        backgroundColor: on ? theme.colors.primarySoft : theme.colors.background,
                      }}
                    >
                      <Text variant="bodyStrong" color={on ? "primary" : "textMuted"}>
                        {m === "CARD" ? "Card" : m === "CASH" ? "Cash" : "UPI"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Section>
          ) : null}
          <Section title={t("join.includedBenefits")}>
            <Card padding="lg">
              <View style={{ gap: 14 }}>
                {benefits.map((b) => (
                  <BenefitItem
                    key={b.id}
                    title={b.title}
                    subtitle={b.description}
                    icon={benefitIconForType(b.type)}
                  />
                ))}
              </View>
            </Card>
          </Section>
          <Button
            label={t("join.payAndSubscribe")}
            fullWidth
            onPress={payAndSubscribe}
            testID="join-pay"
          />
        </View>
      ) : null}

      {step === "processing" ? (
        <StateView kind="loading" message={t("join.processing")} testID="join-processing" />
      ) : null}

      {step === "success" && subscription ? (
        <View style={{ gap: theme.spacing.lg }} testID="join-success">
          <View style={{ alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.lg }}>
            <Ionicons name="checkmark-circle" size={72} color={theme.colors.success} />
            <Text variant="h1" color="text">
              {t("join.successTitle")}
            </Text>
            <Text variant="body" color="textMuted" style={{ textAlign: "center" }}>
              {t("join.successBody", {
                business: organization.displayName,
                product: product.tier ?? product.name,
              })}
            </Text>
            <Badge label={t("membership.active")} tone="success" />
          </View>

          <ReceiptSummary
            testID="join-receipt"
            title={t("join.receiptTitle")}
            meta={[
              { label: t("join.business"), value: organization.displayName },
              { label: t("join.customer"), value: customer?.fullName ?? customerId },
              { label: t("join.plan"), value: `${product.tier ?? product.name} · ${intervalLabel}` },
              ...(isStaffSale && subscription.paymentMethod
                ? [{ label: t("join.paymentMethod"), value: subscription.paymentMethod }]
                : []),
              { label: t("join.date"), value: formatDate(subscription.startedAt) },
              { label: t("join.reference"), value: reference },
              { label: t("join.status"), value: t("join.paid") },
            ]}
            lines={[{ label: product.name, amountMinor: plan.price.amountMinor }]}
            totalMinor={plan.price.amountMinor}
          />

          <Button
            label={isStaffSale ? t("common.done") : t("join.viewCard")}
            fullWidth
            onPress={goToCard}
            testID="join-view-card"
          />
        </View>
      ) : null}
    </Screen>
  );
}
