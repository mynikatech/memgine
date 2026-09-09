import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type {
  CountryReference,
  Customer,
  MembershipOption,
  MembershipProduct,
  Status,
  Store,
  User,
} from "@/src/core";

import {
  encodeRedemptionToken,
  redeemBenefits,
  redeemFromToken,
  RedemptionContext,
  RedemptionMethod,
  RedemptionResult,
  services,
} from "@/src/core";

import { APP_ROUTES } from "@/src/constants/navigation";
import { useBusiness, useTranslation } from "@/src/providers";
import { COLORS, RADIUS, SPACING } from "@/src/theme/colors";
import { getSubscriptionPeriodLabel } from "@/src/core/domain/membership-helpers";
import {
  registerCustomerForOrganization,
  type RegisterCustomerResult,
} from "@/src/core/customer/customer-registration";
import {
  CustomerForm,
  type CustomerFormSubmitResult,
} from "@/src/ui/admin/CustomerForm";

type Mode = "qr" | "phone" | "assisted" | "new";

const MAX_PHONE_DIGITS = 10;

const OTP_LENGTH = 6;

const normalizePhone = (value: string): string =>
  value.replace(/\D/g, "").slice(0, MAX_PHONE_DIGITS);

const normalizeOtp = (value: string): string =>
  value.replace(/\D/g, "").slice(0, OTP_LENGTH);

const RESULT_STYLE: Record<
  RedemptionResult["kind"],
  { fg: string; bg: string }
> = {
  SUCCESS: {
    fg: "#15803D",
    bg: "#DCFCE7",
  },
  PARTIAL: {
    fg: "#B45309",
    bg: "#FEF3C7",
  },
  FAILED: {
    fg: "#B91C1C",
    bg: "#FEE2E2",
  },
  INVALID: {
    fg: "#B91C1C",
    bg: "#FEE2E2",
  },
};

export default function StaffCounter() {
  const { organization, principal } = useBusiness();

  const router = useRouter();

  const { t, formatMoney } = useTranslation();

  const orgId = organization.id;

  const staffId = principal.kind === "STAFF" ? principal.staffId : "staff";
  const staffRole = principal.kind === "STAFF" ? principal.role : "STAFF";

  const [store, setStore] = useState<Store | null>(null);

  const storeId = store?.id ?? "";

  const [promoCode, setPromoCode] = useState("");

  const [action, setAction] = useState<"redeem" | "sell">("redeem");

  const [mode, setMode] = useState<Mode>("qr");

  const [availableForSale, setAvailableForSale] = useState<MembershipProduct[]>(
    [],
  );

  /*
   * New Customer
   *
   * Counter reuses the same CustomerForm as Org Admin. The form
   * collects the complete customer details first. OTP verification
   * then authenticates the phone before the customer is persisted.
   */
  const [countries, setCountries] = useState<CountryReference[]>([]);

  const [userStatuses, setUserStatuses] = useState<Status[]>([]);

  const [newCustomerDraft, setNewCustomerDraft] =
    useState<CustomerFormSubmitResult | null>(null);

  const [newOtpRequestId, setNewOtpRequestId] = useState("");

  const [newDevCode, setNewDevCode] = useState("");

  const [newOtpCode, setNewOtpCode] = useState("");

  const [newOtpSent, setNewOtpSent] = useState(false);

  const [newOtpVerifying, setNewOtpVerifying] = useState(false);

  const newOtpVerificationInFlight = useRef(false);

  /*
   * Redemption result
   */
  const [result, setResult] = useState<RedemptionResult | null>(null);

  const [error, setError] = useState("");

  const [busy, setBusy] = useState(false);

  /*
   * QR
   */
  const [tokenText, setTokenText] = useState("");

  const [samples, setSamples] = useState<{ label: string; raw: string }[]>([]);

  /*
   * Existing customer Phone + OTP
   */
  const [phone, setPhone] = useState("");

  const [otpRequestId, setOtpRequestId] = useState("");

  const [devCode, setDevCode] = useState("");

  const [otpCode, setOtpCode] = useState("");

  const [otpSent, setOtpSent] = useState(false);

  const [otpVerifying, setOtpVerifying] = useState(false);

  const otpVerificationInFlight = useRef(false);

  /*
   * Staff assisted lookup
   */
  const [searchTerm, setSearchTerm] = useState("");

  const [searchResults, setSearchResults] = useState<Customer[]>([]);

  const [searched, setSearched] = useState(false);

  /*
   * Identified customer
   */
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [memberships, setMemberships] = useState<MembershipOption[]>([]);

  const [selectedSubId, setSelectedSubId] = useState("");

  const [selectedBenefitIds, setSelectedBenefitIds] = useState<Set<string>>(
    new Set(),
  );

  /*
   * ------------------------------------------------------------
   * Resolve customer behind subscription
   * ------------------------------------------------------------
   */

  const getCustomerForSubscription = useCallback(
    async (subscriptionId: string) => {
      const subscription =
        await services.subscription.getSubscription(subscriptionId);

      if (!subscription) {
        return null;
      }

      const organizationUser = await services.organization.getOrganizationUser(
        subscription.organizationUserId,
      );

      if (!organizationUser) {
        return null;
      }

      const customer = await services.customer.getCustomer(
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
   * Resolve product behind subscription
   * ------------------------------------------------------------
   */

  const getProductForSubscription = useCallback(
    async (subscriptionId: string) => {
      const subscription =
        await services.subscription.getSubscription(subscriptionId);

      if (!subscription) {
        return null;
      }

      const plan = await services.subscriptionPlan.getPlan(
        subscription.subscriptionPlanId,
      );

      if (!plan) {
        return null;
      }

      const product = await services.membershipProduct.getProduct(
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

  /*
   * ------------------------------------------------------------
   * Reset identity
   * ------------------------------------------------------------
   */

  const resetIdentity = useCallback(() => {
    setTokenText("");

    setPhone("");

    setOtpRequestId("");

    setDevCode("");

    setOtpCode("");

    setOtpSent(false);
    setOtpVerifying(false);
    otpVerificationInFlight.current = false;

    setSearchTerm("");

    setSearchResults([]);

    setSearched(false);

    setNewCustomerDraft(null);

    setNewOtpRequestId("");

    setNewDevCode("");

    setNewOtpCode("");

    setNewOtpSent(false);
    setNewOtpVerifying(false);
    newOtpVerificationInFlight.current = false;

    setCustomer(null);

    setMemberships([]);

    setAvailableForSale([]);

    setSelectedSubId("");

    setSelectedBenefitIds(new Set());

    setResult(null);

    setError("");
  }, []);

  /*
   * ------------------------------------------------------------
   * Load store + QR samples
   * ------------------------------------------------------------
   */

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [
          orgStores,
          countryReferences,
          statuses,
          organizationUsers,
          subscriptions,
          catalog,
          subscriptionStatuses,
          organizationBenefits,
        ] = await Promise.all([
          services.organization.listStores(orgId),
          services.referenceData.listCountries(),
          services.status.listUserStatuses(),
          services.organization.listOrganizationUsers(orgId),
          services.subscription.listByOrganization(orgId),
          services.membershipProduct.listProducts(orgId),
          services.status.listStatusesByEntityTypeCode("SUBSCRIPTION"),
          services.benefit.listByOrganization(orgId),
        ]);

        const activeSubscriptionStatusIds = new Set(
          subscriptionStatuses
            .filter(
              (status) =>
                status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
                status.statusName?.trim().toLowerCase() === "active",
            )
            .map((status) => status.id),
        );

        const built: {
          label: string;
          raw: string;
        }[] = [];

        for (const subscription of subscriptions) {
          if (
            subscription.isDeleted ||
            !activeSubscriptionStatusIds.has(subscription.subscriptionStatusId)
          ) {
            continue;
          }

          const organizationUser = organizationUsers.find(
            (candidate) =>
              !candidate.isDeleted &&
              candidate.id === subscription.organizationUserId,
          );

          if (!organizationUser) {
            continue;
          }

          const planProduct = catalog.find(
            (candidate) =>
              !candidate.isDeleted &&
              candidate.plans.some(
                (plan) => plan.id === subscription.subscriptionPlanId,
              ),
          );

          const plan = planProduct?.plans.find(
            (candidate) => candidate.id === subscription.subscriptionPlanId,
          );

          if (!planProduct || !plan) {
            continue;
          }

          const benefits = organizationBenefits.filter(
            (benefit) =>
              !benefit.isDeleted && planProduct.benefitIds.includes(benefit.id),
          );

          if (!benefits.length) {
            continue;
          }

          const customer = await services.customer.getCustomer(
            organizationUser.userId,
          );

          built.push({
            label: `${customer?.fullName ?? "Customer"} · ${
              planProduct.displayName ?? planProduct.membershipProductName
            }`,
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
        setCountries(countryReferences);
        setUserStatuses(statuses);
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
   * Load memberships/catalog for a canonical User
   *
   * Counter must use the same persisted User + OrganizationUser +
   * Subscription data as the Customers screen. The legacy Customer
   * lookup is not the source of truth for these records, so do not use
   * services.customer.getCustomer() to resolve memberships here.
   * ------------------------------------------------------------
   */

  const loadMembershipData = useCallback(
    async (customerId: string) => {
      const [
        organizationUsers,
        subscriptions,
        catalog,
        productStatuses,
        subscriptionStatuses,
        organizationBenefits,
      ] = await Promise.all([
        services.organization.listOrganizationUsers(orgId),
        services.subscription.listByOrganization(orgId),
        services.membershipProduct.listProducts(orgId),
        services.status.listMembershipProductStatuses(),
        services.status.listStatusesByEntityTypeCode("SUBSCRIPTION"),
        services.benefit.listByOrganization(orgId),
      ]);

      const activeProductStatusIds = new Set(
        productStatuses
          .filter(
            (status) =>
              status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
              status.statusName?.trim().toLowerCase() === "active",
          )
          .map((status) => status.id),
      );

      const customerOrganizationUsers = organizationUsers.filter(
        (organizationUser) =>
          !organizationUser.isDeleted &&
          organizationUser.organizationUserTypeId ===
            "org-user-type-customer" &&
          organizationUser.userId === customerId,
      );

      const customerOrganizationUserIds = new Set(
        customerOrganizationUsers.map(
          (organizationUser) => organizationUser.id,
        ),
      );

      const activeSubscriptionStatusIds = new Set(
        subscriptionStatuses
          .filter(
            (status) =>
              status.statusCode?.trim().toUpperCase() === "ACTIVE" ||
              status.statusName?.trim().toLowerCase() === "active",
          )
          .map((status) => status.id),
      );

      const customerSubscriptions = subscriptions.filter(
        (subscription) =>
          !subscription.isDeleted &&
          customerOrganizationUserIds.has(subscription.organizationUserId) &&
          activeSubscriptionStatusIds.has(subscription.subscriptionStatusId),
      );

      console.log("COUNTER MEMBERSHIP OWNERSHIP RESOLUTION", {
        customerId,
        customerOrganizationUserIds: Array.from(customerOrganizationUserIds),
        activeSubscriptionStatusIds: Array.from(activeSubscriptionStatusIds),
        customerSubscriptions: customerSubscriptions.map((subscription) => ({
          id: subscription.id,
          subscriptionPlanId: subscription.subscriptionPlanId,
          organizationUserId: subscription.organizationUserId,
          subscriptionStatusId: subscription.subscriptionStatusId,
        })),
        catalog: catalog.map((product) => ({
          id: product.id,
          membershipProductName: product.membershipProductName,
          plans: product.plans.map((plan) => ({
            id: plan.id,
            name: plan.subscriptionPlanName,
            amountMinor: plan.price.amountMinor,
            membershipProductId: plan.membershipProductId,
          })),
        })),
      });

      const options: MembershipOption[] = [];
      const ownedProductIds = new Set<string>();

      for (const subscription of customerSubscriptions) {
        // MembershipProduct persists its plans, so resolve the plan directly
        // from the organization catalogue rather than the legacy/mock plan service.
        const product = catalog.find(
          (candidate) =>
            !candidate.isDeleted &&
            candidate.plans.some(
              (plan) => plan.id === subscription.subscriptionPlanId,
            ),
        );

        const plan = product?.plans.find(
          (candidate) => candidate.id === subscription.subscriptionPlanId,
        );

        if (!product || !plan) {
          console.warn("COUNTER SUBSCRIPTION PLAN NOT FOUND IN CATALOG", {
            subscriptionId: subscription.id,
            subscriptionPlanId: subscription.subscriptionPlanId,
            customerId,
          });
          continue;
        }

        ownedProductIds.add(product.id);

        const benefits = organizationBenefits.filter(
          (benefit) =>
            !benefit.isDeleted && product.benefitIds.includes(benefit.id),
        );

        const usedBenefitIds = new Set(
          (await services.redemption.listBySubscription(subscription.id)).map(
            (redemption) => redemption.benefitId,
          ),
        );

        options.push({
          subscription,
          productName: product?.membershipProductName ?? "Membership",
          tier: plan.subscriptionPlanName || product.displayName,
          benefits: benefits.map((benefit) => ({
            ...benefit,
            available: !usedBenefitIds.has(benefit.id),
          })),
        });
      }

      const availableProducts = catalog.filter(
        (product) =>
          !product.isDeleted &&
          activeProductStatusIds.has(product.productStatusId) &&
          !ownedProductIds.has(product.id),
      );

      return {
        memberships: options,
        availableProducts,
      };
    },
    [orgId],
  );

  /*
   * ------------------------------------------------------------
   * Identify customer
   * ------------------------------------------------------------
   */

  const identifyCustomer = async (customerId: string) => {
    const users = await services.organization.listUsers();
    const user = users.find(
      (item) => !item.isDeleted && item.id === customerId,
    );

    if (!user) {
      setCustomer(null);
      setMemberships([]);
      setAvailableForSale([]);
      setSelectedSubId("");
      setSelectedBenefitIds(new Set());
      return;
    }

    const counterCustomer = customerFromUser(user);
    setCustomer(counterCustomer);

    const { memberships: opts, availableProducts } = await loadMembershipData(
      user.id,
    );

    setMemberships(opts);
    setAvailableForSale(availableProducts);

    if (opts.length) {
      selectMembership(opts[0].subscription.id, opts);
    } else {
      setSelectedSubId("");
      setSelectedBenefitIds(new Set());
    }
  };

  /*
   * ------------------------------------------------------------
   * New Customer
   *
   * The CustomerForm collects the complete customer information.
   * Counter then sends OTP to the supplied phone. Only after OTP
   * verification do we persist the User, OrganizationUser and
   * acquisition record.
   * ------------------------------------------------------------
   */

  const handleNewCustomerFormSave = async (
    formResult: CustomerFormSubmitResult,
  ) => {
    setError("");

    const phone = formResult.user.primaryPhone;

    if (!phone) {
      setError("Primary Phone Number is required.");
      return;
    }

    const mobile = `${phone.callingCode}${phone.number}`;

    try {
      const res = await services.auth.sendOtp({
        mobile,
      });

      setNewCustomerDraft(formResult);
      setNewOtpRequestId(String(res.requestId));
      setNewDevCode(String(res.devCode ?? ""));
      setNewOtpCode("");
      setNewOtpSent(true);
    } catch (error) {
      console.error("STAFF NEW CUSTOMER SEND OTP ERROR", error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to send the verification code.",
      );
    }
  };

  const customerFromUser = (user: User): Customer =>
    ({
      id: user.id,
      fullName:
        user.displayName?.trim() ||
        `${user.firstName} ${user.middleName ?? ""} ${user.lastName}`
          .replace(/\s+/g, " ")
          .trim(),
      email: user.primaryEmail,
      phone: `${user.primaryPhone.callingCode ?? ""}${user.primaryPhone.number ?? ""}`,
      createdAt: user.createdAt,
    }) as Customer;

  const identifyRegisteredUser = async (
    registration: RegisterCustomerResult,
  ) => {
    const counterCustomer = customerFromUser(registration.user);

    setCustomer(counterCustomer);

    const { memberships: opts, availableProducts } = await loadMembershipData(
      registration.user.id,
    );

    setMemberships(opts);
    setAvailableForSale(availableProducts);

    if (opts.length) {
      selectMembership(opts[0].subscription.id, opts);
    } else {
      setSelectedSubId("");
      setSelectedBenefitIds(new Set());
    }
  };

  const verifyNewCustomerOtp = async () => {
    if (newOtpVerificationInFlight.current) {
      return;
    }

    setError("");

    const normalizedOtp = normalizeOtp(newOtpCode);

    if (!newCustomerDraft) {
      setError("Customer details are missing. Please enter them again.");
      return;
    }

    if (!newOtpRequestId) {
      setError("Verification session has expired. Please request a new OTP.");
      return;
    }

    if (normalizedOtp.length !== OTP_LENGTH) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    newOtpVerificationInFlight.current = true;
    setNewOtpVerifying(true);

    try {
      const requestId = newOtpRequestId;

      const res = await services.auth.verifyOtp({
        requestId,
        code: normalizedOtp,
      });

      if (!res.verified) {
        setError("Incorrect code. Please enter the OTP shown above.");
        return;
      }

      // The OTP is single-use. Lock this request before registration starts
      // so a second tap cannot consume the same request and show a misleading
      // "Incorrect code" message while the first registration is still running.
      setNewOtpRequestId("");

      const registration = await registerCustomerForOrganization({
        organizationId: orgId,
        userInput: newCustomerDraft.user,
        sourceStoreId: newCustomerDraft.sourceStoreId,
        registrationSource: "COUNTER",
        registrationChannel: "POS",
      });

      console.log("STAFF CUSTOMER REGISTRATION COMPLETE", {
        organizationId: orgId,
        userId: registration.user.id,
        organizationUserId: registration.organizationUser.id,
        createdUser: registration.createdUser,
        createdOrganizationUser: registration.createdOrganizationUser,
      });

      await identifyRegisteredUser(registration);

      setNewCustomerDraft(null);
      setNewDevCode("");
      setNewOtpCode("");
      setNewOtpSent(false);
      setError("");
    } catch (error) {
      console.error("STAFF CUSTOMER REGISTRATION ERROR", error);

      // Verification succeeded before registration. Because that OTP is now
      // consumed, allow the customer to request a fresh OTP rather than
      // leaving them on a screen whose next tap can only produce "Incorrect code".
      setNewOtpRequestId("");
      setNewOtpSent(false);
      setNewOtpCode("");

      setError(
        error instanceof Error
          ? `${error.message} Please request a new OTP and try again.`
          : "Unable to complete customer registration. Please request a new OTP and try again.",
      );
    } finally {
      newOtpVerificationInFlight.current = false;
      setNewOtpVerifying(false);
    }
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

  const sellProduct = async (productId: string) => {
    if (!customer) {
      setError("Please identify the customer first.");

      return;
    }

    try {
      const existingUser = await services.organization.getUser(customer.id);

      if (!existingUser) {
        throw new Error("The identified customer user could not be found.");
      }

      const registration = await registerCustomerForOrganization({
        organizationId: orgId,
        userId: existingUser.id,
        userInput: {
          firstName: existingUser.firstName,
          middleName: existingUser.middleName,
          lastName: existingUser.lastName,
          displayName: existingUser.displayName,
          primaryEmail: existingUser.primaryEmail,
          primaryPhone: existingUser.primaryPhone,
          userStatusId: existingUser.userStatusId,
          createdBy: existingUser.createdBy,
        },
        registrationSource: "COUNTER",
        registrationChannel: "POS",
      });

      console.log("STAFF SALE CUSTOMER READY", {
        organizationId: orgId,
        customerId: registration.customer.id,
        organizationUserId: registration.organizationUser.id,
        productId,
      });

      /*
       * Staff-assisted purchase.
       *
       * JoinFlow uses source=STAFF_ASSISTED to
       * display the staff-specific success message
       * and Done button.
       */
      router.push({
        pathname: APP_ROUTES.join.root,
        params: {
          organizationId: orgId,
          productId,
          customerId: registration.customer.id,
          staffId,
          storeId,
          source: "STAFF_ASSISTED",
        },
      });
    } catch (error) {
      console.error("STAFF SALE CUSTOMER REGISTRATION ERROR", error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to prepare the customer for purchase.",
      );
    }
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
   * Existing customer Phone + OTP
   * ------------------------------------------------------------
   */

  const sendOtp = async () => {
    setError("");

    const normalizedPhone = normalizePhone(phone);

    if (normalizedPhone.length !== MAX_PHONE_DIGITS) {
      setError("Enter a 10-digit phone number.");

      return;
    }

    try {
      const res = await services.auth.sendOtp({
        mobile: normalizedPhone,
      });

      setOtpRequestId(String(res.requestId));

      setDevCode(String(res.devCode ?? ""));

      setOtpCode("");

      setOtpSent(true);
    } catch (error) {
      console.error("COUNTER SEND OTP ERROR", error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to send the verification code.",
      );
    }
  };

  const verifyOtp = async () => {
    if (otpVerificationInFlight.current) {
      return;
    }

    setError("");

    const normalizedOtp = normalizeOtp(otpCode);

    if (!otpRequestId) {
      setError("Verification session has expired. Please request a new OTP.");
      return;
    }

    if (normalizedOtp.length !== OTP_LENGTH) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    otpVerificationInFlight.current = true;
    setOtpVerifying(true);

    try {
      const requestId = otpRequestId;

      const res = await services.auth.verifyOtp({
        requestId,
        code: normalizedOtp,
      });

      if (!res.verified) {
        setError("Incorrect code. Please enter the OTP shown above.");
        return;
      }

      // OTP is single-use; prevent a second tap from submitting the consumed
      // request while customer lookup is still running.
      setOtpRequestId("");

      const normalizedPhone = normalizePhone(phone);

      const [users, organizationUsers] = await Promise.all([
        services.organization.listUsers(),
        services.organization.listOrganizationUsers(orgId),
      ]);

      const customerUserIds = new Set(
        organizationUsers
          .filter(
            (organizationUser) =>
              !organizationUser.isDeleted &&
              organizationUser.organizationUserTypeId ===
                "org-user-type-customer",
          )
          .map((organizationUser) => organizationUser.userId),
      );

      const matchingUser = users.find((user) => {
        if (user.isDeleted || !customerUserIds.has(user.id)) {
          return false;
        }

        const userNumber = normalizePhone(user.primaryPhone.number ?? "");
        return userNumber === normalizedPhone;
      });

      if (!matchingUser) {
        setOtpRequestId("");
        setOtpSent(false);
        setOtpCode("");
        setError(
          "OTP verified, but no customer was found for this phone number. Please request a new OTP and try again.",
        );
        return;
      }

      await identifyCustomer(matchingUser.id);
      setOtpSent(false);
      setOtpCode("");
      setDevCode("");
      setError("");
    } catch (error) {
      console.error("COUNTER VERIFY OTP ERROR", error);

      setError(
        error instanceof Error ? error.message : "Unable to verify the OTP.",
      );
    } finally {
      otpVerificationInFlight.current = false;
      setOtpVerifying(false);
    }
  };

  /*
   * ------------------------------------------------------------
   * Staff assisted search
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

    try {
      // Search the same organization-scoped customer relationships used by
      // the Customers screen. This keeps Counter and Org Admin in sync.
      const organizationUsers =
        await services.organization.listOrganizationUsers(orgId);

      const users = await services.organization.listUsers();
      const userMap = new Map(
        users.filter((user) => !user.isDeleted).map((user) => [user.id, user]),
      );

      const customerUserIds = new Set(
        organizationUsers
          .filter(
            (organizationUser) =>
              !organizationUser.isDeleted &&
              organizationUser.organizationUserTypeId ===
                "org-user-type-customer",
          )
          .map((organizationUser) => organizationUser.userId),
      );

      const customers = Array.from(customerUserIds)
        .map((userId) => userMap.get(userId))
        .filter((user): user is User => Boolean(user))
        .map(customerFromUser);

      const normalizedTerm = term.toLowerCase();
      const normalizedPhoneTerm = normalizePhone(term);

      const filtered = customers.filter((candidate) => {
        const name = candidate.fullName?.toLowerCase() ?? "";
        const email = candidate.email?.toLowerCase() ?? "";
        const candidatePhone = normalizePhone(candidate.phone ?? "");

        return (
          name.includes(normalizedTerm) ||
          email.includes(normalizedTerm) ||
          (normalizedPhoneTerm.length > 0 &&
            candidatePhone.includes(normalizedPhoneTerm))
        );
      });

      setSearchResults(filtered);
    } catch (error) {
      console.error("COUNTER CUSTOMER SEARCH ERROR", error);
      setSearchResults([]);
      setError(
        error instanceof Error ? error.message : "Unable to search customers.",
      );
    }

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
      const { memberships: opts, availableProducts } = await loadMembershipData(
        customer.id,
      );

      setMemberships(opts);
      setAvailableForSale(availableProducts);

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
   * Sale catalogue
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
              <View key={option.subscription.id} style={{ gap: 2 }}>
                <Text style={styles.benefitTitle}>
                  {option.tier ?? "Membership"}
                </Text>
                <Text style={styles.muted}>{option.productName} · owned</Text>
              </View>
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
                  {product.plans[0]?.subscriptionPlanName ??
                    product.displayName ??
                    "Membership"}
                </Text>

                <Text style={styles.muted}>
                  {product.membershipProductName} · {priceLabel(product)}
                </Text>
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
            onChangeText={(value) => setPhone(normalizePhone(value))}
            placeholder="Customer phone number"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            maxLength={MAX_PHONE_DIGITS}
            style={styles.input}
            editable={!otpSent}
          />

          {!otpSent ? (
            <Pressable
              testID="counter-send-otp"
              disabled={normalizePhone(phone).length !== MAX_PHONE_DIGITS}
              onPress={sendOtp}
              style={[
                styles.primaryBtn,
                normalizePhone(phone).length !== MAX_PHONE_DIGITS &&
                  styles.btnDisabled,
              ]}
            >
              <Text style={styles.primaryBtnText}>Send OTP</Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.tiny}>Dev code: {devCode}</Text>

              <TextInput
                testID="counter-otp-input"
                value={otpCode}
                onChangeText={(value) => setOtpCode(normalizeOtp(value))}
                placeholder="Enter OTP"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={OTP_LENGTH}
                style={styles.input}
              />

              <Pressable
                testID="counter-verify-otp"
                disabled={
                  otpVerifying || normalizeOtp(otpCode).length !== OTP_LENGTH
                }
                onPress={verifyOtp}
                style={[
                  styles.primaryBtn,
                  (otpVerifying ||
                    normalizeOtp(otpCode).length !== OTP_LENGTH) &&
                    styles.btnDisabled,
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {otpVerifying ? "Verifying..." : "Verify"}
                </Text>
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
            Add the complete customer details, verify the mobile number by OTP,
            and save the customer immediately for use at Counter and in Org
            Admin.
          </Text>

          {!customer ? (
            !newOtpSent ? (
              countries.length > 0 && userStatuses.length > 0 ? (
                <CustomerForm
                  organizationId={orgId}
                  stores={[]}
                  initialSourceStoreId={store?.id}
                  hideAcquisitionSection
                  hideUserStatusSection
                  countries={countries}
                  userStatuses={userStatuses}
                  activeUserStatusId={
                    userStatuses.find(
                      (status) =>
                        status.statusCode?.trim().toUpperCase() === "ACTIVE",
                    )?.id ?? ""
                  }
                  mode="add"
                  onSave={handleNewCustomerFormSave}
                  onCancel={() => {
                    setNewCustomerDraft(null);
                    setNewOtpRequestId("");
                    setNewDevCode("");
                    setNewOtpCode("");
                    setNewOtpSent(false);
                    setError("");
                  }}
                />
              ) : (
                <Text style={styles.muted}>
                  Loading customer reference data...
                </Text>
              )
            ) : (
              <View style={styles.otpSection}>
                <Text style={styles.label}>Mobile Verification</Text>

                <Text style={styles.muted}>
                  A verification code has been sent to the customer&apos;s
                  mobile number.
                </Text>

                {newCustomerDraft?.user.primaryPhone ? (
                  <Text style={styles.identified}>
                    {newCustomerDraft.user.primaryPhone.callingCode}{" "}
                    {newCustomerDraft.user.primaryPhone.number}
                  </Text>
                ) : null}

                <Text style={styles.tiny}>Dev code: {newDevCode}</Text>

                <TextInput
                  testID="counter-new-otp"
                  value={newOtpCode}
                  onChangeText={(value) => setNewOtpCode(normalizeOtp(value))}
                  placeholder="Enter OTP"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}
                  style={styles.input}
                />

                <Pressable
                  testID="counter-new-verify-otp"
                  disabled={
                    newOtpVerifying ||
                    normalizeOtp(newOtpCode).length !== OTP_LENGTH
                  }
                  onPress={verifyNewCustomerOtp}
                  style={[
                    styles.primaryBtn,
                    newOtpVerifying ||
                    normalizeOtp(newOtpCode).length !== OTP_LENGTH
                      ? styles.btnDisabled
                      : undefined,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {newOtpVerifying
                      ? "Verifying & Saving..."
                      : "Verify & Save Customer"}
                  </Text>
                </Pressable>

                <Pressable
                  testID="counter-new-resend-otp"
                  disabled={newOtpVerifying}
                  onPress={() => {
                    setNewOtpRequestId("");
                    setNewDevCode("");
                    setNewOtpCode("");
                    setNewOtpSent(false);
                    setError("");
                  }}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>Request New OTP</Text>
                </Pressable>

                <Pressable
                  testID="counter-new-cancel-otp"
                  onPress={() => {
                    setNewCustomerDraft(null);
                    setNewOtpRequestId("");
                    setNewDevCode("");
                    setNewOtpCode("");
                    setNewOtpSent(false);
                    setError("");
                  }}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>
                    Back to Customer Details
                  </Text>
                </Pressable>
              </View>
            )
          ) : (
            <View style={styles.customerSavedBox}>
              <Text style={styles.identified}>
                Customer saved and ready at Counter
              </Text>

              <Text style={styles.muted}>{customer.fullName}</Text>

              {customer.phone ? (
                <Text style={styles.tiny}>{customer.phone}</Text>
              ) : null}

              {customer.email ? (
                <Text style={styles.tiny}>{customer.email}</Text>
              ) : null}
            </View>
          )}

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

  nameRow: {
    flexDirection: "row",
    gap: 8,
  },

  nameField: {
    flex: 1,
  },

  phoneRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
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

  secondaryBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  secondaryBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },

  otpSection: {
    gap: 8,
  },

  customerSavedBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: 12,
    backgroundColor: COLORS.background,
    gap: 4,
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
