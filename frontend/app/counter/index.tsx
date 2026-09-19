import { useLocalSearchParams, useRouter } from "expo-router";
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
  Staff,
  StaffStoreAssignment,
  Store,
  OfferRedemptionResult,
} from "@/src/core";

import { RedemptionMethod, RedemptionResult, services } from "@/src/core";

import { APP_ROUTES } from "@/src/constants/navigation";
import { counterCheckout } from "@/src/core/services/counter-checkout";
import { useCounterSession } from "@/src/core/services/counter-session-context";
import {
  eligibleCounterStores,
  selectCounterStaff,
} from "@/src/core/services/counter-context-selection";
import { useAuth, useBusiness, useTranslation } from "@/src/providers";
import { COLORS, RADIUS, SPACING } from "@/src/theme/colors";
import { getSubscriptionPeriodLabel } from "@/src/core/domain/membership-helpers";
import {
  CustomerForm,
  type CustomerFormSubmitResult,
} from "@/src/ui/admin/CustomerForm";

type Mode = "qr" | "phone" | "assisted" | "new";

const MAX_PHONE_DIGITS = 10;

const OTP_LENGTH = 6;

const normalizePhone = (value: string): string =>
  value.replace(/\D/g, "").slice(-MAX_PHONE_DIGITS);

const normalizeOtp = (value: string): string =>
  value.replace(/\D/g, "").slice(0, OTP_LENGTH);

type CounterResult = RedemptionResult | OfferRedemptionResult;

const RESULT_STYLE: Record<CounterResult["kind"], { fg: string; bg: string }> =
  {
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
    ALREADY_USED: {
      fg: "#B45309",
      bg: "#FEF3C7",
    },
    INELIGIBLE: {
      fg: "#B91C1C",
      bg: "#FEE2E2",
    },
    USAGE_LIMIT_REACHED: {
      fg: "#B45309",
      bg: "#FEF3C7",
    },
    OUTSIDE_VALIDITY: {
      fg: "#B91C1C",
      bg: "#FEE2E2",
    },
  };

export default function StaffCounter() {
  const { organization } = useBusiness();
  const { session } = useAuth();

  const router = useRouter();

  const params = useLocalSearchParams<{ organizationId?: string }>();

  const { t, formatMoney } = useTranslation();

  const {
    context: counterSessionContext,
    setContext: setCounterSessionContext,
  } = useCounterSession();

  const orgId = params.organizationId ?? organization.id;

  const [counterOrganization, setCounterOrganization] = useState<
    typeof organization | null
  >(null);

  const [activeStaffMembers, setActiveStaffMembers] = useState<Staff[]>([]);
  const [staffNamesById, setStaffNamesById] = useState<Record<string, string>>(
    {},
  );
  const [counterStores, setCounterStores] = useState<Store[]>([]);
  const [counterAssignments, setCounterAssignments] = useState<
    StaffStoreAssignment[]
  >([]);
  const [activeStoreStatusId, setActiveStoreStatusId] = useState("");
  const [activeAssignmentStatusId, setActiveAssignmentStatusId] = useState("");
  const [loadedOrgId, setLoadedOrgId] = useState("");

  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [authenticatedStaffId, setAuthenticatedStaffId] = useState("");

  const [staffPickerVisible, setStaffPickerVisible] = useState(false);
  const [storePickerVisible, setStorePickerVisible] = useState(false);


  const [counterStaff, setCounterStaff] = useState<Staff | null>(null);

  const [counterStaffName, setCounterStaffName] = useState("");

  const staffId = loadedOrgId === orgId ? (counterStaff?.id ?? "") : "";
  const staffRole =
    counterStaff?.designation?.trim() ||
    counterStaff?.role ||
    null;

  const [store, setStore] = useState<Store | null>(null);

  const storeId = loadedOrgId === orgId ? (store?.id ?? "") : "";
  const principalStaffIsCurrent =
    loadedOrgId === orgId &&
    activeStaffMembers.some((item) => item.id === authenticatedStaffId);
  const canSelectOperationalStaff = !session?.posContext && (session?.access.some(
    (context) => context.organizationId === orgId && context.capabilities.includes("ORG_ADMIN_ACCESS"),
  ) ?? false);
  const selectedStaff =
    loadedOrgId === orgId
      ? selectCounterStaff(
          activeStaffMembers,
          authenticatedStaffId,
          authenticatedStaffId || selectedStaffId,
        )
      : null;
  const eligibleStores =
    selectedStaff && activeStoreStatusId && activeAssignmentStatusId
      ? eligibleCounterStores(
          selectedStaff,
          counterStores,
          counterAssignments,
          activeStoreStatusId,
          activeAssignmentStatusId,
        )
      : null;
  const storeChoices = eligibleStores?.primary
    ? [eligibleStores.primary]
    : (eligibleStores?.assigned ?? []);

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

  // True when Counter registration finds that the supplied phone number
  // already belongs to an existing canonical User.
  const [newCustomerWasExisting, setNewCustomerWasExisting] = useState(false);

  const [newOtpRequestId, setNewOtpRequestId] = useState("");

  const [newDevCode, setNewDevCode] = useState("");

  const [newOtpCode, setNewOtpCode] = useState("");

  const [newOtpSent, setNewOtpSent] = useState(false);

  const [newOtpVerifying, setNewOtpVerifying] = useState(false);

  const newOtpVerificationInFlight = useRef(false);

  /*
   * Redemption result
   */
  const [result, setResult] = useState<CounterResult | null>(null);

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

  const resetIdentity = useCallback(() => {
    counterCheckout.clear();
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
    setNewCustomerWasExisting(false);

    setNewOtpRequestId("");

    setNewDevCode("");

    setNewOtpCode("");

    setNewOtpSent(false);
    setNewOtpVerifying(false);
    newOtpVerificationInFlight.current = false;

    setCustomer(null);

    setMemberships([]);

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

    setLoadedOrgId("");
    setCounterOrganization(null);
    setActiveStaffMembers([]);
    setStaffNamesById({});
    const existingSession =
      counterSessionContext?.organizationId === orgId
        ? counterSessionContext
        : null;
    if (counterSessionContext && !existingSession) {
      setCounterSessionContext(null);
    }
    setCounterStores([]);
    setCounterAssignments([]);
    setSelectedStaffId(existingSession?.staffId ?? "");
    setSelectedStoreId(existingSession?.storeId ?? "");
    setStaffPickerVisible(false);
    setStorePickerVisible(false);
    setCounterStaff(null);
    setCounterStaffName("");
    setStore(null);
    setSamples([]);
    setAvailableForSale([]);
    resetIdentity();

    (async () => {
      try {
        const [
          resolvedOrganization,
          stores,
          staffMembers,
          assignments,
          staffSnapshot,
          countryReferences,
          statuses,
          catalog,
          storeStatuses,
          assignmentStatuses,
        ] = await Promise.all([
          services.organization.getOrganization(orgId),
          services.organization.listStores(orgId),
          services.organization.listStaff(orgId),
          services.organization.listStaffStoreAssignments(orgId),
          services.organization.getOrganizationUserSnapshot(orgId),
          services.referenceData.listCountries(),
          services.status.listUserStatuses(),
          services.membershipProduct.listProducts(orgId),
          services.status.listStoreStatuses(),
          services.status.listStaffStoreAssignmentStatuses(),
        ]);

        if (!resolvedOrganization || resolvedOrganization.isDeleted) {
          throw new Error(`Organization not found: ${orgId}`);
        }

        const activeStaff = staffMembers.filter(
          (item) => !item.isDeleted && item.isActive,
        );

        if (!active) return;

        const usersById = new Map(
          staffSnapshot.users.map((user) => [user.id, user]),
        );
        const organizationUsersById = new Map(
          staffSnapshot.organizationUsers.map((organizationUser) => [
            organizationUser.id,
            organizationUser,
          ]),
        );
        const names = Object.fromEntries(
          activeStaff.map((staff) => {
            const organizationUser = organizationUsersById.get(
              staff.organizationUserId,
            );
            const user = organizationUser
              ? usersById.get(organizationUser.userId)
              : undefined;
            const name = user
              ? user.displayName?.trim() ||
                [user.firstName, user.middleName, user.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim()
              : "";
            return [
              staff.id,
              name || staff.designation?.trim() || staff.staffCode,
            ];
          }),
        );
        const ownStaffId = session?.posContext?.staffId ?? activeStaff.find((staff) =>
          organizationUsersById.get(staff.organizationUserId)?.userId === session?.userId,
        )?.id ?? "";

        setCounterOrganization(resolvedOrganization);
        setActiveStaffMembers(activeStaff);
        setAuthenticatedStaffId(ownStaffId);
        setStaffNamesById(names);
        setCounterStores(stores);
        setCounterAssignments(assignments);
        setActiveStoreStatusId(
          storeStatuses.find((item) => item.statusCode === "ACTIVE")?.id ?? "",
        );
        setActiveAssignmentStatusId(
          assignmentStatuses.find((item) => item.statusCode === "ACTIVE")?.id ??
            "",
        );
        setCountries(countryReferences);
        setUserStatuses(statuses);
        setAvailableForSale(catalog.filter((product) => !product.isDeleted));
        setLoadedOrgId(orgId);
        if (activeStaff.length === 0)
          setError("No active staff available for this organization.");
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to load Counter.",
          );
      }
    })();

    return () => {
      active = false;
    };
  }, [orgId, resetIdentity]);

  useEffect(() => {
    if (loadedOrgId !== orgId) return;
    let active = true;
    setCounterStaff(null);
    setCounterStaffName("");
    setStore(null);
    setSamples([]);
    setCounterSessionContext(null);
    setError(
      activeStaffMembers.length === 0
        ? "No active staff available for this organization."
        : "",
    );

    if (!selectedStaff) return;
    const resolvedStore =
      (session?.posContext ? counterStores.find((item) => item.id === session.posContext?.storeId) : null) ??
      eligibleStores?.primary ??
      (selectedStoreId
        ? storeChoices.find((item) => item.id === selectedStoreId)
        : undefined) ??
      (storeChoices.length === 1 ? storeChoices[0] : null);
    if (!resolvedStore) {
      if (storeChoices.length === 0)
        setError("The selected staff member has no active assigned store.");
      return;
    }
    const context = {
      organizationId: orgId,
      staffId: selectedStaff.id,
      storeId: resolvedStore.id,
    };
    (async () => {
      try {
        const [qr, personName] = await Promise.all([
          services.counter.qrSamples(context),
          services.counter.staffName(context),
        ]);
        if (!active) return;
        setCounterStaff(selectedStaff);
        setCounterStaffName(
          personName?.trim() ||
            staffNamesById[selectedStaff.id] ||
            selectedStaff.designation ||
            selectedStaff.staffCode,
        );
        setStore(resolvedStore);
        setCounterSessionContext(context);
        setSamples(
          qr.map((item) => ({
            label: `Test QR · ${item.customerName}`,
            raw: item.token,
          })),
        );
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to resolve Counter staff and store.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [
    orgId,
    loadedOrgId,
    authenticatedStaffId,
    selectedStaffId,
    selectedStoreId,
    activeStaffMembers,
    counterStores,
    counterAssignments,
    activeStoreStatusId,
    activeAssignmentStatusId,
    staffNamesById,
    setCounterSessionContext,
    session,
    counterStores,
  ]);

  const counterContext = () => {
    if (!orgId || !staffId || !storeId) {
      throw new Error(
        "Select an active staff member and store before using Counter.",
      );
    }
    return { organizationId: orgId, storeId, staffId };
  };

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
      const [subscriptions, catalog, productStatuses, benefits] =
        await Promise.all([
          services.counter.subscriptions({
            organizationId: orgId,
            storeId,
            staffId,
          }),
          services.membershipProduct.listProducts(orgId),
          services.status.listMembershipProductStatuses(),
          services.benefit.listByOrganization(orgId),
        ]);
      const activeProductIds = new Set(
        productStatuses
          .filter((status) => status.statusCode?.toUpperCase() === "ACTIVE")
          .map((status) => status.id),
      );
      const owned = new Set<string>();
      const options: MembershipOption[] = [];
      for (const row of subscriptions.filter(
        (item) => item.userId === customerId && item.statusCode === "ACTIVE",
      )) {
        const product = catalog.find(
          (item) => item.id === row.membershipProductId,
        );
        const plan = product?.plans.find(
          (item) => item.id === row.subscriptionPlanId,
        );
        if (!product || !plan)
          throw new Error(
            "Subscription plan is missing from the server catalog.",
          );
        owned.add(product.id);
        const attachedBenefits = benefits.filter(
          (item) => !item.isDeleted && product.benefitIds.includes(item.id),
        );
        const eligibility = attachedBenefits.length
          ? await services.counter.eligibility(
              { organizationId: orgId, storeId, staffId },
              row.id,
              attachedBenefits.map((item) => item.id),
            )
          : [];
        const unavailable = new Set(
          eligibility
            .filter((item) => item.reason)
            .map((item) => item.benefitId),
        );
        options.push({
          subscription: {
            id: row.id,
            subscriptionNumber: row.subscriptionNumber,
            organizationUserId: row.organizationUserId,
            subscriptionPlanId: row.subscriptionPlanId,
            subscriptionDate: row.subscriptionDate,
            startDate: row.startDate,
            endDate: row.endDate,
            subscriptionStatusId: row.subscriptionStatusId,
            totalAmount: {
              amountMinor: Math.round(row.totalAmount * 100),
              currency: row.currencyCode,
            },
            isDeleted: false,
          } as MembershipOption["subscription"],
          productName: product.membershipProductName,
          tier: plan.subscriptionPlanName,
          benefits: attachedBenefits.map((item) => ({
            ...item,
            available: !unavailable.has(item.id),
          })),
        });
      }
      return {
        memberships: options,
        availableProducts: catalog.filter(
          (product) =>
            !product.isDeleted &&
            activeProductIds.has(product.productStatusId) &&
            !owned.has(product.id),
        ),
      };
    },
    [orgId, storeId, staffId],
  );

  const identifyCustomer = async (customerId: string) => {
    try {
      const rows = await services.counter.customers(counterContext());
      const row = rows.find((item) => item.userId === customerId);
      if (!row) throw new Error("Customer is not active in this organization.");
      const identified: Customer = {
        id: row.userId,
        fullName:
          row.displayName ||
          [row.firstName, row.lastName].filter(Boolean).join(" "),
        email: row.primaryEmail ?? undefined,
        phone: row.primaryPhone,
        createdAt: row.joiningDate,
      };
      const { memberships: opts, availableProducts } = await loadMembershipData(
        row.userId,
      );
      setCustomer(identified);
      setMemberships(opts);
      setAvailableForSale(availableProducts);
      if (opts.length) selectMembership(opts[0].subscription.id, opts);
      else {
        setSelectedSubId("");
        setSelectedBenefitIds(new Set());
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to load customer.",
      );
    }
  };

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

  const verifyNewCustomerOtp = async () => {
    if (newOtpVerificationInFlight.current) return;
    if (!newCustomerDraft) {
      setError("Enter customer details before verification.");
      return;
    }
    if (!newOtpRequestId) {
      setError("Verification session expired. Request a new code.");
      return;
    }
    if (normalizeOtp(newOtpCode).length !== OTP_LENGTH) {
      setError("Enter the complete 6-digit verification code.");
      return;
    }
    newOtpVerificationInFlight.current = true;
    setNewOtpVerifying(true);
    try {
      const verified = await services.auth.verifyOtp({
        requestId: newOtpRequestId,
        code: normalizeOtp(newOtpCode),
      });
      if (!verified.verified)
        throw new Error("Incorrect code. Please enter the OTP shown above.");
      const input = newCustomerDraft.user;
      const mobile =
        (input.primaryPhone.callingCode || "") + input.primaryPhone.number;
      const rows = await services.counter.customers(counterContext());
      const existing = rows.find(
        (item) => normalizePhone(item.primaryPhone) === normalizePhone(mobile),
      );
      setNewCustomerWasExisting(Boolean(existing));
      if (existing) {
        counterCheckout.clear();
        await identifyCustomer(existing.userId);
      } else {
        counterCheckout.set({
          firstName: input.firstName,
          lastName: input.lastName,
          primaryEmail: input.primaryEmail,
          primaryPhone: mobile,
        });
        const catalog = await services.membershipProduct.listProducts(orgId);
        setCustomer({
          id: "",
          fullName: [input.firstName, input.lastName].join(" "),
          email: input.primaryEmail,
          phone: mobile,
          createdAt: new Date().toISOString(),
        });
        setMemberships([]);
        setAvailableForSale(catalog.filter((item) => !item.isDeleted));
      }
      setNewOtpRequestId("");
      setNewOtpSent(false);
      setNewDevCode("");
      setNewOtpCode("");
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to verify customer.",
      );
      setNewOtpRequestId("");
      setNewOtpSent(false);
    } finally {
      newOtpVerificationInFlight.current = false;
      setNewOtpVerifying(false);
    }
  };

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
    if (!customer || !staffId || !storeId) {
      setError("Identify a customer and staff/store context first.");
      return;
    }
    if (customer.id) counterCheckout.clear();
    else if (!counterCheckout.get()) {
      setError("Verify the new customer phone first.");
      return;
    }
    router.push({
      pathname: APP_ROUTES.join.root,
      params: {
        organizationId: orgId,
        productId,
        customerId: customer.id,
        staffId,
        storeId,
        source: "STAFF_ASSISTED",
      },
    });
  };

  const runQr = async () => {
    setBusy(true);
    setResult(null);
    setError("");
    try {
      if (!tokenText.trim()) throw new Error("Enter a redemption QR token.");
      const rows = await services.counter.redeemQr(
        counterContext(),
        tokenText.trim(),
      );
      setResult({
        kind: "SUCCESS",
        message: "Redemption completed on the server.",
        outcomes: rows.map((row) => ({
          benefitId: row.benefitId,
          title: row.benefitId,
          status: "REDEEMED",
          redemptionId: row.redemptionId,
        })),
      });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to redeem QR.",
      );
    } finally {
      setBusy(false);
    }
  };

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
    if (otpVerificationInFlight.current) return;
    setError("");
    if (!otpRequestId) {
      setError("Verification session expired. Request a new code.");
      return;
    }
    if (normalizeOtp(otpCode).length !== OTP_LENGTH) {
      setError("Enter the complete 6-digit verification code.");
      return;
    }
    otpVerificationInFlight.current = true;
    setOtpVerifying(true);
    try {
      const verified = await services.auth.verifyOtp({
        requestId: otpRequestId,
        code: normalizeOtp(otpCode),
      });
      if (!verified.verified)
        throw new Error("Incorrect code. Please enter the OTP shown above.");
      const rows = await services.counter.customers(counterContext());
      const row = rows.find(
        (item) => normalizePhone(item.primaryPhone) === normalizePhone(phone),
      );
      if (!row)
        throw new Error(
          "OTP verified, but no customer was found for this phone number. Please request a new OTP and try again.",
        );
      await identifyCustomer(row.userId);
      setOtpRequestId("");
      setOtpSent(false);
      setOtpCode("");
      setDevCode("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to verify customer.",
      );
    } finally {
      otpVerificationInFlight.current = false;
      setOtpVerifying(false);
    }
  };

  const runSearch = async () => {
    setError("");
    setCustomer(null);
    setMemberships([]);
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      setError("Enter a phone number or name to search.");
      return;
    }
    try {
      const rows = await services.counter.customers(counterContext());
      const phoneTerm = normalizePhone(searchTerm);
      setSearchResults(
        rows
          .filter(
            (item) =>
              [
                item.firstName,
                item.lastName,
                item.displayName,
                item.primaryEmail,
              ].some((value) => value?.toLowerCase().includes(term)) ||
              (phoneTerm.length > 0 &&
                normalizePhone(item.primaryPhone).includes(phoneTerm)),
          )
          .map((item) => ({
            id: item.userId,
            fullName:
              item.displayName ||
              [item.firstName, item.lastName].filter(Boolean).join(" "),
            phone: item.primaryPhone,
            email: item.primaryEmail ?? undefined,
            createdAt: item.joiningDate,
          })),
      );
      setSearched(true);
    } catch (failure) {
      setSearchResults([]);
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to search customers.",
      );
    }
  };

  const runManual = async (_method: RedemptionMethod) => {
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const ids = Array.from(selectedBenefitIds);
      const rows = await services.counter.redeem(
        counterContext(),
        selectedSubId,
        ids,
      );
      setResult({
        kind: "SUCCESS",
        message: "Redemption completed on the server.",
        customer: customer ?? undefined,
        outcomes: rows.map((row) => ({
          benefitId: row.benefitId,
          title:
            selectedOption?.benefits.find((item) => item.id === row.benefitId)
              ?.benefitName ?? row.benefitId,
          status: "REDEEMED",
          redemptionId: row.redemptionId,
        })),
      });
      if (customer) {
        const refreshed = await loadMembershipData(customer.id);
        setMemberships(refreshed.memberships);
        setAvailableForSale(refreshed.availableProducts);
        const option = refreshed.memberships.find(
          (item) => item.subscription.id === selectedSubId,
        );
        setSelectedBenefitIds(
          new Set(
            (option?.benefits ?? [])
              .filter((item) => item.available)
              .map((item) => item.id),
          ),
        );
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to redeem benefits.",
      );
    } finally {
      setBusy(false);
    }
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
          <Text style={styles.ctxValue}>
            {(loadedOrgId === orgId
              ? counterOrganization?.displayName
              : null) ?? "Loading..."}
          </Text>
        </View>

        <View style={styles.ctxRow}>
          <Text style={styles.ctxLabel}>Store</Text>
          {storeChoices.length > 1 && !eligibleStores?.primary && !session?.posContext ? (
            <Pressable
              testID="counter-store-selector"
              onPress={() => setStorePickerVisible(true)}
              style={styles.contextSelector}
            >
              <Text style={styles.contextSelectorText}>
                {store?.name ?? "Select store"}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.ctxValue}>{store?.name ?? "—"}</Text>
          )}
        </View>

        <View style={styles.ctxRow}>
          <Text style={styles.ctxLabel}>Staff</Text>
          {!canSelectOperationalStaff || principalStaffIsCurrent || activeStaffMembers.length <= 1 ? (
            <Text style={styles.ctxValue}>
              {counterStaff
                ? `${counterStaffName || "Staff"} · ${counterStaff.role}`
                : selectedStaff
                  ? `${staffNamesById[selectedStaff.id] || selectedStaff.designation || selectedStaff.staffCode} · ${selectedStaff.role}`
                  : activeStaffMembers.length === 0
                    ? "No active staff"
                    : "Resolving staff..."}
            </Text>
          ) : (
            <Pressable
              testID="counter-staff-selector"
              onPress={() => setStaffPickerVisible(true)}
              style={styles.contextSelector}
            >
              <Text style={styles.contextSelectorText}>
                {counterStaff
                  ? `${counterStaffName || counterStaff.staffCode} · ${counterStaff.role}`
                  : selectedStaff
                    ? `${staffNamesById[selectedStaff.id] || selectedStaff.designation || selectedStaff.staffCode} · ${selectedStaff.role}`
                    : activeStaffMembers.length > 0
                      ? "Select staff"
                      : "No active staff"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <Modal
        visible={staffPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStaffPickerVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setStaffPickerVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.cardTitle}>Select Counter Staff</Text>
            <Text style={styles.muted}>
              Operational staff selection for{" "}
              {counterOrganization?.displayName ?? orgId}.
            </Text>
            {activeStaffMembers.map((item) => (
              <Pressable
                key={item.id}
                testID={`counter-staff-option-${item.id}`}
                style={styles.staffOption}
                onPress={() => {
                  resetIdentity();
                  setSelectedStaffId(item.id);
                  setSelectedStoreId("");
                  setStaffPickerVisible(false);
                }}
              >
                <Text style={styles.benefitTitle}>
                  {staffNamesById[item.id] ||
                    item.designation?.trim() ||
                    item.staffCode}
                </Text>
                <Text style={styles.muted}>
                  {item.designation?.trim() || item.staffCode}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={storePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStorePickerVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setStorePickerVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.cardTitle}>Select Counter Store</Text>
            {storeChoices.map((item) => (
              <Pressable
                key={item.id}
                testID={`counter-store-option-${item.id}`}
                style={styles.staffOption}
                onPress={() => {
                  resetIdentity();
                  setSelectedStoreId(item.id);
                  setStorePickerVisible(false);
                }}
              >
                <Text style={styles.benefitTitle}>{item.name}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

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
            and complete the membership purchase to save the customer.
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
                    setNewCustomerWasExisting(false);
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
                    {newOtpVerifying ? "Verifying..." : "Verify Phone"}
                  </Text>
                </Pressable>

                <Pressable
                  testID="counter-new-resend-otp"
                  disabled={newOtpVerifying}
                  onPress={() => {
                    setNewCustomerWasExisting(false);
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
                    setNewCustomerWasExisting(false);
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
                {newCustomerWasExisting
                  ? "Existing customer found — ready at Counter"
                  : "New customer verified and ready to purchase"}
              </Text>

              {newCustomerWasExisting ? (
                <Text style={styles.muted}>
                  This phone number already belongs to an existing customer. The
                  existing customer was opened instead of creating a duplicate.
                </Text>
              ) : null}

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

          {"outcomes" in result ? (
            <>
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
            </>
          ) : (
            <>
              {result.offer ? (
                <Text style={styles.tiny}>
                  {result.offer.offerName}
                  {result.userId ? ` · ${result.userId}` : ""}
                </Text>
              ) : null}

              {result.redemption ? (
                <Text style={styles.tiny}>
                  Redemption: {result.redemption.redemptionNumber}
                </Text>
              ) : null}
            </>
          )}
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

  contextSelector: {
    maxWidth: 360,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: COLORS.background,
  },

  contextSelectorText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.md,
  },

  modalCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "80%",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 8,
  },

  staffOption: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: 12,
    backgroundColor: COLORS.background,
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
