import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { PaymentMethod } from "@/src/core";
import { getSubscriptionPeriodLabel } from "@/src/core/domain/membership-helpers";
import type {
  Benefit,
  Customer,
  MembershipProduct,
  Subscription,
} from "@/src/core";
import { mockServices } from "@/src/core";
import { Screen } from "@/src/layout";
import {
  useBusiness,
  useCustomerContext,
  useTranslation,
} from "@/src/providers";
import {
  Badge,
  Button,
  Card,
  IconButton,
  Input,
  Section,
  StateView,
  Text,
} from "@/src/ui";
import {
  benefitIconForType,
  BenefitItem,
  BusinessHeader,
  ReceiptSummary,
} from "@/src/ui/domain";

/**
 * Customer acquisition & subscription purchase journey (Stage 4).
 *
 * The same journey is reused for:
 * - normal customer purchase
 * - staff-assisted purchase
 *
 * The final Subscription entity is organization-user based:
 *
 * Customer
 *   -> OrganizationUser
 *      -> Subscription
 *
 * Subscription also references SubscriptionPlan rather than
 * MembershipProduct directly.
 */
type Step =
  | "landing"
  | "register"
  | "otp"
  | "review"
  | "processing"
  | "success";

const DEFAULT_CUSTOMER_ID = "cust-1";

const PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.UPI,
  PaymentMethod.CARD,
  PaymentMethod.CASH,
];

/**
 * Generate a customer-facing subscription reference.
 *
 * This is mock/demo generation only. The real backend should generate
 * subscription_number centrally.
 */
const generateSubscriptionNumber = () => {
  const timestamp = Date.now().toString().slice(-8);

  return `SUB-${new Date().getFullYear()}-${timestamp}`;
};

/**
 * Calculate the subscription end date from the selected plan.
 *
 * The current mock plans use subscriptionPeriod + subscriptionPeriodUnit.
 */
const calculateEndDate = (
  startDate: Date,
  period: number,
  unit: string,
): Date => {
  const endDate = new Date(startDate);

  switch (unit.toUpperCase()) {
    case "DAY":
    case "DAYS":
      endDate.setDate(endDate.getDate() + period);
      break;

    case "WEEK":
    case "WEEKS":
      endDate.setDate(endDate.getDate() + period * 7);
      break;

    case "MONTH":
    case "MONTHS":
      endDate.setMonth(endDate.getMonth() + period);
      break;

    case "YEAR":
    case "YEARS":
      endDate.setFullYear(endDate.getFullYear() + period);
      break;

    default:
      endDate.setMonth(endDate.getMonth() + period);
      break;
  }

  return endDate;
};

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

  /*
   * Staff-assisted sale is still supported by the UI.
   *
   * Purchase source is intentionally not stored on Subscription because
   * it is not part of the final Subscription data model.
   */
  const isStaffSale = params.source === "STAFF_ASSISTED";

  const [loading, setLoading] = useState(true);

  const [product, setProduct] = useState<MembershipProduct | null>(null);

  const [benefits, setBenefits] = useState<Benefit[]>([]);

  const [customer, setCustomer] = useState<Customer | null>(null);

  const [organizationUserId, setOrganizationUserId] = useState<string | null>(
    null,
  );

  const [step, setStep] = useState<Step>(isStaffSale ? "review" : "landing");

  const [mobile, setMobile] = useState("");

  const [requestId, setRequestId] = useState("");

  const [devCode, setDevCode] = useState("");

  const [code, setCode] = useState("");

  const [otpError, setOtpError] = useState<string | undefined>();

  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const [reference, setReference] = useState("");

  /*
   * Payment method is purchase-flow state.
   * It is deliberately NOT read from Subscription because paymentMethod
   * is no longer part of the final Subscription entity.
   */
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.UPI,
  );

  /*
   * --------------------------------------------------------------
   * Load product, benefits, customer and OrganizationUser.
   * --------------------------------------------------------------
   */
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        let pid = params.productId;

        if (!pid) {
          const list = await mockServices.membershipProduct.listProducts(orgId);

          pid = list[0]?.id;
        }

        const prod = pid
          ? await mockServices.membershipProduct.getProduct(pid)
          : null;

        const bens = pid ? await mockServices.benefit.listByProduct(pid) : [];

        const cust = await mockServices.customer.getCustomer(customerId);

        /*
         * ----------------------------------------------------------
         * Resolve the OrganizationUser.
         *
         * A Subscription no longer stores customerId or organizationId.
         * The ownership relationship is represented by:
         *
         * Customer/User
         *      ↓
         * OrganizationUser
         *      ↓
         * Subscription
         * ----------------------------------------------------------
         */
        const organizationUsers =
          await mockServices.organization.listOrganizationUsersByUser(
            customerId,
          );

        const organizationUser = organizationUsers.find(
          (item) => item.organizationId === orgId,
        );

        if (!mounted) {
          return;
        }

        setProduct(prod);
        setBenefits(bens);
        setCustomer(cust);
        setOrganizationUserId(organizationUser?.id ?? null);

        setLoading(false);
      } catch {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [params.productId, orgId, customerId]);

  /*
   * The selected product contains its plans.
   *
   * The actual Subscription references the SubscriptionPlan.
   */
  const plan = product?.plans[0];

  const intervalLabel = plan ? getSubscriptionPeriodLabel(plan) : "";

  const priceText = plan
    ? `${formatMoney(plan.price.amountMinor)} · ${intervalLabel}`
    : "";

  /*
   * --------------------------------------------------------------
   * OTP
   * --------------------------------------------------------------
   */

  const sendOtp = useCallback(async () => {
    const res = await mockServices.auth.sendOtp({
      mobile,
    });

    setRequestId(res.requestId);
    setDevCode(res.devCode);
    setCode("");
    setOtpError(undefined);
    setStep("otp");
  }, [mobile]);

  const verifyOtp = useCallback(async () => {
    const res = await mockServices.auth.verifyOtp({
      requestId,
      code,
    });

    if (!res.verified) {
      setOtpError("Incorrect code. Try the dev code shown above.");
      return;
    }

    setStep("review");
  }, [requestId, code]);

  /*
   * --------------------------------------------------------------
   * CREATE SUBSCRIPTION
   * --------------------------------------------------------------
   */
  const payAndSubscribe = useCallback(async () => {
    if (!product || !plan || !organizationUserId) {
      return;
    }

    setStep("processing");

    /*
     * ----------------------------------------------------------
     * Payment
     *
     * The mock payment service still performs the payment.
     * The payment method remains purchase-flow information for
     * the demo. It is not persisted in Subscription.
     * ----------------------------------------------------------
     */
    const payment = await mockServices.payment.pay({
      amountMinor: plan.price.amountMinor,

      currency: plan.price.currency,

      description: product.membershipProductName,
    });

    /*
     * ----------------------------------------------------------
     * Subscription dates
     * ----------------------------------------------------------
     */
    const startDate = new Date();

    const endDate = calculateEndDate(
      startDate,
      plan.subscriptionPeriod,
      plan.subscriptionPeriodUnit,
    );

    const startDateString = startDate.toISOString().slice(0, 10);

    const endDateString = endDate.toISOString().slice(0, 10);

    const subscriptionDate = startDateString;

    /*
     * ----------------------------------------------------------
     * Create the subscription using the FINAL data model.
     *
     * No:
     *   organizationId
     *   customerId
     *   membershipProductId
     *   planId
     *
     * Instead:
     *   organizationUserId
     *   subscriptionPlanId
     * ----------------------------------------------------------
     */
    const sub = await mockServices.subscription.createSubscription({
      subscriptionNumber: generateSubscriptionNumber(),

      subscriptionPlanId: plan.id,

      organizationUserId,

      subscriptionDate,

      startDate: startDateString,

      endDate: endDateString,

      subscriptionStatusId: "subscription-status-active",

      totalAmount: {
        amountMinor: plan.price.amountMinor,

        currency: plan.price.currency,
      },

      createdBy: isStaffSale && params.staffId ? params.staffId : "user-system",
    });

    setSubscription(sub);
    setReference(payment.reference);

    /*
     * For normal customer purchases, enter the customer's
     * membership card/business experience.
     *
     * Organization ID is resolved from the OrganizationUser.
     */
    if (!isStaffSale) {
      setActiveContext(orgId, sub.id);
    }

    setStep("success");
  }, [
    product,
    plan,
    organizationUserId,
    isStaffSale,
    params.staffId,
    orgId,
    setActiveContext,
  ]);

  /*
   * --------------------------------------------------------------
   * Navigation
   * --------------------------------------------------------------
   */

  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/cards");

  const goToCard = () => (isStaffSale ? close() : router.replace("/cards"));

  const headerRight = (
    <IconButton
      icon="close"
      color="textMuted"
      onPress={close}
      testID="join-close"
    />
  );

  /*
   * --------------------------------------------------------------
   * Loading
   * --------------------------------------------------------------
   */
  if (loading || !product || !plan || !organizationUserId) {
    return (
      <Screen
        testID="join-screen"
        edges={["top"]}
        header={<BusinessHeader right={headerRight} />}
      >
        <StateView
          kind="loading"
          message={t("common.loading")}
          testID="join-loading"
        />
      </Screen>
    );
  }

  /*
   * --------------------------------------------------------------
   * MAIN SCREEN
   * --------------------------------------------------------------
   */
  return (
    <Screen
      testID="join-screen"
      edges={["top"]}
      header={
        <BusinessHeader right={headerRight} testID="join-business-header" />
      }
    >
      {/*
       * ==========================================================
       * LANDING
       * ==========================================================
       */}
      {step === "landing" ? (
        <View
          style={{
            gap: theme.spacing.lg,
          }}
          testID="join-landing"
        >
          <View>
            <Badge label={t("join.membership")} tone="brand" />

            <Text
              variant="display"
              color="text"
              style={{
                marginTop: theme.spacing.sm,
              }}
            >
              {product.displayName ?? product.membershipProductName}
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
                {benefits.map((benefit) => (
                  <BenefitItem
                    key={benefit.id}
                    title={benefit.displayName ?? benefit.benefitName}
                    subtitle={benefit.description}
                    icon={benefitIconForType(benefit.benefitTypeId)}
                  />
                ))}
              </View>
            </Card>
          </Section>

          <Button
            label={t("join.joinCta", {
              business: organization.displayName,
            })}
            fullWidth
            onPress={() => setStep("register")}
            testID="join-cta"
          />
        </View>
      ) : null}

      {/*
       * ==========================================================
       * REGISTER
       * ==========================================================
       */}
      {step === "register" ? (
        <View
          style={{
            gap: theme.spacing.lg,
          }}
          testID="join-register"
        >
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

      {/*
       * ==========================================================
       * OTP
       * ==========================================================
       */}
      {step === "otp" ? (
        <View
          style={{
            gap: theme.spacing.lg,
          }}
          testID="join-otp"
        >
          <Text variant="h2" color="text">
            {t("join.otpTitle")}
          </Text>

          <Text variant="bodySmall" color="textMuted">
            {t("join.otpSentTo", { mobile })}
          </Text>

          <Badge
            label={t("join.devOtp", { code: devCode })}
            tone="info"
            testID="join-dev-otp"
          />

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

      {/*
       * ==========================================================
       * REVIEW
       * ==========================================================
       */}
      {step === "review" ? (
        <View
          style={{
            gap: theme.spacing.lg,
          }}
          testID="join-review"
        >
          <Text variant="h2" color="text">
            {t("join.reviewTitle")}
          </Text>

          <ReceiptSummary
            testID="join-review-summary"
            meta={[
              {
                label: t("join.business"),
                value: organization.displayName,
              },

              ...(isStaffSale
                ? [
                    {
                      label: t("join.customer"),
                      value: customer?.fullName ?? customerId,
                    },
                  ]
                : []),

              {
                label: t("join.plan"),
                value: `${
                  product.displayName ?? product.membershipProductName
                } · ${intervalLabel}`,
              },
            ]}
            lines={[
              {
                label: product.membershipProductName,
                amountMinor: plan.price.amountMinor,
              },
            ]}
            totalMinor={plan.price.amountMinor}
          />

          {/*
           * Payment method is only relevant to staff-assisted
           * sales in this current demo flow.
           */}
          {isStaffSale ? (
            <Section title={t("join.paymentMethod")}>
              <View
                style={{
                  flexDirection: "row",
                  gap: theme.spacing.sm,
                }}
              >
                {PAYMENT_METHODS.map((method) => {
                  const selected = method === paymentMethod;

                  return (
                    <Pressable
                      key={method}
                      testID={`join-pay-${method}`}
                      onPress={() => setPaymentMethod(method)}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        alignItems: "center",
                        borderRadius: theme.radius.md,
                        borderWidth: 1,
                        borderColor: selected
                          ? theme.colors.primary
                          : theme.colors.border,
                        backgroundColor: selected
                          ? theme.colors.primarySoft
                          : theme.colors.background,
                      }}
                    >
                      <Text
                        variant="bodyStrong"
                        color={selected ? "primary" : "textMuted"}
                      >
                        {method === PaymentMethod.CARD
                          ? "Card"
                          : method === PaymentMethod.CASH
                            ? "Cash"
                            : "UPI"}
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
                {benefits.map((benefit) => (
                  <BenefitItem
                    key={benefit.id}
                    title={benefit.displayName ?? benefit.benefitName}
                    subtitle={benefit.description}
                    icon={benefitIconForType(benefit.benefitTypeId)}
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

      {/*
       * ==========================================================
       * PROCESSING
       * ==========================================================
       */}
      {step === "processing" ? (
        <StateView
          kind="loading"
          message={t("join.processing")}
          testID="join-processing"
        />
      ) : null}

      {/*
       * ==========================================================
       * SUCCESS
       * ==========================================================
       */}
      {step === "success" && subscription ? (
        <View
          style={{
            gap: theme.spacing.lg,
          }}
          testID="join-success"
        >
          <View
            style={{
              alignItems: "center",
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.lg,
            }}
          >
            <Ionicons
              name="checkmark-circle"
              size={72}
              color={theme.colors.success}
            />

            <Text variant="h1" color="text">
              {t("join.successTitle")}
            </Text>

            <Text
              variant="body"
              color="textMuted"
              style={{
                textAlign: "center",
              }}
            >
              {t("join.successBody", {
                business: organization.displayName,
                product: product.displayName ?? product.membershipProductName,
              })}
            </Text>

            <Badge label={t("membership.active")} tone="success" />
          </View>

          <ReceiptSummary
            testID="join-receipt"
            title={t("join.receiptTitle")}
            meta={[
              {
                label: t("join.business"),
                value: organization.displayName,
              },

              {
                label: t("join.customer"),
                value: customer?.fullName ?? customerId,
              },

              {
                label: t("join.plan"),
                value: `${
                  product.displayName ?? product.membershipProductName
                } · ${intervalLabel}`,
              },

              /*
               * Payment method comes from the purchase flow state,
               * NOT from Subscription.
               */
              ...(isStaffSale
                ? [
                    {
                      label: t("join.paymentMethod"),
                      value: paymentMethod,
                    },
                  ]
                : []),

              {
                label: t("join.date"),
                value: formatDate(subscription.startDate),
              },

              {
                label: t("join.reference"),
                value: reference,
              },

              {
                label: t("join.status"),
                value: t("join.paid"),
              },
            ]}
            lines={[
              {
                label: product.membershipProductName,
                amountMinor: plan.price.amountMinor,
              },
            ]}
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
