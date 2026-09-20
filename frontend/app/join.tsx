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
import { services } from "@/src/core";
import { APP_ROUTES } from "@/src/constants/navigation";
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

import { counterCheckout } from "@/src/core/services/counter-checkout";

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
 *
 * Payment:
 *
 * JoinFlow
 *   -> PaymentService
 *      -> LocalPaymentService (development)
 *      -> Real provider adapter (production)
 *
 * JoinFlow deliberately does NOT know which payment provider is being used.
 */

type Step =
  | "landing"
  | "register"
  | "otp"
  | "purchaseOtp"
  | "review"
  | "processing"
  | "success";

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
 *
 * The selected payment method is currently presentation/UI state.
 *
 * The actual payment is always delegated to services.payment.
 *
 * When the PaymentService contract is extended with provider-specific
 * payment-method information, this state can be passed to the service
 * without changing the rest of the purchase workflow.
 */

const PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.UPI,
  PaymentMethod.CARD,
  PaymentMethod.CASH,
];

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

  const customerId = params.customerId ?? "";

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
  const [activeOrganization, setActiveOrganization] = useState(organization);

  const [step, setStep] = useState<Step>(
    isStaffSale || customerId ? "review" : "landing",
  );
  const [phoneVerified, setPhoneVerified] = useState(false);

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

  // Counter purchase verification is separate from normal customer login/registration OTP.
  // It is requested once for the exact selected membership and reused through payment.
  const [purchaseOtpChallengeId, setPurchaseOtpChallengeId] = useState("");
  const [purchaseOtpDevCode, setPurchaseOtpDevCode] = useState("");
  const [purchaseOtpCode, setPurchaseOtpCode] = useState("");
  const [purchaseOtpVerified, setPurchaseOtpVerified] = useState(false);
  const [purchaseOtpBusy, setPurchaseOtpBusy] = useState(false);

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
   *
   * IMPORTANT:
   *
   * Do NOT use:
   *
   *   services.membershipProduct.getProduct(pid)
   *
   * for this flow.
   *
   * The membership catalogue is loaded for the selected organization.
   *
   * Therefore we load the organization catalogue and resolve the
   * selected product from that catalogue.
   *
   * Benefits are handled the same way:
   *
   *   listByOrganization(orgId)
   *
   * and then filtered against product.benefitIds.
   */

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(undefined);

        const resolvedOrganization =
          orgId === organization.id
            ? organization
            : await services.organization.getOrganization(orgId);

        if (!resolvedOrganization) {
          throw new Error(`Organization not found: ${orgId}`);
        }

        /*
         * --------------------------------------------------------
         * 1. Load organization membership catalogue
         * --------------------------------------------------------
         */
        const membershipProducts =
          await services.customerData.membershipProducts(orgId);

        let pid = params.productId;

        /*
         * If no product was supplied, preserve the existing
         * behaviour of selecting the first available product.
         */
        if (!pid) {
          pid = membershipProducts[0]?.id;
        }

        if (!pid) {
          throw new Error(
            `No membership product was supplied or found for organization ${orgId}.`,
          );
        }

        /*
         * Resolve the product from the organization-scoped
         * server-backed catalogue.
         */
        const prod = membershipProducts.find(
          (item) => item.id === pid && !item.isDeleted,
        );

        if (!prod) {
          throw new Error(`Membership product not found: ${pid}`);
        }

        /*
         * --------------------------------------------------------
         * 2. Load organization benefits
         * --------------------------------------------------------
         *
         * Do not use services.benefit.listByProduct(pid) here.
         *
         * The organization-scoped list contains the Benefits assigned
         * to the selected membership product.
         *
         * The organization-scoped method is the correct persisted
         * data path.
         */
        const organizationBenefits =
          await services.customerData.benefits(orgId);

        const bens = organizationBenefits.filter(
          (benefit) =>
            !benefit.isDeleted && prod.benefitIds.includes(benefit.id),
        );

        /*
         * --------------------------------------------------------
         * 3. Resolve customer
         * --------------------------------------------------------
         */
        /*
         * --------------------------------------------------------
         * 3. Resolve canonical customer / OrganizationUser
         * --------------------------------------------------------
         *
         * Counter passes the canonical User ID as customerId.
         *
         * Do not use services.customer.getCustomer(customerId) here.
         * Resolve the User first, then create the lightweight Customer
         * view used by JoinFlow.
         */
        let cust: Customer | null = null;
        let resolvedOrganizationUserId: string | null = null;
        if (isStaffSale) {
          if (!params.staffId || !params.storeId)
            throw new Error("Counter staff and store are required.");
          if (customerId) {
            const rows = await services.counter.customers({
              organizationId: orgId,
              storeId: params.storeId,
              staffId: params.staffId,
            });
            const row = rows.find((item) => item.userId === customerId);
            if (!row)
              throw new Error(
                "Counter customer is not available in this organization.",
              );
            cust = {
              id: row.userId,
              fullName:
                row.displayName ||
                [row.firstName, row.lastName].filter(Boolean).join(" "),
              email: row.primaryEmail ?? undefined,
              phone: row.primaryPhone,
              createdAt: row.joiningDate,
            };
            resolvedOrganizationUserId = row.organizationUserId;
          } else {
            const draft = counterCheckout.get();
            if (!draft)
              throw new Error(
                "Verified Counter customer details have expired. Return to Counter.",
              );
            cust = {
              id: "",
              fullName: [draft.firstName, draft.lastName].join(" "),
              email: draft.primaryEmail,
              phone: draft.primaryPhone,
              createdAt: new Date().toISOString(),
            };
          }
        } else {
          if (customerId) {
            const profiles = await services.customerData.profiles(customerId);
            const profile = profiles.find(
              (item) =>
                item.userId === customerId && item.organizationId === orgId,
            );
            if (!profile)
              throw new Error("Customer is not active in this organization.");
            cust = {
              id: profile.userId,
              fullName:
                profile.displayName?.trim() ||
                [profile.firstName, profile.lastName].filter(Boolean).join(" "),
              email: profile.primaryEmail ?? undefined,
              phone: profile.primaryPhone,
              createdAt: profile.joiningDate,
            };
            resolvedOrganizationUserId = profile.organizationUserId;
          }
        }

        if (!mounted) {
          return;
        }

        setActiveOrganization(resolvedOrganization);
        setProduct(prod);

        setBenefits(bens);

        setCustomer(cust);

        setOrganizationUserId(resolvedOrganizationUserId);
      } catch (error) {
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

      const res = await services.auth.sendOtp({
        mobile: fullMobile,
      });

      setRequestId(String(res.requestId));

      setDevCode(String(res.devCode ?? ""));

      setCode("");

      setStep("otp");
    } catch (error) {
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
   * services.auth.verifyOtp() returns:
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

      const res = await services.auth.verifyOtp({
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

      // Keep verified details in memory until the server purchase succeeds.
      setCustomer({
        id: "",
        fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
        phone: fullMobile,
        email: email.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
      setPhoneVerified(true);

      setStep("review");
    } catch (error) {
      setOtpError(
        error instanceof Error ? error.message : "Unable to verify the phone.",
      );
    }
  }, [requestId, code, firstName, lastName, countryCode, mobile, email]);

  const counterPurchasePayload = useCallback(() => {
    if (!isStaffSale || !plan || !params.staffId || !params.storeId) {
      throw new Error("Counter staff, store and membership plan are required.");
    }

    const draft = customerId ? null : counterCheckout.get();
    if (!customerId && !draft) {
      throw new Error(
        "Customer details have expired. Return to Counter and select the membership again.",
      );
    }

    const purchase = {
      planId: plan.id,
      ...(customerId
        ? { customerUserId: customerId }
        : {
            firstName: draft!.firstName,
            lastName: draft!.lastName,
            primaryEmail: draft!.primaryEmail,
            primaryPhone: draft!.primaryPhone,
          }),
    };

    const phone = customerId ? (customer?.phone ?? "") : draft!.primaryPhone;
    if (!phone) {
      throw new Error("Customer phone number is required for verification.");
    }

    return {
      context: {
        organizationId: orgId,
        storeId: params.storeId,
        staffId: params.staffId,
      },
      phone,
      purchase,
    };
  }, [
    isStaffSale,
    plan,
    params.staffId,
    params.storeId,
    customerId,
    customer,
    orgId,
  ]);

  const requestCounterPurchaseOtp = useCallback(async () => {
    try {
      setOtpError(undefined);
      setPurchaseOtpBusy(true);

      const { context, phone, purchase } = counterPurchasePayload();
      const result = await services.counter.requestPurchaseOtp(
        context,
        phone,
        purchase,
      );

      setPurchaseOtpChallengeId(result.challengeId);
      setPurchaseOtpDevCode(String(result.devCode ?? ""));
      setPurchaseOtpCode("");
      setPurchaseOtpVerified(false);
      setStep("purchaseOtp");
    } catch (error) {
      setOtpError(
        error instanceof Error
          ? error.message
          : "Unable to send purchase verification code.",
      );
      setStep("review");
    } finally {
      setPurchaseOtpBusy(false);
    }
  }, [counterPurchasePayload]);

  const verifyCounterPurchaseOtp = useCallback(async () => {
    try {
      setOtpError(undefined);

      const normalizedCode = normalizeOtp(purchaseOtpCode);
      if (!purchaseOtpChallengeId) {
        throw new Error("Purchase verification session has expired.");
      }
      if (normalizedCode.length !== OTP_LENGTH) {
        throw new Error("Enter the complete 6-digit verification code.");
      }

      setPurchaseOtpBusy(true);
      const { context } = counterPurchasePayload();
      const verified = await services.counter.verifyPurchaseOtp(
        context,
        purchaseOtpChallengeId,
        normalizedCode,
      );
      if (!verified) {
        throw new Error("Purchase verification failed.");
      }

      setPurchaseOtpVerified(true);
      setPurchaseOtpCode("");
      setStep("review");
    } catch (error) {
      setOtpError(
        error instanceof Error
          ? error.message
          : "Unable to verify purchase code.",
      );
    } finally {
      setPurchaseOtpBusy(false);
    }
  }, [counterPurchasePayload, purchaseOtpChallengeId, purchaseOtpCode]);

  /*
   * --------------------------------------------------------------
   * CREATE SUBSCRIPTION
   * --------------------------------------------------------------
   *
   * The business workflow is intentionally provider-neutral:
   *
   *   JoinFlow
   *       ↓
   *   services.payment.pay()
   *       ↓
   *   PaymentService
   *       ↓
   *   local / real payment implementation
   *
   * There is NO mock payment implementation in this screen.
   *
   * Subscription creation happens only after PaymentService
   * reports PAID.
   */

  const payAndSubscribe = useCallback(async () => {
    if (
      !product ||
      !plan ||
      (!isStaffSale && !organizationUserId && !phoneVerified)
    ) {
      return;
    }

    // Counter sale has exactly one Memgine OTP. Request it before payment.
    if (isStaffSale && !purchaseOtpVerified) {
      await requestCounterPurchaseOtp();
      return;
    }

    setStep("processing");

    try {
      const payment = await services.payment.pay({
        amountMinor: plan.price.amountMinor,
        currency: plan.price.currency,
        description: product.membershipProductName,
      });

      if (payment.status !== "PAID") {
        throw new Error("Payment was not completed.");
      }

      if (isStaffSale) {
        if (!purchaseOtpChallengeId) {
          throw new Error("Purchase verification is required before payment.");
        }

        const { context } = counterPurchasePayload();
        const saved = await services.counter.finalizePurchaseOtp(
          context,
          purchaseOtpChallengeId,
        );

        counterCheckout.clear();
        setPurchaseOtpChallengeId("");
        setPurchaseOtpDevCode("");
        setPurchaseOtpCode("");
        setPurchaseOtpVerified(false);

        const sub = {
          id: saved.subscriptionId,
          subscriptionNumber: saved.subscriptionNumber,
          organizationUserId: saved.organizationUserId,
          subscriptionPlanId: saved.subscriptionPlanId,
          subscriptionDate: saved.subscriptionDate,
          startDate: saved.startDate,
          endDate: saved.endDate,
          subscriptionStatusId: saved.subscriptionStatusId,
          totalAmount: {
            amountMinor: Math.round(saved.totalAmount * 100),
            currency: saved.currencyCode,
          },
          isDeleted: false,
        } as Subscription;

        setSubscription(sub);
        setReference(payment.reference);
        setActiveContext(orgId, sub.id);
        setStep("success");
        return;
      }

      // Authenticated customer purchases do not require a second business OTP.
      if (!customerId && (!phoneVerified || !customer)) {
        throw new Error("Verify the customer phone before purchasing.");
      }

      const saved = await services.customerData.purchase(orgId, {
        planId: plan.id,
        ...(customerId
          ? { customerUserId: customerId }
          : {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              primaryEmail: email.trim() || undefined,
              primaryPhone: customer!.phone,
            }),
      });

      const sub = {
        id: saved.subscriptionId,
        subscriptionNumber: saved.subscriptionNumber,
        organizationUserId: saved.organizationUserId,
        subscriptionPlanId: saved.subscriptionPlanId,
        subscriptionDate: saved.subscriptionDate,
        startDate: saved.startDate,
        endDate: saved.endDate,
        subscriptionStatusId: saved.subscriptionStatusId,
        totalAmount: {
          amountMinor: Math.round(saved.totalAmount * 100),
          currency: saved.currencyCode,
        },
        isDeleted: false,
      } as Subscription;

      setSubscription(sub);
      setReference(payment.reference);
      setActiveContext(orgId, sub.id);
      setStep("success");
    } catch (error) {
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
    purchaseOtpVerified,
    requestCounterPurchaseOtp,
    purchaseOtpChallengeId,
    counterPurchasePayload,
    orgId,
    customerId,
    setActiveContext,
    phoneVerified,
    customer,
    firstName,
    lastName,
    email,
  ]);

  /*
   * --------------------------------------------------------------
   * Navigation
   * --------------------------------------------------------------
   */

  const close = () =>
    router.canGoBack()
      ? router.back()
      : router.replace(APP_ROUTES.customer.cards);

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

    router.push(APP_ROUTES.business.subscription(subscription.id) as never);
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
        <BusinessHeader
          businessName={
            activeOrganization.displayName ?? activeOrganization.name
          }
          right={headerRight}
          testID="join-business-header"
        />
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
              business:
                activeOrganization.displayName ?? activeOrganization.name,
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

      {/* COUNTER PURCHASE OTP — one Memgine OTP for the exact selected purchase */}
      {step === "purchaseOtp" ? (
        <View
          style={{
            gap: theme.spacing.lg,
          }}
          testID="join-purchase-otp"
        >
          <Text variant="h2" color="text">
            Confirm membership purchase
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Enter the verification code sent to the customer. This is the only
            Memgine OTP required for this Counter purchase.
          </Text>

          {purchaseOtpDevCode ? (
            <Badge
              label={`Dev OTP: ${purchaseOtpDevCode}`}
              tone="info"
              testID="join-purchase-dev-otp"
            />
          ) : null}

          <Input
            label="Verification code"
            value={purchaseOtpCode}
            onChangeText={(value) => setPurchaseOtpCode(normalizeOtp(value))}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            error={otpError}
            testID="join-purchase-otp-input"
          />

          <Button
            label={purchaseOtpBusy ? "Verifying..." : "Verify & Continue"}
            fullWidth
            disabled={
              purchaseOtpBusy ||
              normalizeOtp(purchaseOtpCode).length !== OTP_LENGTH
            }
            onPress={verifyCounterPurchaseOtp}
            testID="join-purchase-otp-verify"
          />

          <Button
            label="Send New Code"
            fullWidth
            disabled={purchaseOtpBusy}
            onPress={requestCounterPurchaseOtp}
            testID="join-purchase-otp-resend"
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
                value:
                  activeOrganization.displayName ?? activeOrganization.name,
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

          {!organizationUserId && !phoneVerified && !isStaffSale ? (
            <Text variant="bodySmall" color="textMuted">
              Verify the customer phone to continue.
            </Text>
          ) : null}

          {isStaffSale && purchaseOtpVerified ? (
            <Badge label="Customer verified for this purchase" tone="success" />
          ) : null}

          {otpError ? (
            <Text variant="bodySmall" color="textMuted">
              {otpError}
            </Text>
          ) : null}

          <Button
            label={
              isStaffSale && !purchaseOtpVerified
                ? "Send Purchase OTP"
                : t("join.payAndSubscribe")
            }
            fullWidth
            disabled={!isStaffSale && !organizationUserId && !phoneVerified}
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
                    business:
                      activeOrganization.displayName ?? activeOrganization.name,
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
                value:
                  activeOrganization.displayName ?? activeOrganization.name,
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

          {/* The customer preview remains part of the separate customer journey. */}
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
              onPress={() => router.replace(APP_ROUTES.counter.root)}
              testID="join-done"
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
