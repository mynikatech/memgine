import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";

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

import { registerCustomerForOrganization } from "@/src/core/customer/customer-registration";

/**
 * Customer acquisition & subscription purchase journey.
 *
 * Reused for:
 * - direct customer purchase
 * - staff-assisted counter purchase
 *
 * Subscription:
 *
 * Customer
 *   -> OrganizationUser
 *      -> Subscription
 *
 * Subscription
 *   -> SubscriptionPlan
 */

type Step =
  | "landing"
  | "register"
  | "otp"
  | "review"
  | "processing"
  | "success";

const DEFAULT_CUSTOMER_ID = "cust-1";

/*
 * --------------------------------------------------------------
 * Country / phone configuration
 * --------------------------------------------------------------
 */

type CountryOption = {
  country: string;
  code: string;
};

const COUNTRY_OPTIONS: CountryOption[] = [
  { country: "Canada", code: "+1" },
  { country: "United States", code: "+1" },
  { country: "India", code: "+91" },
  { country: "United Kingdom", code: "+44" },
  { country: "Australia", code: "+61" },
  { country: "United Arab Emirates", code: "+971" },
  { country: "Singapore", code: "+65" },
];

const DEFAULT_COUNTRY = COUNTRY_OPTIONS[0];

const MAX_PHONE_DIGITS = 10;
const OTP_LENGTH = 6;

const normalizePhone = (value: string): string =>
  value.replace(/\D/g, "").slice(0, MAX_PHONE_DIGITS);

const normalizeOtp = (value: string): string =>
  value.replace(/\D/g, "").slice(0, OTP_LENGTH);

/*
 * --------------------------------------------------------------
 * Payment methods
 * --------------------------------------------------------------
 */

const PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.UPI,
  PaymentMethod.CARD,
  PaymentMethod.CASH,
];

/*
 * --------------------------------------------------------------
 * Subscription helpers
 * --------------------------------------------------------------
 */

const generateSubscriptionNumber = () => {
  const timestamp = Date.now().toString().slice(-8);

  return `SUB-${new Date().getFullYear()}-${timestamp}`;
};

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

  const { setActiveContext, setActiveCustomer } = useCustomerContext();

  const { t, formatMoney, formatDate } = useTranslation();

  const orgId = params.organizationId ?? organization.id;

  const customerId = params.customerId ?? DEFAULT_CUSTOMER_ID;

  /*
   * Staff-assisted purchase is identified only by the navigation
   * source. It is not persisted on Subscription.
   */
  const isStaffSale = params.source === "STAFF_ASSISTED";

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<string | undefined>();

  const [product, setProduct] = useState<MembershipProduct | null>(null);

  const [benefits, setBenefits] = useState<Benefit[]>([]);

  const [customer, setCustomer] = useState<Customer | null>(null);

  const [organizationUserId, setOrganizationUserId] = useState<string | null>(
    null,
  );

  const [step, setStep] = useState<Step>(isStaffSale ? "review" : "landing");

  const [firstName, setFirstName] = useState("");

  const [lastName, setLastName] = useState("");

  /*
   * Canada / +1 is the default.
   */
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY.code);

  const [selectedCountry, setSelectedCountry] =
    useState<CountryOption>(DEFAULT_COUNTRY);

  const [countryPickerVisible, setCountryPickerVisible] = useState(false);

  const [mobile, setMobile] = useState("");

  const [email, setEmail] = useState("");

  /*
   * OTP state
   */
  const [requestId, setRequestId] = useState("");

  const [devCode, setDevCode] = useState("");

  const [code, setCode] = useState("");

  const [otpError, setOtpError] = useState<string | undefined>();

  /*
   * Subscription / payment state
   */
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const [reference, setReference] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.UPI,
  );

  /*
   * --------------------------------------------------------------
   * Load product / customer / OrganizationUser
   * --------------------------------------------------------------
   */

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(undefined);

        console.log("JOIN LOAD", {
          organizationId: orgId,
          productId: params.productId,
          customerId,
          source: params.source,
          staffId: params.staffId,
          storeId: params.storeId,
        });

        let pid = params.productId;

        if (!pid) {
          const list = await mockServices.membershipProduct.listProducts(orgId);

          pid = list[0]?.id;
        }

        if (!pid) {
          throw new Error(
            `No membership product was supplied or found for organization ${orgId}.`,
          );
        }

        const prod = await mockServices.membershipProduct.getProduct(pid);

        if (!prod) {
          throw new Error(`Membership product not found: ${pid}`);
        }

        const bens = await mockServices.benefit.listByProduct(pid);

        const cust = await mockServices.customer.getCustomer(customerId);

        let resolvedOrganizationUserId: string | null = null;

        /*
         * For staff-assisted purchases the customer should already have
         * an OrganizationUser. For direct purchases this may not exist yet.
         */
        try {
          const organizationUsers =
            await mockServices.organization.listOrganizationUsersByUser(
              customerId,
            );

          const organizationUser = organizationUsers.find(
            (item) => item.organizationId === orgId,
          );

          resolvedOrganizationUserId = organizationUser?.id ?? null;
        } catch (organizationUserError) {
          console.warn(
            "JOIN ORGANIZATION USER LOOKUP FAILED",
            organizationUserError,
          );
        }

        if (!mounted) {
          return;
        }

        setProduct(prod);

        setBenefits(bens);

        setCustomer(cust);

        setOrganizationUserId(resolvedOrganizationUserId);
      } catch (error) {
        console.error("JOIN LOAD ERROR", error);

        if (!mounted) {
          return;
        }

        setProduct(null);

        setBenefits([]);

        setCustomer(null);

        setOrganizationUserId(null);

        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load the membership.",
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [
    params.productId,
    params.source,
    params.staffId,
    params.storeId,
    orgId,
    customerId,
  ]);

  const plan = product?.plans[0];

  const intervalLabel = plan ? getSubscriptionPeriodLabel(plan) : "";

  const priceText = plan
    ? `${formatMoney(plan.price.amountMinor)} · ${intervalLabel}`
    : "";

  /*
   * --------------------------------------------------------------
   * Country selection
   * --------------------------------------------------------------
   */

  const selectCountry = (country: CountryOption) => {
    setSelectedCountry(country);

    setCountryCode(country.code);

    setCountryPickerVisible(false);
  };

  /*
   * --------------------------------------------------------------
   * OTP - SEND
   * --------------------------------------------------------------
   */

  const sendOtp = useCallback(async () => {
    try {
      setOtpError(undefined);

      const normalizedMobile = normalizePhone(mobile);

      if (normalizedMobile.length !== MAX_PHONE_DIGITS) {
        setOtpError("Enter a 10-digit mobile number.");

        return;
      }

      const normalizedCountryCode = countryCode.trim() || DEFAULT_COUNTRY.code;

      const fullMobile = `${normalizedCountryCode}${normalizedMobile}`;

      console.log("JOIN SEND OTP", {
        countryCode: normalizedCountryCode,
        mobile: normalizedMobile,
        fullMobile,
      });

      const res = await mockServices.auth.sendOtp({
        mobile: fullMobile,
      });

      setRequestId(String(res.requestId));

      setDevCode(String(res.devCode ?? ""));

      setCode("");

      setStep("otp");
    } catch (error) {
      console.error("SEND OTP ERROR", error);

      setOtpError(
        error instanceof Error
          ? error.message
          : "Unable to send verification code.",
      );
    }
  }, [countryCode, mobile]);

  /*
   * --------------------------------------------------------------
   * OTP - VERIFY
   * --------------------------------------------------------------
   *
   * IMPORTANT:
   *
   * mockServices.auth.verifyOtp() returns:
   *
   *   { verified: true }
   *
   * It deliberately does NOT return customerId.
   *
   * Customer identity is resolved by the customer registration
   * service after OTP authentication.
   */

  const verifyOtp = useCallback(async () => {
    try {
      setOtpError(undefined);

      const normalizedCode = normalizeOtp(code);

      if (!requestId) {
        setOtpError(
          "Verification session has expired. Please request a new OTP.",
        );

        return;
      }

      if (normalizedCode.length !== OTP_LENGTH) {
        setOtpError("Enter the 6-digit verification code.");

        return;
      }

      console.log("JOIN VERIFY OTP", {
        requestId,
        codeLength: normalizedCode.length,
      });

      const res = await mockServices.auth.verifyOtp({
        requestId,
        code: normalizedCode,
      });

      /*
       * Do NOT check res.customerId here.
       */
      if (!res.verified) {
        setOtpError("Incorrect code. Please enter the OTP shown above.");

        return;
      }

      const fullMobile = `${
        countryCode.trim() || DEFAULT_COUNTRY.code
      }${normalizePhone(mobile)}`;

      /*
       * OTP has authenticated the mobile.
       *
       * The registration helper now resolves/creates:
       *
       * Customer
       *    ↓
       * OrganizationUser
       */
      const registration = await registerCustomerForOrganization({
        organizationId: orgId,
        fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
        mobile: fullMobile,
        email: email.trim() || undefined,
      });

      setCustomer(registration.customer);

      setOrganizationUserId(registration.organizationUser.id);

      setActiveCustomer(registration.customer.id);

      console.log("CUSTOMER REGISTRATION COMPLETE", {
        organizationId: orgId,
        customerId: registration.customer.id,
        organizationUserId: registration.organizationUser.id,
      });

      setStep("review");
    } catch (error) {
      console.error("CUSTOMER REGISTRATION ERROR", error);

      setOtpError(
        error instanceof Error
          ? error.message
          : "Unable to complete registration.",
      );
    }
  }, [
    requestId,
    code,
    orgId,
    firstName,
    lastName,
    countryCode,
    mobile,
    email,
    setActiveCustomer,
  ]);

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

    try {
      const payment = await mockServices.payment.pay({
        amountMinor: plan.price.amountMinor,
        currency: plan.price.currency,
        description: product.membershipProductName,
      });

      const subscriptionEntityStatuses =
        await mockServices.entityStatus.listByEntityTypeCode("SUBSCRIPTION");

      let activeSubscriptionEntityStatus:
        | (typeof subscriptionEntityStatuses)[number]
        | undefined;

      for (const entityStatus of subscriptionEntityStatuses) {
        const status = await mockServices.status.getStatus(
          entityStatus.statusId,
        );

        if (status?.statusCode?.trim().toUpperCase() === "ACTIVE") {
          activeSubscriptionEntityStatus = entityStatus;

          break;
        }
      }

      if (!activeSubscriptionEntityStatus) {
        throw new Error("ACTIVE status is not configured for Subscription.");
      }

      const startDate = new Date();

      const endDate = calculateEndDate(
        startDate,
        plan.subscriptionPeriod,
        plan.subscriptionPeriodUnit,
      );

      const startDateString = startDate.toISOString().slice(0, 10);

      const endDateString = endDate.toISOString().slice(0, 10);

      const subscriptionDate = startDateString;

      console.log("STAFF SUBSCRIPTION RELATIONSHIP", {
        isStaffSale,
        customerId,
        organizationUserId,
        organizationId: orgId,
      });

      const sub = await mockServices.subscription.createSubscription({
        subscriptionNumber: generateSubscriptionNumber(),

        subscriptionPlanId: plan.id,

        organizationUserId,

        subscriptionDate,

        startDate: startDateString,

        endDate: endDateString,

        subscriptionStatusId: activeSubscriptionEntityStatus.id,

        totalAmount: {
          amountMinor: plan.price.amountMinor,
          currency: plan.price.currency,
        },

        createdBy:
          isStaffSale && params.staffId ? params.staffId : "user-system",
      });

      console.log("SUBSCRIPTION CREATED", {
        subscriptionId: sub.id,
        subscriptionStatusId: sub.subscriptionStatusId,
      });

      setSubscription(sub);

      setReference(payment.reference);

      /*
       * Make the newly created subscription the active context
       * for the temporary customer-experience demo link.
       */
      setActiveContext(orgId, sub.id);

      setStep("success");
    } catch (error) {
      console.error("JOIN PURCHASE ERROR", error);

      setStep("review");

      setOtpError(
        error instanceof Error
          ? error.message
          : "Unable to complete the purchase.",
      );
    }
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
    router.canGoBack() ? router.back() : router.replace("/customer/cards");

  /*
   * Temporary/demo customer experience.
   *
   * This is intentionally used for BOTH direct and staff-assisted
   * purchases so we can demonstrate the newly created customer's
   * actual subscription experience to the client.
   */
  const goToCustomerExperience = () => {
    if (!subscription) {
      return;
    }

    setActiveContext(orgId, subscription.id);

    router.push(`/business/${subscription.id}`);
  };

  /*
   * Staff sale: Done returns to Counter.
   *
   * Direct customer purchase does not need this action.
   */
  const goToCounter = () => {
    router.back();
  };

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

  if (loading) {
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
   * Load error
   * --------------------------------------------------------------
   */

  if (loadError || !product || !plan) {
    return (
      <Screen
        testID="join-screen"
        edges={["top"]}
        header={<BusinessHeader right={headerRight} />}
      >
        <StateView
          kind="error"
          message={loadError ?? "Unable to load the membership."}
          testID="join-load-error"
        />

        <View
          style={{
            marginTop: theme.spacing.lg,
          }}
        >
          <Button
            label={t("common.done")}
            fullWidth
            onPress={close}
            testID="join-error-close"
          />
        </View>
      </Screen>
    );
  }

  /*
   * --------------------------------------------------------------
   * MAIN
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
      {/* LANDING */}
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

      {/* REGISTER */}
      {step === "register" ? (
        <View
          style={{
            gap: theme.spacing.lg,
          }}
          testID="join-register"
        >
          <View>
            <Text variant="h2" color="text">
              Let&apos;s get you set up
            </Text>

            <Text
              variant="body"
              color="textMuted"
              style={{
                marginTop: theme.spacing.sm,
              }}
            >
              We just need a few details to create your membership.
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: theme.spacing.sm,
            }}
          >
            <View style={{ flex: 1 }}>
              <Input
                label="First Name"
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                testID="join-first-name-input"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Input
                label="Last Name"
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                testID="join-last-name-input"
              />
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: theme.spacing.sm,
              alignItems: "flex-end",
            }}
          >
            <View style={{ width: 125 }}>
              <Text
                variant="bodySmall"
                color="textMuted"
                style={{
                  marginBottom: 6,
                }}
              >
                ISD Code
              </Text>

              <Pressable
                testID="join-country-code-dropdown"
                onPress={() => setCountryPickerVisible(true)}
                style={{
                  minHeight: 48,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                  backgroundColor: theme.colors.background,
                }}
              >
                <Text variant="body" color="text">
                  {selectedCountry.code}
                </Text>

                <Text
                  variant="bodySmall"
                  color="textMuted"
                  style={{
                    marginTop: 2,
                  }}
                >
                  {selectedCountry.country}
                </Text>
              </Pressable>
            </View>

            <View style={{ flex: 1 }}>
              <Input
                label={t("join.mobileLabel")}
                value={mobile}
                onChangeText={(value) => setMobile(normalizePhone(value))}
                placeholder={t("join.mobilePlaceholder")}
                keyboardType="number-pad"
                maxLength={MAX_PHONE_DIGITS}
                testID="join-mobile-input"
              />
            </View>
          </View>

          <Input
            label="Email (optional)"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            testID="join-email-input"
          />

          <Button
            label={t("join.sendOtp")}
            fullWidth
            disabled={
              firstName.trim().length === 0 ||
              lastName.trim().length === 0 ||
              mobile.length !== MAX_PHONE_DIGITS
            }
            onPress={sendOtp}
            testID="join-send-otp"
          />

          <Modal
            visible={countryPickerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setCountryPickerVisible(false)}
          >
            <Pressable
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.45)",
                justifyContent: "center",
                padding: 24,
              }}
              onPress={() => setCountryPickerVisible(false)}
            >
              <Pressable
                onPress={(event) => event.stopPropagation()}
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: theme.radius.lg,
                  padding: theme.spacing.md,
                  maxHeight: "75%",
                }}
              >
                <Text variant="h2" color="text">
                  Select country
                </Text>

                <View
                  style={{
                    marginTop: theme.spacing.md,
                    gap: 8,
                  }}
                >
                  {COUNTRY_OPTIONS.map((country) => (
                    <Pressable
                      key={`${country.country}-${country.code}`}
                      testID={`join-country-${country.country
                        .toLowerCase()
                        .replace(/\s+/g, "-")}`}
                      onPress={() => selectCountry(country)}
                      style={{
                        paddingVertical: 14,
                        paddingHorizontal: 12,
                        borderRadius: theme.radius.md,
                        borderWidth: 1,
                        borderColor:
                          selectedCountry.country === country.country
                            ? theme.colors.primary
                            : theme.colors.border,
                      }}
                    >
                      <Text variant="bodyStrong" color="text">
                        {country.country}
                      </Text>

                      <Text variant="bodySmall" color="textMuted">
                        {country.code}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      ) : null}

      {/* OTP */}
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
            {t("join.otpSentTo", {
              mobile: `${
                countryCode.trim() || DEFAULT_COUNTRY.code
              }${normalizePhone(mobile)}`,
            })}
          </Text>

          <Badge
            label={t("join.devOtp", {
              code: devCode,
            })}
            tone="info"
            testID="join-dev-otp"
          />

          <Input
            label={t("join.otpLabel")}
            value={code}
            onChangeText={(value) => setCode(normalizeOtp(value))}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            error={otpError}
            testID="join-otp-input"
          />

          <Button
            label={t("join.verify")}
            fullWidth
            disabled={code.length !== OTP_LENGTH}
            onPress={verifyOtp}
            testID="join-verify-otp"
          />
        </View>
      ) : null}

      {/* REVIEW */}
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

          {!organizationUserId ? (
            <Text variant="bodySmall" color="textMuted">
              Complete customer registration to continue.
            </Text>
          ) : null}

          <Button
            label={t("join.payAndSubscribe")}
            fullWidth
            disabled={!organizationUserId}
            onPress={payAndSubscribe}
            testID="join-pay"
          />
        </View>
      ) : null}

      {/* PROCESSING */}
      {step === "processing" ? (
        <StateView
          kind="loading"
          message={t("join.processing")}
          testID="join-processing"
        />
      ) : null}

      {/* SUCCESS */}
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

            {isStaffSale ? (
              <>
                <Text variant="h1" color="text">
                  Subscription Created
                </Text>

                <Text
                  variant="body"
                  color="textMuted"
                  style={{
                    textAlign: "center",
                  }}
                >
                  The subscription has been successfully created for{" "}
                  {customer?.fullName ?? customerId}.
                </Text>
              </>
            ) : (
              <>
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
                    product:
                      product.displayName ?? product.membershipProductName,
                  })}
                </Text>
              </>
            )}

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

          {/*
           * Temporary/demo link is deliberately shown
           * for BOTH purchase paths.
           *
           * It demonstrates the newly created customer's
           * customer-facing experience.
           */}
          <Button
            label="View Customer Experience"
            fullWidth
            onPress={goToCustomerExperience}
            testID="join-view-customer-experience"
          />

          {isStaffSale ? (
            <Button
              label={t("common.done")}
              fullWidth
              onPress={() => router.replace("/counter")}
              testID="join-done"
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
