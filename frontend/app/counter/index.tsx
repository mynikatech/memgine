import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
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
import type {
  CounterRedemptionCheckout,
  CounterRedemptionTransaction,
  CounterRedemptionTransactionValidation,
} from "@/src/data/api/counter-api";
import type { CounterRedemptionSelection } from "@/src/data/api/counter-api";

type Mode = "qr" | "phone" | "assisted" | "new";

const MAX_PHONE_DIGITS = 10;

const OTP_LENGTH = 6;

const normalizePhone = (value: string): string =>
  value.replace(/\D/g, "").slice(-MAX_PHONE_DIGITS);

const normalizeOtp = (value: string): string =>
  value.replace(/\D/g, "").slice(0, OTP_LENGTH);

type CounterResult = RedemptionResult | OfferRedemptionResult;

type DynamicRedemptionStage = "scan" | "review" | "success";

type RedemptionCheckoutStage =
  | "idle"
  | "preparing"
  | "ready"
  | "waiting"
  | "failed"
  | "complete";

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
  const { session, hasCapability } = useAuth();

  const router = useRouter();

  const params = useLocalSearchParams<{
    organizationId?: string;
    staffId?: string;
    storeId?: string;
    source?: string;
  }>();

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
    counterStaff?.designation?.trim() || counterStaff?.role || null;

  const [store, setStore] = useState<Store | null>(null);

  const storeId = loadedOrgId === orgId ? (store?.id ?? "") : "";
  const principalStaffIsCurrent =
    loadedOrgId === orgId &&
    activeStaffMembers.some((item) => item.id === authenticatedStaffId);
  const selectedStaff =
    loadedOrgId === orgId
      ? selectCounterStaff(
          activeStaffMembers,
          authenticatedStaffId,
          session?.posContext?.staffId ?? authenticatedStaffId,
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
   * collects the complete customer details first. The customer is not persisted
   * here; the single purchase-bound OTP is requested after a membership is selected.
   */
  const [countries, setCountries] = useState<CountryReference[]>([]);

  const [userStatuses, setUserStatuses] = useState<Status[]>([]);

  // True when the entered phone already belongs to an existing canonical User.
  const [newCustomerWasExisting, setNewCustomerWasExisting] = useState(false);

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
  const [scannerActive, setScannerActive] = useState(false);
  const [dynamicRedemptionStage, setDynamicRedemptionStage] =
    useState<DynamicRedemptionStage>("scan");
  const [resolvedTransaction, setResolvedTransaction] =
    useState<CounterRedemptionTransaction | null>(null);
  const [transactionValidation, setTransactionValidation] = useState<
    CounterRedemptionTransactionValidation[]
  >([]);
  const [executedTransaction, setExecutedTransaction] =
    useState<CounterRedemptionTransaction | null>(null);
  const qrScanInFlight = useRef(false);
  const qrExecutionInFlight = useRef(false);

  const [redemptionCheckout, setRedemptionCheckout] =
    useState<CounterRedemptionCheckout | null>(null);
  const [redemptionCheckoutStage, setRedemptionCheckoutStage] =
    useState<RedemptionCheckoutStage>("idle");
  const redemptionCheckoutValidationRef = useRef<
    CounterRedemptionTransactionValidation[]
  >([]);
  const redemptionCheckoutInFlight = useRef(false);
  const redemptionRemoteStartInFlight = useRef(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [membershipOfferQrText, setMembershipOfferQrText] = useState("");
  const [membershipOfferScannerActive, setMembershipOfferScannerActive] =
    useState(false);
  const [resolvedMembershipPurchaseOffer, setResolvedMembershipPurchaseOffer] =
    useState<{ offerId: string; displayName: string } | null>(null);
  const membershipOfferQrScanInFlight = useRef(false);

  /*
   * Existing customer phone lookup; action-bound OTP happens later
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
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(
    new Set(),
  );
  const [redemptionSelection, setRedemptionSelection] =
    useState<CounterRedemptionSelection | null>(null);

  /*
   * ------------------------------------------------------------
   * Resolve customer behind subscription
   * ------------------------------------------------------------
   */

  const resetIdentity = useCallback(() => {
    counterCheckout.clear();
    setTokenText("");
    setScannerActive(false);
    setDynamicRedemptionStage("scan");
    setResolvedTransaction(null);
    setTransactionValidation([]);
    setExecutedTransaction(null);
    setRedemptionCheckout(null);
    setRedemptionCheckoutStage("idle");
    redemptionCheckoutValidationRef.current = [];
    redemptionCheckoutInFlight.current = false;
    redemptionRemoteStartInFlight.current = false;
    qrScanInFlight.current = false;
    qrExecutionInFlight.current = false;
    setMembershipOfferQrText("");
    setMembershipOfferScannerActive(false);
    setResolvedMembershipPurchaseOffer(null);
    membershipOfferQrScanInFlight.current = false;
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

    setNewCustomerWasExisting(false);

    setCustomer(null);

    setMemberships([]);

    setSelectedSubId("");

    setSelectedBenefitIds(new Set());
    setSelectedOfferIds(new Set());
    setRedemptionSelection(null);

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
    const routeSession =
      params.staffId && params.storeId
        ? {
            organizationId: orgId,
            staffId: params.staffId,
            storeId: params.storeId,
          }
        : null;
    const existingSession =
      routeSession ??
      (counterSessionContext?.organizationId === orgId
        ? counterSessionContext
        : null);
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
        const ownStaffId =
          session?.posContext?.staffId ??
          activeStaff.find(
            (staff) =>
              organizationUsersById.get(staff.organizationUserId)?.userId ===
              session?.userId,
          )?.id ??
          "";

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
    setError(
      activeStaffMembers.length === 0
        ? "No active staff available for this organization."
        : !selectedStaff && !session?.posContext
          ? "Counter access requires your active Counter Operator profile and store assignment."
          : "",
    );

    if (!selectedStaff) return;
    const resolvedStore =
      (session?.posContext
        ? counterStores.find((item) => item.id === session.posContext?.storeId)
        : null) ??
      (selectedStoreId
        ? storeChoices.find((item) => item.id === selectedStoreId)
        : undefined) ??
      eligibleStores?.primary ??
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
        const personName = await services.counter.staffName(context);
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
    setSelectedOfferIds(new Set());
  };

  const loadRedemptionSelection = async (
    subscriptionId: string,
    customerUserId: string,
  ) => {
    setSelectedBenefitIds(new Set());
    setSelectedOfferIds(new Set());
    setRedemptionSelection(null);
    try {
      setRedemptionSelection(
        await services.counter.redemptionSelection(
          counterContext(),
          subscriptionId,
          customerUserId,
        ),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to load redemption items.",
      );
    }
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
      const [subscriptions, catalog, productStatuses] = await Promise.all([
        services.counter.subscriptions({
          organizationId: orgId,
          storeId,
          staffId,
        }),
        services.membershipProduct.listProducts(orgId),
        services.status.listMembershipProductStatuses(),
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
        const attachedBenefits = await services.counter.subscriptionBenefits(
          {
            organizationId: orgId,
            storeId,
            staffId,
          },
          row.id,
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
      if (opts.length) {
        selectMembership(opts[0].subscription.id, opts);
        if (action === "redeem" && (mode === "assisted" || mode === "phone")) {
          await loadRedemptionSelection(opts[0].subscription.id, row.userId);
        }
      } else {
        setSelectedSubId("");
        setSelectedBenefitIds(new Set());
        setSelectedOfferIds(new Set());
        setRedemptionSelection(null);
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

    const input = formResult.user;
    const primaryPhone = input.primaryPhone;
    if (!primaryPhone) {
      setError("Primary Phone Number is required.");
      return;
    }

    const mobile = `${primaryPhone.callingCode}${primaryPhone.number}`;

    try {
      // Do not send a generic OTP here. The one Counter purchase OTP is
      // requested only after the exact membership/plan has been selected.
      const rows = await services.counter.customers(counterContext());
      const existing = rows.find(
        (item) => normalizePhone(item.primaryPhone) === normalizePhone(mobile),
      );

      setNewCustomerWasExisting(Boolean(existing));

      if (existing) {
        counterCheckout.clear();
        await identifyCustomer(existing.userId);
        return;
      }

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
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to prepare customer details.",
      );
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
      setError("Enter the new customer details first.");
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
        explicitOfferId: resolvedMembershipPurchaseOffer?.offerId,
        explicitOfferName: resolvedMembershipPurchaseOffer?.displayName,
      },
    });
  };
  const normalizeMembershipOfferQrToken = (rawValue: string) => {
    const value = rawValue.trim();

    if (!value) return "";

    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\/qr\/([^/]+)\/?$/);

      if (match?.[1]) {
        return decodeURIComponent(match[1]).trim();
      }
    } catch {
      // Raw opaque token is also allowed.
    }

    return value;
  };
  const membershipOfferQrError = (failure: unknown) => {
    const message =
      failure instanceof Error ? failure.message.toLowerCase() : "";

    if (
      message.includes("not permitted") ||
      message.includes("not authorized")
    ) {
      return "This Counter is not authorized to use this Membership Offer QR.";
    }

    if (message.includes("unavailable")) {
      return "This Membership Offer QR is unavailable.";
    }

    if (message.includes("invalid")) {
      return "This Membership Offer QR is invalid.";
    }

    return "Unable to resolve this Membership Offer QR. Please try again.";
  };

  const resolveMembershipOfferQr = async (rawValue: string) => {
    const token = normalizeMembershipOfferQrToken(rawValue);

    if (!token) {
      setError("Enter or scan a Membership Offer QR.");
      return;
    }

    if (membershipOfferQrScanInFlight.current) return;

    membershipOfferQrScanInFlight.current = true;
    setBusy(true);
    setError("");
    setMembershipOfferScannerActive(false);

    try {
      const resolved = await services.counter.resolveMembershipPurchaseOfferQr(
        counterContext(),
        token,
      );

      setResolvedMembershipPurchaseOffer(resolved);
      setMembershipOfferQrText("");
    } catch (failure) {
      setResolvedMembershipPurchaseOffer(null);
      setError(membershipOfferQrError(failure));
    } finally {
      membershipOfferQrScanInFlight.current = false;
      setBusy(false);
    }
  };

  const startMembershipOfferCameraScan = async () => {
    setError("");

    if (Platform.OS === "web") {
      setError(
        "Camera scanning is available in the Memgine mobile app. Enter the Membership Offer QR reference instead.",
      );
      return;
    }

    const permission = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();

    if (!permission.granted) {
      setError(
        "Camera permission is required to scan a Membership Offer QR. Enable it in device settings and try again.",
      );
      return;
    }

    setMembershipOfferScannerActive(true);
  };

  const clearMembershipOfferQr = () => {
    setMembershipOfferQrText("");
    setMembershipOfferScannerActive(false);
    setResolvedMembershipPurchaseOffer(null);
    membershipOfferQrScanInFlight.current = false;
    setError("");
  };

  const redemptionQrError = (failure: unknown) => {
    const message =
      failure instanceof Error ? failure.message.toLowerCase() : "";
    if (message.includes("expired")) return "This redemption QR has expired.";
    if (
      message.includes("not pending") ||
      message.includes("no longer") ||
      message.includes("already used")
    ) {
      return "This redemption QR is no longer valid.";
    }
    if (message.includes("invalid") || message.includes("unavailable")) {
      return "This redemption QR is invalid.";
    }
    if (
      message.includes("cannot be completed") ||
      message.includes("not executable")
    ) {
      return "This redemption cannot be completed. Recheck the basket or scan again.";
    }
    if (
      message.includes("not permitted") ||
      message.includes("not authorized")
    ) {
      return "This Counter is not authorized to process this redemption.";
    }
    return "Unable to resolve this redemption QR. Please try again.";
  };

  const resetDynamicRedemption = () => {
    setTokenText("");
    setScannerActive(false);
    setDynamicRedemptionStage("scan");
    setResolvedTransaction(null);
    setTransactionValidation([]);
    setExecutedTransaction(null);
    setRedemptionCheckout(null);
    setRedemptionCheckoutStage("idle");
    redemptionCheckoutValidationRef.current = [];
    redemptionCheckoutInFlight.current = false;
    redemptionRemoteStartInFlight.current = false;
    setError("");
    setBusy(false);
    qrScanInFlight.current = false;
    qrExecutionInFlight.current = false;
  };

  const resolveRedemptionQr = async (rawReference: string) => {
    const qrReference = rawReference.trim();
    if (!qrReference) {
      setError("Enter or scan a redemption QR.");
      return;
    }
    if (qrScanInFlight.current) return;

    qrScanInFlight.current = true;
    setBusy(true);
    setResult(null);
    setError("");
    setScannerActive(false);
    try {
      const context = counterContext();
      const transaction = await services.counter.resolveRedemptionTransactionQr(
        context,
        qrReference,
      );
      const validation = await services.counter.validateRedemptionTransaction(
        context,
        transaction.transactionId,
      );
      setTokenText("");
      setResolvedTransaction(transaction);
      setTransactionValidation(validation);
      setDynamicRedemptionStage("review");
    } catch (failure) {
      setError(redemptionQrError(failure));
      qrScanInFlight.current = false;
    } finally {
      setBusy(false);
    }
  };

  const startCameraScan = async () => {
    setError("");
    if (Platform.OS === "web") {
      setError(
        "Camera scanning is available in the Memgine mobile app. Enter the QR reference instead.",
      );
      return;
    }
    const permission = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    if (!permission.granted) {
      setError(
        "Camera permission is required to scan a redemption QR. Enable it in device settings and try again.",
      );
      return;
    }
    setScannerActive(true);
  };

  const finishRedemptionCheckout = async (
    checkout: CounterRedemptionCheckout,
  ) => {
    setRedemptionCheckout(checkout);
    setRedemptionCheckoutStage("complete");

    const completed: CounterRedemptionTransaction = {
      transactionId: checkout.redemptionTransactionId,
      transactionNumber: checkout.transactionNumber,
      status: checkout.redemptionStatus,
      completedAt: checkout.redemptionCompletedAt,
    };

    setExecutedTransaction(completed);

    if (mode === "qr") {
      setDynamicRedemptionStage("success");
    }

    const validation = redemptionCheckoutValidationRef.current;

    setResult({
      kind: "SUCCESS",
      message: `Redemption ${checkout.transactionNumber} completed after POS payment.`,
      customer: customer ?? undefined,
      outcomes: validation.map((item) => ({
        benefitId: item.itemId,
        title: item.displayName ?? item.itemId,
        status: "REDEEMED",
        redemptionId: checkout.redemptionTransactionId,
      })),
    });

    if (customer) {
      const refreshed = await loadMembershipData(customer.id);
      setMemberships(refreshed.memberships);
      setAvailableForSale(refreshed.availableProducts);

      if (selectedSubId) {
        await loadRedemptionSelection(selectedSubId, customer.id);
      }
    }
  };

  const applyRedemptionCheckoutState = async (
    latest: CounterRedemptionCheckout,
    autoStartRemotePayment: boolean,
  ) => {
    setRedemptionCheckout(latest);

    if (
      latest.redemptionStatus === "SUCCESS" ||
      latest.commerceStatus === "COMPLETED"
    ) {
      await finishRedemptionCheckout(latest);
      return;
    }

    if (latest.commerceStatus === "PROVIDER_IN_PROGRESS") {
      setRedemptionCheckoutStage("waiting");
      return;
    }

    if (latest.commerceStatus === "ORDER_CREATED" && latest.paymentRequired) {
      if (latest.providerCode === "TEST") {
        setRedemptionCheckoutStage("ready");
        return;
      }

      if (latest.providerCode === "POYNT") {
        if (!autoStartRemotePayment) {
          setRedemptionCheckoutStage("failed");
          setError(
            latest.failureMessage ||
              "Terminal payment did not complete. You can retry the payment.",
          );
          return;
        }

        if (redemptionRemoteStartInFlight.current) return;
        redemptionRemoteStartInFlight.current = true;

        try {
          setRedemptionCheckoutStage("ready");

          await services.counter.startRedemptionRemoteTerminalPayment(
            counterContext(),
            latest.redemptionTransactionId,
          );

          const waiting = await services.counter.redemptionCheckout(
            counterContext(),
            latest.redemptionTransactionId,
          );

          setRedemptionCheckout(waiting);
          setRedemptionCheckoutStage("waiting");
        } finally {
          redemptionRemoteStartInFlight.current = false;
        }

        return;
      }

      throw new Error(
        `Unsupported Counter payment provider: ${latest.providerCode}`,
      );
    }

    if (latest.commerceStatus === "ORDER_CREATED" && !latest.paymentRequired) {
      const refreshed = await services.counter.redemptionCheckout(
        counterContext(),
        latest.redemptionTransactionId,
      );

      if (
        refreshed.redemptionStatus === "SUCCESS" ||
        refreshed.commerceStatus === "COMPLETED"
      ) {
        await finishRedemptionCheckout(refreshed);
        return;
      }
    }

    setRedemptionCheckoutStage("failed");
    setError(
      latest.failureMessage ||
        `Redemption checkout stopped in state ${latest.commerceStatus}.`,
    );
  };

  const beginRedemptionCheckout = async (
    transaction: CounterRedemptionTransaction,
    validation: CounterRedemptionTransactionValidation[],
  ) => {
    if (redemptionCheckoutInFlight.current) return;

    const rejected = validation.find((item) => !item.eligible);
    if (rejected) {
      throw new Error(
        rejected.rejectionReason ?? "A selected item is no longer available.",
      );
    }

    redemptionCheckoutValidationRef.current = validation;
    redemptionCheckoutInFlight.current = true;
    setBusy(true);
    setResult(null);
    setError("");
    setRedemptionCheckout(null);
    setRedemptionCheckoutStage("preparing");

    try {
      const checkout = await services.counter.prepareRedemptionCheckout(
        counterContext(),
        transaction.transactionId,
      );

      if (
        checkout.providerCode === "TEST" &&
        checkout.commerceStatus === "ORDER_CREATED" &&
        checkout.paymentRequired
      ) {
        const completed = await services.counter.confirmRedemptionTestPayment(
          counterContext(),
          checkout.redemptionTransactionId,
          "SUCCEEDED",
        );

        await applyRedemptionCheckoutState(completed, false);
      } else {
        await applyRedemptionCheckoutState(checkout, true);
      }
    } catch (failure) {
      setRedemptionCheckoutStage("failed");
      throw failure;
    } finally {
      redemptionCheckoutInFlight.current = false;
      setBusy(false);
    }
  };

  const completeTestRedemptionPayment = async () => {
    if (!redemptionCheckout) return;

    setBusy(true);
    setError("");

    try {
      const completed = await services.counter.confirmRedemptionTestPayment(
        counterContext(),
        redemptionCheckout.redemptionTransactionId,
        "SUCCEEDED",
      );

      await applyRedemptionCheckoutState(completed, false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to complete TEST redemption payment.",
      );
    } finally {
      setBusy(false);
    }
  };

  const retryRedemptionTerminalPayment = async () => {
    if (!redemptionCheckout) return;

    setBusy(true);
    setError("");

    try {
      await services.counter.startRedemptionRemoteTerminalPayment(
        counterContext(),
        redemptionCheckout.redemptionTransactionId,
      );

      const latest = await services.counter.redemptionCheckout(
        counterContext(),
        redemptionCheckout.redemptionTransactionId,
      );

      setRedemptionCheckout(latest);
      setRedemptionCheckoutStage("waiting");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to retry terminal payment.",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (
      redemptionCheckoutStage !== "waiting" ||
      !redemptionCheckout ||
      redemptionCheckout.providerCode !== "POYNT"
    ) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const latest = await services.counter.redemptionCheckout(
          counterContext(),
          redemptionCheckout.redemptionTransactionId,
        );

        if (cancelled) return;

        setRedemptionCheckout(latest);

        if (
          latest.redemptionStatus === "SUCCESS" ||
          latest.commerceStatus === "COMPLETED"
        ) {
          await finishRedemptionCheckout(latest);
          return;
        }

        if (latest.commerceStatus === "PROVIDER_IN_PROGRESS") {
          timer = setTimeout(() => void poll(), 1500);
          return;
        }

        setRedemptionCheckoutStage("failed");
        setError(
          latest.failureMessage ||
            "Terminal payment was not completed. You can retry the payment.",
        );
      } catch (failure) {
        if (cancelled) return;

        setRedemptionCheckoutStage("failed");
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to check terminal payment status.",
        );
      }
    };

    timer = setTimeout(() => void poll(), 1500);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [redemptionCheckoutStage, redemptionCheckout?.redemptionTransactionId]);

  const executeDynamicRedemption = async () => {
    if (
      !resolvedTransaction ||
      transactionValidation.length === 0 ||
      transactionValidation.some((item) => !item.eligible) ||
      qrExecutionInFlight.current
    ) {
      return;
    }

    qrExecutionInFlight.current = true;
    setError("");

    try {
      await beginRedemptionCheckout(resolvedTransaction, transactionValidation);
    } catch (failure) {
      setError(redemptionQrError(failure));
    } finally {
      qrExecutionInFlight.current = false;
    }
  };

  const findCustomerByPhone = async () => {
    setError("");

    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length !== MAX_PHONE_DIGITS) {
      setError("Enter a 10-digit phone number.");
      return;
    }

    try {
      const rows = await services.counter.customers(counterContext());
      const row = rows.find(
        (item) => normalizePhone(item.primaryPhone) === normalizedPhone,
      );
      if (!row) {
        throw new Error("No active customer was found for this phone number.");
      }

      // Identification itself is only lookup. The action-bound OTP is requested
      // after the membership (sale) or exact benefits (redemption) are selected.
      await identifyCustomer(row.userId);
      setOtpRequestId("");
      setOtpSent(false);
      setOtpCode("");
      setDevCode("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to find customer.",
      );
    }
  };

  const verifyRedemptionOtp = async () => {
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
    setBusy(true);
    try {
      const completed = await services.counter.completeRedemptionOtp(
        counterContext(),
        otpRequestId,
        normalizeOtp(otpCode),
      );

      const validation = await services.counter.validateRedemptionTransaction(
        counterContext(),
        completed.transactionId,
      );

      // Retain the exact OTP-authorized transaction for POS retries.
      // A provider/order failure must not require another OTP.
      setResolvedTransaction(completed);
      setTransactionValidation(validation);

      setOtpRequestId("");
      setOtpSent(false);
      setOtpCode("");
      setDevCode("");

      await beginRedemptionCheckout(completed, validation);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to verify redemption code.",
      );
    } finally {
      otpVerificationInFlight.current = false;
      setOtpVerifying(false);
      setBusy(false);
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

  const sendRedemptionOtp = async () => {
    setBusy(true);
    setResult(null);
    setError("");

    try {
      const benefitIds = Array.from(selectedBenefitIds);
      const offerIds = Array.from(selectedOfferIds);

      if (
        !customer ||
        !selectedSubId ||
        benefitIds.length + offerIds.length === 0
      ) {
        throw new Error("Select a customer, membership and at least one item.");
      }

      if (!customer.phone) {
        throw new Error(
          "This customer does not have a phone number. Use Staff-Assisted redemption.",
        );
      }

      const challenge = await services.counter.requestRedemptionOtp(
        counterContext(),
        customer.phone,
        selectedSubId,
        benefitIds,
        offerIds,
      );

      setOtpRequestId(challenge.challengeId);
      setDevCode(String(challenge.devCode ?? ""));
      setOtpCode("");
      setOtpSent(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to send redemption verification code.",
      );
    } finally {
      setBusy(false);
    }
  };

  const runManual = async () => {
    setBusy(true);
    setResult(null);
    setError("");

    try {
      if (
        resolvedTransaction &&
        transactionValidation.length > 0 &&
        transactionValidation.every((item) => item.eligible)
      ) {
        await beginRedemptionCheckout(
          resolvedTransaction,
          transactionValidation,
        );
        return;
      }

      const benefitIds = Array.from(selectedBenefitIds);
      const offerIds = Array.from(selectedOfferIds);

      if (
        !customer ||
        !selectedSubId ||
        benefitIds.length + offerIds.length === 0
      ) {
        throw new Error("Select a customer, membership and at least one item.");
      }

      const transaction = await services.counter.createRedemptionTransaction(
        counterContext(),
        selectedSubId,
        benefitIds,
        offerIds,
        "STAFF_ASSISTED",
      );
      const validation = await services.counter.validateRedemptionTransaction(
        counterContext(),
        transaction.transactionId,
      );
      const rejected = validation.find((item) => !item.eligible);
      if (rejected) {
        throw new Error(
          rejected.rejectionReason ?? "A selected item is no longer available.",
        );
      }

      // Retain the exact transaction so provider/order failure retries the same
      // PENDING basket instead of creating a duplicate redemption transaction.
      setResolvedTransaction(transaction);
      setTransactionValidation(validation);

      await beginRedemptionCheckout(transaction, validation);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to prepare redemption checkout.",
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

  const toggleOffer = (id: string) =>
    setSelectedOfferIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  const consolidatedRedemption =
    action === "redeem" && (mode === "assisted" || mode === "phone");
  const redemptionBenefitItems = redemptionSelection?.benefits ?? [];
  const redemptionOfferItems = redemptionSelection?.offers ?? [];
  const redemptionBenefitCount = redemptionBenefitItems.filter(
    (item) => item.status === "AVAILABLE" && selectedBenefitIds.has(item.id),
  ).length;
  const redemptionOfferCount = redemptionOfferItems.filter(
    (item) => item.status === "AVAILABLE" && selectedOfferIds.has(item.id),
  ).length;
  const consolidatedSelectedCount =
    redemptionBenefitCount + redemptionOfferCount;
  const consolidatedSummary = [
    redemptionBenefitCount
      ? `${redemptionBenefitCount} Benefit${redemptionBenefitCount === 1 ? "" : "s"}`
      : "",
    redemptionOfferCount
      ? `${redemptionOfferCount} Offer${redemptionOfferCount === 1 ? "" : "s"}`
      : "",
  ]
    .filter(Boolean)
    .join(" + ");

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
                      disabled={otpSent}
                      onPress={() => {
                        selectMembership(option.subscription.id);
                        if (consolidatedRedemption) {
                          void loadRedemptionSelection(
                            option.subscription.id,
                            customer.id,
                          );
                        }
                      }}
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

            {consolidatedRedemption ? (
              <>
                <Text style={styles.sectionTitle}>Benefits</Text>
                {redemptionBenefitItems.map((benefit) => {
                  const selectable = benefit.status === "AVAILABLE";
                  const on = selectable && selectedBenefitIds.has(benefit.id);
                  return (
                    <Pressable
                      key={benefit.id}
                      testID={`counter-benefit-${benefit.id}`}
                      disabled={!selectable || busy}
                      onPress={() => toggleBenefit(benefit.id)}
                      style={[
                        styles.benefitRow,
                        !selectable && { opacity: 0.5 },
                      ]}
                    >
                      <View style={[styles.check, on && styles.checkOn]}>
                        {on ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.benefitTitle}>
                          {benefit.displayName}
                        </Text>
                        {benefit.description ? (
                          <Text style={styles.muted}>
                            {benefit.description}
                          </Text>
                        ) : null}
                      </View>
                      {!selectable ? (
                        <Text style={styles.usedTag}>
                          {benefit.displayReason ?? "UNAVAILABLE"}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
                {redemptionOfferItems.length ? (
                  <Text style={styles.sectionTitle}>Offers</Text>
                ) : null}
                {redemptionOfferItems.map((offer) => {
                  const selectable = offer.status === "AVAILABLE";
                  const on = selectable && selectedOfferIds.has(offer.id);
                  return (
                    <Pressable
                      key={offer.id}
                      testID={`counter-offer-${offer.id}`}
                      disabled={!selectable || busy}
                      onPress={() => toggleOffer(offer.id)}
                      style={[styles.offerRow, !selectable && { opacity: 0.5 }]}
                    >
                      <View style={[styles.check, on && styles.checkOn]}>
                        {on ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.benefitTitle}>
                          {offer.displayName}
                        </Text>
                        {offer.badgeText ? (
                          <Text style={styles.offerBadge}>
                            {offer.badgeText}
                          </Text>
                        ) : null}
                        {offer.description ? (
                          <Text style={styles.muted}>{offer.description}</Text>
                        ) : null}
                      </View>
                      {!selectable ? (
                        <Text style={styles.usedTag}>
                          {offer.displayReason ?? "UNAVAILABLE"}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </>
            ) : (
              selectedOption?.benefits.map((benefit) => {
                const on =
                  benefit.available && selectedBenefitIds.has(benefit.id);

                return (
                  <Pressable
                    key={benefit.id}
                    testID={`counter-benefit-${benefit.id}`}
                    disabled={!benefit.available || otpSent}
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
              })
            )}

            <View style={styles.redeemBar}>
              <Text style={styles.muted}>
                {consolidatedRedemption
                  ? consolidatedSummary
                    ? `${consolidatedSummary} selected`
                    : "No items selected"
                  : `${selectedCount} selected`}
              </Text>

              {method === RedemptionMethod.STAFF_ASSISTED ? (
                <Pressable
                  testID="counter-redeem-staff-assisted"
                  disabled={consolidatedSelectedCount === 0 || busy}
                  onPress={() => runManual()}
                  style={[
                    styles.primaryBtn,
                    (consolidatedSelectedCount === 0 || busy) &&
                      styles.btnDisabled,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {busy ? "Preparing..." : "Continue to POS"}
                  </Text>
                </Pressable>
              ) : !otpSent ? (
                <Pressable
                  testID="counter-send-redemption-otp"
                  disabled={consolidatedSelectedCount === 0 || busy}
                  onPress={sendRedemptionOtp}
                  style={[
                    styles.primaryBtn,
                    (consolidatedSelectedCount === 0 || busy) &&
                      styles.btnDisabled,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>Send Redemption OTP</Text>
                </Pressable>
              ) : (
                <View style={styles.otpSection}>
                  <Text style={styles.label}>Redemption Verification</Text>

                  <Text style={styles.muted}>
                    OTP is bound to this membership and the selected items.
                  </Text>

                  {devCode ? (
                    <Text style={styles.tiny}>Dev code: {devCode}</Text>
                  ) : null}

                  <TextInput
                    testID="counter-redemption-otp"
                    value={otpCode}
                    onChangeText={(value) => setOtpCode(normalizeOtp(value))}
                    placeholder="Enter OTP"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                    maxLength={OTP_LENGTH}
                    style={styles.input}
                  />

                  <Pressable
                    testID="counter-redemption-verify"
                    disabled={
                      otpVerifying ||
                      normalizeOtp(otpCode).length !== OTP_LENGTH
                    }
                    onPress={verifyRedemptionOtp}
                    style={[
                      styles.primaryBtn,
                      (otpVerifying ||
                        normalizeOtp(otpCode).length !== OTP_LENGTH) &&
                        styles.btnDisabled,
                    ]}
                  >
                    <Text style={styles.primaryBtnText}>
                      {otpVerifying ? "Verifying..." : "Verify & Continue"}
                    </Text>
                  </Pressable>

                  <Pressable
                    testID="counter-redemption-cancel-otp"
                    disabled={otpVerifying}
                    onPress={() => {
                      setOtpRequestId("");
                      setOtpSent(false);
                      setOtpCode("");
                      setDevCode("");
                      setError("");
                    }}
                    style={styles.secondaryBtn}
                  >
                    <Text style={styles.secondaryBtnText}>Cancel OTP</Text>
                  </Pressable>
                </View>
              )}
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

        <View style={{ gap: SPACING.xs }}>
          <Text style={styles.label}>Membership Offer QR (optional)</Text>

          {resolvedMembershipPurchaseOffer ? (
            <>
              <Text style={styles.identified}>
                Offer applied: {resolvedMembershipPurchaseOffer.displayName}
              </Text>

              <Pressable
                testID="counter-clear-membership-offer-qr"
                onPress={clearMembershipOfferQr}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Remove Offer</Text>
              </Pressable>
            </>
          ) : (
            <>
              {membershipOfferScannerActive && Platform.OS !== "web" ? (
                <View style={styles.cameraFrame}>
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={({ data }) =>
                      void resolveMembershipOfferQr(data)
                    }
                    onMountError={() => {
                      setMembershipOfferScannerActive(false);

                      setError(
                        "The camera is unavailable on this device. Enter the Membership Offer QR reference instead.",
                      );
                    }}
                  />

                  <Pressable
                    onPress={() => setMembershipOfferScannerActive(false)}
                    style={styles.cameraCancel}
                  >
                    <Text style={styles.secondaryBtnText}>Cancel camera</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                testID="counter-scan-membership-offer-qr"
                disabled={busy}
                onPress={() => void startMembershipOfferCameraScan()}
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
              >
                <Text style={styles.primaryBtnText}>
                  {busy ? "Resolving..." : "Scan Membership Offer QR"}
                </Text>
              </Pressable>

              <TextInput
                testID="counter-membership-offer-qr-input"
                value={membershipOfferQrText}
                onChangeText={setMembershipOfferQrText}
                placeholder="Membership Offer QR reference"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />

              <Pressable
                testID="counter-use-membership-offer-qr"
                disabled={!membershipOfferQrText.trim() || busy}
                onPress={() =>
                  void resolveMembershipOfferQr(membershipOfferQrText)
                }
                style={[
                  styles.secondaryBtn,
                  (!membershipOfferQrText.trim() || busy) && styles.btnDisabled,
                ]}
              >
                <Text style={styles.secondaryBtnText}>Use Offer QR</Text>
              </Pressable>
            </>
          )}
        </View>

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

  const fixedPosContextReady = Boolean(
    session?.posContext &&
    loadedOrgId === orgId &&
    counterStaff &&
    store &&
    staffId &&
    storeId,
  );
  const normalContextReady = Boolean(
    session &&
    loadedOrgId === orgId &&
    principalStaffIsCurrent &&
    counterStaff &&
    store &&
    staffId &&
    storeId,
  );
  const counterContextReady = session?.posContext
    ? fixedPosContextReady
    : normalContextReady;
  const blockedCounterMessage =
    loadedOrgId !== orgId
      ? "Resolving your Counter access…"
      : !authenticatedStaffId
        ? "Counter access requires an active Counter Operator profile linked to your account."
        : !principalStaffIsCurrent
          ? "Your Counter Operator profile is inactive or unavailable."
          : !storeId
            ? "Your Counter Operator profile needs an active eligible store assignment."
            : "Counter access requires an active Counter Operator profile and store assignment.";

  /*
   * ------------------------------------------------------------
   * Render
   * ------------------------------------------------------------
   */

  if (!counterContextReady) {
    return (
      <ScrollView
        testID="staff-counter-blocked-screen"
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.h1}>Counter</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Counter unavailable</Text>
          <Text style={styles.muted}>{blockedCounterMessage}</Text>
          {hasCapability("ORG_ADMIN_ACCESS", orgId) ? (
            <Pressable
              testID="counter-configure-access"
              onPress={() =>
                router.push(APP_ROUTES.orgAdmin.usersAccess(orgId) as never)
              }
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryBtnText}>
                Configure Users &amp; Access
              </Text>
            </Pressable>
          ) : null}
        </View>
        {error ? (
          <Text testID="counter-error" style={styles.errorText}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    );
  }

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
          {storeChoices.length > 1 &&
          !eligibleStores?.primary &&
          !session?.posContext ? (
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
          {session?.posContext || principalStaffIsCurrent || !selectedStaff ? (
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
                ? "Phone Lookup"
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
          {dynamicRedemptionStage === "success" && executedTransaction ? (
            <>
              <Text style={styles.cardTitle}>Redemption successful</Text>
              <Text style={styles.resultMsg}>
                {
                  transactionValidation.filter(
                    (item) => item.itemType === "BENEFIT",
                  ).length
                }{" "}
                benefit
                {transactionValidation.filter(
                  (item) => item.itemType === "BENEFIT",
                ).length === 1
                  ? ""
                  : "s"}{" "}
                and{" "}
                {
                  transactionValidation.filter(
                    (item) => item.itemType === "OFFER",
                  ).length
                }{" "}
                offer
                {transactionValidation.filter(
                  (item) => item.itemType === "OFFER",
                ).length === 1
                  ? ""
                  : "s"}{" "}
                redeemed.
              </Text>
              <Text style={styles.muted}>
                Transaction: {executedTransaction.transactionNumber}
              </Text>
              <Pressable
                testID="counter-redemption-scan-next"
                onPress={resetDynamicRedemption}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>Done / Scan Next</Text>
              </Pressable>
            </>
          ) : dynamicRedemptionStage === "review" && resolvedTransaction ? (
            <>
              <Text style={styles.cardTitle}>
                Redeem {transactionValidation.length} item
                {transactionValidation.length === 1 ? "" : "s"}
              </Text>
              <Text style={styles.muted}>
                Transaction {resolvedTransaction.transactionNumber}. All items
                must be eligible before redemption can be confirmed.
              </Text>
              {(["BENEFIT", "OFFER"] as const).map((itemType) => {
                const items = transactionValidation.filter(
                  (item) => item.itemType === itemType,
                );
                if (!items.length) return null;
                return (
                  <View key={itemType} style={styles.redemptionSection}>
                    <Text style={styles.label}>
                      {itemType === "BENEFIT" ? "Benefits" : "Offers"}
                    </Text>
                    {items.map((item) => (
                      <View key={item.itemId} style={styles.redemptionItem}>
                        <View
                          style={[
                            styles.redemptionIndicator,
                            item.eligible
                              ? styles.redemptionEligible
                              : styles.redemptionIneligible,
                          ]}
                        >
                          <Text style={styles.redemptionIndicatorText}>
                            {item.eligible ? "✓" : "×"}
                          </Text>
                        </View>
                        <View style={styles.redemptionItemContent}>
                          <Text style={styles.benefitTitle}>
                            {item.displayName?.trim() ||
                              (itemType === "BENEFIT" ? "Benefit" : "Offer")}
                          </Text>
                          {item.description ? (
                            <Text style={styles.muted}>{item.description}</Text>
                          ) : null}
                          {!item.eligible && item.rejectionReason ? (
                            <Text style={styles.redemptionRejection}>
                              {item.rejectionReason}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
              <Pressable
                testID="counter-confirm-consolidated-redemption"
                disabled={
                  busy ||
                  transactionValidation.length === 0 ||
                  transactionValidation.some((item) => !item.eligible)
                }
                onPress={executeDynamicRedemption}
                style={[
                  styles.primaryBtn,
                  (busy ||
                    transactionValidation.length === 0 ||
                    transactionValidation.some((item) => !item.eligible)) &&
                    styles.btnDisabled,
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {busy ? "Preparing..." : "Continue to POS"}
                </Text>
              </Pressable>
              <Pressable
                testID="counter-scan-another-redemption-qr"
                disabled={busy}
                onPress={resetDynamicRedemption}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Scan Another QR</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Scan Redemption QR</Text>
              <Text style={styles.muted}>
                Scan the customer&apos;s secure redemption QR. Its contents are
                verified by Memgine before any redemption is shown.
              </Text>
              {scannerActive && Platform.OS !== "web" ? (
                <View style={styles.cameraFrame}>
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={({ data }) =>
                      void resolveRedemptionQr(data)
                    }
                    onMountError={() => {
                      setScannerActive(false);
                      setError(
                        "The camera is unavailable on this device. Enter the QR reference instead.",
                      );
                    }}
                  />
                  <Pressable
                    onPress={() => setScannerActive(false)}
                    style={styles.cameraCancel}
                  >
                    <Text style={styles.secondaryBtnText}>Cancel camera</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                testID="counter-scan-redemption-qr"
                disabled={busy}
                onPress={() => void startCameraScan()}
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
              >
                <Text style={styles.primaryBtnText}>
                  {busy ? "Resolving..." : "Scan Redemption QR"}
                </Text>
              </Pressable>
              <Text style={styles.label}>Enter QR reference</Text>
              <TextInput
                testID="counter-qr-input"
                value={tokenText}
                onChangeText={setTokenText}
                placeholder="Redemption QR reference"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Pressable
                testID="counter-redeem-qr"
                disabled={!tokenText.trim() || busy}
                onPress={() => void resolveRedemptionQr(tokenText)}
                style={[
                  styles.secondaryBtn,
                  (!tokenText.trim() || busy) && styles.btnDisabled,
                ]}
              >
                <Text style={styles.secondaryBtnText}>Use QR Reference</Text>
              </Pressable>
              {error ? (
                <Pressable
                  testID="counter-redemption-scan-again"
                  onPress={resetDynamicRedemption}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>Scan Again</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {/* Phone lookup — OTP is requested only after the exact action is selected */}
      {mode === "phone" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phone Lookup</Text>

          <Text style={styles.muted}>
            Find the customer first. For a sale, the single OTP is requested
            after the membership is selected. For a manual redemption, it is
            requested after the exact benefits are selected.
          </Text>

          {!customer ? (
            <>
              <TextInput
                testID="counter-phone-input"
                value={phone}
                onChangeText={(value) => setPhone(normalizePhone(value))}
                placeholder="Customer phone number"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={MAX_PHONE_DIGITS}
                style={styles.input}
              />

              <Pressable
                testID="counter-find-phone"
                disabled={normalizePhone(phone).length !== MAX_PHONE_DIGITS}
                onPress={findCustomerByPhone}
                style={[
                  styles.primaryBtn,
                  normalizePhone(phone).length !== MAX_PHONE_DIGITS &&
                    styles.btnDisabled,
                ]}
              >
                <Text style={styles.primaryBtnText}>Find Customer</Text>
              </Pressable>
            </>
          ) : null}

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
            Add the customer details and choose a membership. The customer will
            receive one purchase-bound OTP after the membership is selected. The
            customer is created only when that verified purchase completes.
          </Text>

          {!customer ? (
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
                  counterCheckout.clear();
                  setNewCustomerWasExisting(false);
                  setError("");
                }}
              />
            ) : (
              <Text style={styles.muted}>
                Loading customer reference data...
              </Text>
            )
          ) : (
            <View style={styles.customerSavedBox}>
              <Text style={styles.identified}>
                {newCustomerWasExisting
                  ? "Existing customer found — choose a membership"
                  : "Customer details ready — choose a membership"}
              </Text>

              {newCustomerWasExisting ? (
                <Text style={styles.muted}>
                  This phone number already belongs to an existing customer, so
                  the existing customer will be used.
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

      {action === "redeem" &&
      redemptionCheckoutStage === "failed" &&
      !redemptionCheckout &&
      resolvedTransaction &&
      transactionValidation.length > 0 &&
      transactionValidation.every((item) => item.eligible) ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>POS Checkout Not Completed</Text>
          <Text style={styles.muted}>
            The redemption is still pending and has not consumed any Benefit or
            Offer.
          </Text>

          <Pressable
            testID="counter-redemption-retry-checkout"
            disabled={busy}
            onPress={() =>
              void beginRedemptionCheckout(
                resolvedTransaction,
                transactionValidation,
              )
            }
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
          >
            <Text style={styles.primaryBtnText}>
              {busy ? "Retrying..." : "Retry POS Checkout"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {action === "redeem" &&
      redemptionCheckout &&
      redemptionCheckoutStage !== "idle" &&
      redemptionCheckoutStage !== "complete" ? (
        <View testID="counter-redemption-checkout" style={styles.card}>
          <Text style={styles.cardTitle}>
            {redemptionCheckoutStage === "preparing"
              ? "Preparing POS Order"
              : redemptionCheckoutStage === "waiting"
                ? "Waiting for Payment"
                : redemptionCheckoutStage === "failed"
                  ? "Payment Not Completed"
                  : "Ready for Payment"}
          </Text>

          <Text style={styles.muted}>
            Redemption {redemptionCheckout.transactionNumber}
          </Text>

          {redemptionCheckout.subtotalMinor != null &&
          redemptionCheckout.currencyCode ? (
            <>
              <View style={styles.ctxRow}>
                <Text style={styles.ctxLabel}>POS subtotal</Text>
                <Text style={styles.ctxValue}>
                  {redemptionCheckout.currencyCode}{" "}
                  {(redemptionCheckout.subtotalMinor / 100).toFixed(2)}
                </Text>
              </View>

              <View style={styles.ctxRow}>
                <Text style={styles.ctxLabel}>Benefit / Offer discount</Text>
                <Text style={styles.ctxValue}>
                  {redemptionCheckout.currencyCode}{" "}
                  {(
                    (redemptionCheckout.adjustmentTotalMinor ?? 0) / 100
                  ).toFixed(2)}
                </Text>
              </View>

              <View style={styles.ctxRow}>
                <Text style={styles.ctxLabel}>Tax</Text>
                <Text style={styles.ctxValue}>
                  {redemptionCheckout.currencyCode}{" "}
                  {((redemptionCheckout.taxTotalMinor ?? 0) / 100).toFixed(2)}
                </Text>
              </View>

              <View style={styles.ctxRow}>
                <Text style={styles.ctxLabel}>Amount to pay</Text>
                <Text style={styles.ctxValue}>
                  {redemptionCheckout.currencyCode}{" "}
                  {((redemptionCheckout.totalMinor ?? 0) / 100).toFixed(2)}
                </Text>
              </View>
            </>
          ) : null}

          {redemptionCheckoutStage === "waiting" ? (
            <Text style={styles.identified}>
              Payment was sent to the store terminal. Complete the payment on
              the Poynt device.
            </Text>
          ) : null}

          {redemptionCheckoutStage === "ready" &&
          redemptionCheckout.providerCode === "TEST" ? (
            <Pressable
              testID="counter-redemption-test-payment"
              disabled={busy}
              onPress={() => void completeTestRedemptionPayment()}
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "Completing..." : "Complete TEST Payment"}
              </Text>
            </Pressable>
          ) : null}

          {redemptionCheckoutStage === "failed" &&
          redemptionCheckout.providerCode === "POYNT" ? (
            <Pressable
              testID="counter-redemption-retry-payment"
              disabled={busy}
              onPress={() => void retryRedemptionTerminalPayment()}
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "Retrying..." : "Retry Terminal Payment"}
              </Text>
            </Pressable>
          ) : null}
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

  cameraFrame: {
    height: 280,
    overflow: "hidden",
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#111827",
    position: "relative",
  },

  camera: {
    flex: 1,
  },

  cameraCancel: {
    position: "absolute",
    left: SPACING.sm,
    right: SPACING.sm,
    bottom: SPACING.sm,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
  },

  redemptionSection: {
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },

  redemptionItem: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "flex-start",
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
  },

  redemptionItemContent: {
    flex: 1,
    gap: 2,
  },

  redemptionIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  redemptionEligible: {
    backgroundColor: "#DCFCE7",
  },

  redemptionIneligible: {
    backgroundColor: "#FEE2E2",
  },

  redemptionIndicatorText: {
    fontWeight: "800",
    color: COLORS.text,
  },

  redemptionRejection: {
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "600",
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

  sectionTitle: {
    marginTop: SPACING.xs,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },

  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: "#ECFDF5",
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },

  offerBadge: {
    marginTop: 2,
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "700",
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
