import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import {
  services,
  type CreateUserInput,
  type CountryReference,
  type ID,
  type MembershipProduct,
  type OrganizationUser,
  type Status,
  type Store,
  type Subscription,
  type User,
  type UserAcquisition,
} from "@/src/core";

import { useBusiness } from "@/src/providers";

import { DataTable, type DataTableColumn, Text } from "@/src/ui";

import { CustomerForm } from "@/src/ui/admin/CustomerForm";
import { Input } from "@/src/ui/Input";

const CUSTOMER_USER_TYPE_ID = "org-user-type-customer";
const ACTIVE_ORGANIZATION_USER_STATUS_ID = "status-active";
const ACTIVE_USER_STATUS_ID = "user-status-active";
const SYSTEM_USER_ID = "user-system";

type CustomerRow = {
  organizationUser: OrganizationUser;
  user: User;
  subscriptions: Subscription[];
  membershipName?: string;
  membershipProductName?: string;
};

type ProspectRow = {
  organizationUser: OrganizationUser;
  user: User;
  acquisition?: UserAcquisition;
  store?: Store;
  membershipName?: string;
  membershipProductName?: string;
};

type PendingProspect = {
  draftId: string;
  user: CreateUserInput;
  sourceStoreId?: string;
};

type SelectedCustomer = {
  user: User;
  type: "EXISTING" | "PROSPECTIVE";
  organizationUser: OrganizationUser;
  subscriptions: Subscription[];
  acquisition?: UserAcquisition;
  store?: Store;
};

function getDisplayName(user: User): string {
  return (
    user.displayName?.trim() ||
    `${user.firstName} ${user.middleName ?? ""} ${user.lastName}`
      .replace(/\s+/g, " ")
      .trim() ||
    user.userCode
  );
}

function getPhoneDisplay(user: User): string {
  return `${user.primaryPhone.callingCode ?? ""} ${user.primaryPhone.number ?? ""}`.trim();
}

function clonePendingProspect(pending: PendingProspect): PendingProspect {
  return {
    draftId: pending.draftId,
    user: {
      ...pending.user,
      primaryPhone: { ...pending.user.primaryPhone },
    },
    sourceStoreId: pending.sourceStoreId,
  };
}

export default function OrgAdminCustomers() {
  const { organization } = useBusiness();
  const mountedRef = useRef(true);

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [countries, setCountries] = useState<CountryReference[]>([]);
  const [userStatuses, setUserStatuses] = useState<Status[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [pendingProspects, setPendingProspects] = useState<PendingProspect[]>(
    [],
  );
  const [prospectEdits, setProspectEdits] = useState<
    Record<ID, PendingProspect>
  >({});
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingProspectiveCustomer, setEditingProspectiveCustomer] =
    useState<ProspectRow | null>(null);
  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null);
  const [saveMessage, setSaveMessage] = useState("");

  const loadCustomers = useCallback(async () => {
    if (!mountedRef.current) {
      return;
    }

    setLoading(true);

    try {
      const [
        organizationUsers,
        organizationStores,
        users,
        subscriptions,
        membershipProducts,
        acquisitions,
        countryReferences,
        userStatusList,
      ] = await Promise.all([
        services.organization.listOrganizationUsers(organization.id),
        services.organization.listStores(organization.id),
        services.organization.listUsers(),
        services.subscription.listByOrganization(organization.id),
        services.membershipProduct.listProducts(organization.id),
        services.userAcquisition.listByOrganization(organization.id),
        services.referenceData.listCountries(),
        services.status.listUserStatuses(),
      ]);

      if (!mountedRef.current) {
        return;
      }

      setStores(organizationStores);
      setCountries(countryReferences);
      setUserStatuses(userStatusList);

      const userMap = new Map<ID, User>(
        users.filter((user) => !user.isDeleted).map((user) => [user.id, user]),
      );

      const storeMap = new Map<ID, Store>(
        organizationStores
          .filter((store) => !store.isDeleted)
          .map((store) => [store.id, store]),
      );

      const membershipProductsByPlanId = new Map<ID, MembershipProduct>();

      for (const product of membershipProducts) {
        if (product.isDeleted) {
          continue;
        }

        for (const plan of product.plans ?? []) {
          if (!plan.isDeleted) {
            membershipProductsByPlanId.set(plan.id, product);
          }
        }
      }

      const getMembershipDisplay = (
        subscriptionList: Subscription[],
      ): {
        planName?: string;
        productName?: string;
      } => {
        const activeOrFirst = subscriptionList
          .filter((subscription) => !subscription.isDeleted)
          .map((subscription) => {
            const product = membershipProductsByPlanId.get(
              subscription.subscriptionPlanId,
            );

            const plan = product?.plans?.find(
              (item) =>
                !item.isDeleted && item.id === subscription.subscriptionPlanId,
            );

            return {
              planName: plan?.subscriptionPlanName?.trim(),
              productName:
                product?.membershipProductName?.trim() ||
                product?.displayName?.trim(),
            };
          })
          .find((item) => item.planName || item.productName);

        return activeOrFirst ?? {};
      };

      const subscriptionsByOrganizationUser = new Map<ID, Subscription[]>();

      for (const subscription of subscriptions) {
        if (subscription.isDeleted) {
          continue;
        }

        const current =
          subscriptionsByOrganizationUser.get(
            subscription.organizationUserId,
          ) ?? [];

        current.push(subscription);
        subscriptionsByOrganizationUser.set(
          subscription.organizationUserId,
          current,
        );
      }

      const acquisitionsByUser = new Map<ID, UserAcquisition>();

      for (const acquisition of acquisitions) {
        if (
          acquisition.isDeleted ||
          acquisition.organizationId !== organization.id
        ) {
          continue;
        }

        const current = acquisitionsByUser.get(acquisition.userId);

        if (
          !current ||
          new Date(acquisition.createdAt).getTime() >
            new Date(current.createdAt).getTime()
        ) {
          acquisitionsByUser.set(acquisition.userId, acquisition);
        }
      }

      const customerOrganizationUsers = organizationUsers.filter(
        (item) =>
          !item.isDeleted &&
          item.organizationUserTypeId === CUSTOMER_USER_TYPE_ID,
      );

      const existingRows: CustomerRow[] = [];
      const prospectRows: ProspectRow[] = [];

      for (const organizationUser of customerOrganizationUsers) {
        const user = userMap.get(organizationUser.userId);

        if (!user) {
          continue;
        }

        const userSubscriptions =
          subscriptionsByOrganizationUser.get(organizationUser.id) ?? [];

        const acquisition = acquisitionsByUser.get(user.id);
        const store = acquisition?.sourceStoreId
          ? storeMap.get(acquisition.sourceStoreId)
          : undefined;

        if (userSubscriptions.length > 0) {
          existingRows.push({
            organizationUser,
            user,
            subscriptions: userSubscriptions,
            membershipName: getMembershipDisplay(userSubscriptions).planName,
            membershipProductName:
              getMembershipDisplay(userSubscriptions).productName,
          });
        } else {
          prospectRows.push({
            organizationUser,
            user,
            acquisition,
            store,
            membershipName: undefined,
          });
        }
      }

      setRows(existingRows);
      setProspects(prospectRows);
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          "Unable to load customers",
          error instanceof Error ? error.message : "Unable to load customers.",
        );
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [organization.id]);

  useEffect(() => {
    mountedRef.current = true;
    void loadCustomers();

    return () => {
      mountedRef.current = false;
    };
  }, [loadCustomers]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return rows;
    }

    return rows.filter(({ user }) => {
      const name = getDisplayName(user).toLowerCase();
      const email = user.primaryEmail?.toLowerCase() ?? "";
      const phone = getPhoneDisplay(user).toLowerCase();

      return (
        name.includes(query) || email.includes(query) || phone.includes(query)
      );
    });
  }, [rows, search]);

  const displayedProspects = useMemo<ProspectRow[]>(() => {
    const workingProspects = prospects.map((prospect) => {
      const edit = prospectEdits[prospect.organizationUser.userId];

      if (!edit) {
        return prospect;
      }

      const editedUser: User = {
        ...prospect.user,
        firstName: edit.user.firstName,
        middleName: edit.user.middleName,
        lastName: edit.user.lastName,
        displayName: edit.user.displayName,
        primaryEmail: edit.user.primaryEmail,
        primaryPhone: { ...edit.user.primaryPhone },
        updatedAt: new Date().toISOString(),
        updatedBy: edit.user.createdBy,
      };

      return {
        ...prospect,
        user: editedUser,
      };
    });

    const pendingRows: ProspectRow[] = pendingProspects.map((pending) => {
      const now = new Date().toISOString();
      const temporaryUserId = `pending-user-${pending.draftId}`;
      const temporaryOrganizationUserId = `pending-org-user-${pending.draftId}`;

      const user: User = {
        id: temporaryUserId,
        userCode: "",
        firstName: pending.user.firstName,
        middleName: pending.user.middleName,
        lastName: pending.user.lastName,
        displayName: pending.user.displayName,
        primaryEmail: pending.user.primaryEmail,
        primaryPhone: pending.user.primaryPhone,
        preferredLanguageId: pending.user.preferredLanguageId,
        userStatusId: pending.user.userStatusId,
        createdAt: now,
        createdBy: pending.user.createdBy,
        updatedAt: now,
        updatedBy: pending.user.createdBy,
        isDeleted: false,
        versionNo: 1,
      };

      const organizationUser: OrganizationUser = {
        id: temporaryOrganizationUserId,
        organizationId: organization.id,
        userId: temporaryUserId,
        organizationUserTypeId: CUSTOMER_USER_TYPE_ID,
        organizationUserStatusId: ACTIVE_ORGANIZATION_USER_STATUS_ID,
        joiningDate: now,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
        isDeleted: false,
        versionNo: 1,
      };

      const acquisition: UserAcquisition = {
        id: `pending-acquisition-${pending.draftId}`,
        userId: temporaryUserId,
        organizationId: organization.id,
        registrationSource: "ORG_ADMIN",
        registrationChannel: "ADMIN_UI",
        sourceStoreId: pending.sourceStoreId,
        createdAt: now,
        createdBy: SYSTEM_USER_ID,
        updatedAt: now,
        updatedBy: SYSTEM_USER_ID,
        isDeleted: false,
        versionNo: 1,
      };

      return {
        organizationUser,
        user,
        acquisition,
        store: pending.sourceStoreId
          ? stores.find((store) => store.id === pending.sourceStoreId)
          : undefined,
      };
    });

    return [...workingProspects, ...pendingRows];
  }, [organization.id, pendingProspects, prospectEdits, prospects, stores]);

  const filteredDisplayedProspects = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return displayedProspects;
    }

    return displayedProspects.filter(({ user }) => {
      const name = getDisplayName(user).toLowerCase();
      const email = user.primaryEmail?.toLowerCase() ?? "";
      const phone = getPhoneDisplay(user).toLowerCase();

      return (
        name.includes(query) || email.includes(query) || phone.includes(query)
      );
    });
  }, [displayedProspects, search]);

  const getRelationshipStatus = useCallback(
    (row: { organizationUser: OrganizationUser }): string => {
      const status = row.organizationUser.organizationUserStatusId;

      switch (status) {
        case "organization-user-status-active":
        case "status-active":
          return "Active";
        case "organization-user-status-inactive":
        case "status-inactive":
          return "Inactive";
        case "organization-user-status-suspended":
        case "status-suspended":
          return "Suspended";
        default:
          return formatStatusId(status);
      }
    },
    [],
  );

  /*
   * Keep the same columns for Existing Customers, Prospective Customers,
   * and Counter Customers.
   */
  const customerColumns = useMemo<DataTableColumn<CustomerRow>[]>(
    () => [
      {
        key: "name",
        title: "Customer",
        width: 240,
        render: (item) => (
          <View style={styles.customerCell}>
            <Text variant="bodyStrong" color="text">
              {getDisplayName(item.user)}
            </Text>
            <Text variant="caption" color="textMuted">
              {`Joined ${new Date(
                item.organizationUser.joiningDate,
              ).toLocaleDateString()}`}
            </Text>
          </View>
        ),
      },
      {
        key: "email",
        title: "Email",
        width: 240,
        render: (item) => (
          <Text variant="body" color="text">
            {item.user.primaryEmail ?? "—"}
          </Text>
        ),
      },
      {
        key: "phone",
        title: "Phone",
        width: 180,
        render: (item) => (
          <Text variant="body" color="text">
            {getPhoneDisplay(item.user) || "—"}
          </Text>
        ),
      },
      {
        key: "status",
        title: "Status",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {getRelationshipStatus(item)}
          </Text>
        ),
      },
      {
        key: "membership",
        title: "Membership",
        width: 220,
        render: (item) => (
          <View style={styles.primaryCell}>
            <Text variant="body" color="text">
              {item.membershipName ?? "No membership"}
            </Text>
            {item.membershipProductName ? (
              <Text variant="caption" color="textMuted">
                {item.membershipProductName}
              </Text>
            ) : null}
          </View>
        ),
      },
    ],
    [getRelationshipStatus],
  );

  const prospectColumns = useMemo<DataTableColumn<ProspectRow>[]>(
    () => [
      {
        key: "name",
        title: "Customer",
        width: 240,
        render: (item) => (
          <View style={styles.customerCell}>
            <Text variant="bodyStrong" color="text">
              {getDisplayName(item.user)}
            </Text>
            <Text variant="caption" color="textMuted">
              Prospective customer
            </Text>
          </View>
        ),
      },
      {
        key: "email",
        title: "Email",
        width: 240,
        render: (item) => (
          <Text variant="body" color="text">
            {item.user.primaryEmail ?? "—"}
          </Text>
        ),
      },
      {
        key: "phone",
        title: "Phone",
        width: 180,
        render: (item) => (
          <Text variant="body" color="text">
            {getPhoneDisplay(item.user) || "—"}
          </Text>
        ),
      },
      {
        key: "status",
        title: "Status",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {getRelationshipStatus(item)}
          </Text>
        ),
      },
      {
        key: "membership",
        title: "Membership",
        width: 220,
        render: (item) => (
          <View style={styles.primaryCell}>
            <Text variant="body" color="text">
              {item.membershipName ?? "No membership"}
            </Text>
            {item.membershipProductName ? (
              <Text variant="caption" color="textMuted">
                {item.membershipProductName}
              </Text>
            ) : null}
          </View>
        ),
      },
    ],
    [getRelationshipStatus],
  );

  const handleCustomerFormSave = useCallback(
    async (result: {
      user: CreateUserInput;
      userId?: ID;
      sourceStoreId?: string;
    }): Promise<void> => {
      if (result.userId && editingProspectiveCustomer) {
        const pendingDraftId = result.userId.startsWith("pending-user-")
          ? result.userId.slice("pending-user-".length)
          : undefined;

        if (pendingDraftId) {
          setPendingProspects((current) =>
            current.map((pending) =>
              pending.draftId === pendingDraftId
                ? {
                    ...pending,
                    user: {
                      ...result.user,
                      userStatusId: pending.user.userStatusId,
                      createdBy: pending.user.createdBy,
                    },
                  }
                : pending,
            ),
          );
        } else {
          setProspectEdits((current) => ({
            ...current,
            [result.userId as ID]: {
              draftId: result.userId as ID,
              user: {
                ...result.user,
                userStatusId: editingProspectiveCustomer.user.userStatusId,
                createdBy: editingProspectiveCustomer.user.createdBy,
              },
              sourceStoreId:
                editingProspectiveCustomer.acquisition?.sourceStoreId,
            },
          }));
        }

        setEditingProspectiveCustomer(null);
        setShowCustomerForm(false);
        setSaveMessage("");
        return;
      }

      setPendingProspects((current) => [
        ...current,
        {
          ...clonePendingProspect({
            draftId: `pending-${Date.now().toString(36)}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            user: result.user,
            sourceStoreId: result.sourceStoreId,
          }),
        },
      ]);

      setShowCustomerForm(false);
      setSaveMessage("");
    },
    [editingProspectiveCustomer],
  );

  const handleSaveChanges = useCallback(async () => {
    if (saving) {
      return;
    }

    if (
      pendingProspects.length === 0 &&
      Object.keys(prospectEdits).length === 0
    ) {
      setIsEditing(false);
      setSaveMessage("Changes saved successfully.");
      return;
    }

    setSaving(true);
    setSaveMessage("");

    try {
      for (const [userId, edit] of Object.entries(prospectEdits)) {
        const existingUser = await services.organization.getUser(userId);

        if (!existingUser || existingUser.isDeleted) {
          continue;
        }

        const updatedUser: User = {
          ...existingUser,
          firstName: edit.user.firstName.trim(),
          middleName: edit.user.middleName?.trim() || undefined,
          lastName: edit.user.lastName.trim(),
          displayName:
            edit.user.displayName?.trim() ||
            `${edit.user.firstName.trim()} ${edit.user.lastName.trim()}`,
          primaryEmail:
            edit.user.primaryEmail?.trim().toLowerCase() || undefined,
          primaryPhone: {
            ...edit.user.primaryPhone,
            number: edit.user.primaryPhone.number.replace(/\D/g, ""),
          },
          updatedAt: new Date().toISOString(),
          updatedBy: SYSTEM_USER_ID,
        };

        await services.organization.updateUser(updatedUser);
      }

      for (const pending of pendingProspects) {
        const email = pending.user.primaryEmail?.trim().toLowerCase();
        const phone = pending.user.primaryPhone.number.replace(/\D/g, "");

        let matches: User[] = [];

        if (email) {
          matches = await services.organization.findUsers({ email });
        }

        if (matches.length === 0 && phone) {
          matches = await services.organization.findUsers({ phone });
        }

        const existingUser = matches.find((user) => !user.isDeleted);

        const user =
          existingUser ??
          (await services.organization.createUser({
            ...pending.user,
            firstName: pending.user.firstName.trim(),
            lastName: pending.user.lastName.trim(),
            middleName: pending.user.middleName?.trim() || undefined,
            displayName: pending.user.displayName?.trim() || undefined,
            primaryEmail: pending.user.primaryEmail?.trim() || undefined,
            primaryPhone: {
              ...pending.user.primaryPhone,
              number: phone,
            },
          }));

        const organizationUsers =
          await services.organization.listOrganizationUsers(organization.id);

        const existingOrganizationUser = organizationUsers.find(
          (item) =>
            !item.isDeleted &&
            item.userId === user.id &&
            item.organizationUserTypeId === CUSTOMER_USER_TYPE_ID,
        );

        if (!existingOrganizationUser) {
          const now = new Date().toISOString();

          await services.organization.createOrganizationUser(organization.id, {
            id: `org-user-${Date.now().toString(36)}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            organizationId: organization.id,
            userId: user.id,
            organizationUserTypeId: CUSTOMER_USER_TYPE_ID,
            organizationUserStatusId: ACTIVE_ORGANIZATION_USER_STATUS_ID,
            joiningDate: now,
            createdAt: now,
            createdBy: SYSTEM_USER_ID,
            updatedAt: now,
            updatedBy: SYSTEM_USER_ID,
            isDeleted: false,
            versionNo: 1,
          });
        }

        const acquisitions = await services.userAcquisition.listByOrganization(
          organization.id,
        );

        const alreadyAcquired = acquisitions.some(
          (item) => !item.isDeleted && item.userId === user.id,
        );

        if (!alreadyAcquired) {
          const now = new Date().toISOString();

          await services.userAcquisition.createAcquisition({
            id: `user-acq-${Date.now().toString(36)}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            userId: user.id,
            organizationId: organization.id,
            registrationSource: "ORG_ADMIN",
            registrationChannel: "ADMIN_UI",
            sourceStoreId: pending.sourceStoreId,
            createdAt: now,
            createdBy: SYSTEM_USER_ID,
            updatedAt: now,
            updatedBy: SYSTEM_USER_ID,
            isDeleted: false,
            versionNo: 1,
          });
        }
      }

      await loadCustomers();

      setPendingProspects([]);
      setProspectEdits({});
      setEditingProspectiveCustomer(null);
      setIsEditing(false);
      setShowCustomerForm(false);
      setSaveMessage("Changes saved successfully.");
    } catch (error) {
      Alert.alert(
        "Unable to save customer changes",
        error instanceof Error
          ? error.message
          : "Unable to save customer changes.",
      );
    } finally {
      setSaving(false);
    }
  }, [loadCustomers, organization.id, pendingProspects, prospectEdits, saving]);

  const handleCancelChanges = useCallback(() => {
    if (saving) {
      return;
    }

    const hasWorkingChanges =
      pendingProspects.length > 0 || Object.keys(prospectEdits).length > 0;

    if (hasWorkingChanges) {
      Alert.alert(
        "Discard Changes?",
        "Any prospective customer additions or edits made during this edit session will be discarded.",
        [
          {
            text: "Keep Editing",
            style: "cancel",
          },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              setPendingProspects([]);
              setProspectEdits({});
              setEditingProspectiveCustomer(null);
              setIsEditing(false);
              setShowCustomerForm(false);
              setSaveMessage("");
            },
          },
        ],
      );

      return;
    }

    setIsEditing(false);
    setEditingProspectiveCustomer(null);
    setShowCustomerForm(false);
    setSaveMessage("");
  }, [pendingProspects.length, prospectEdits, saving]);

  const viewExistingCustomer = useCallback((item: CustomerRow) => {
    setSelectedCustomer({
      user: item.user,
      type: "EXISTING",
      organizationUser: item.organizationUser,
      subscriptions: item.subscriptions,
    });
  }, []);

  const viewProspectiveCustomer = useCallback((item: ProspectRow) => {
    setSelectedCustomer({
      user: item.user,
      type: "PROSPECTIVE",
      organizationUser: item.organizationUser,
      subscriptions: [],
      acquisition: item.acquisition,
      store: item.store,
    });
  }, []);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="title" color="text">
              Customers
            </Text>
            <Text variant="bodySmall" color="textMuted">
              Manage customers and prospective customers associated with your
              organization.
            </Text>
          </View>

          <View style={styles.headerActions}>
            {!isEditing ? (
              <Pressable
                onPress={() => {
                  setIsEditing(true);
                  setSaveMessage("");
                }}
                disabled={saving}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { opacity: saving ? 0.5 : pressed ? 0.8 : 1 },
                ]}
              >
                <Text variant="body" color="text">
                  Edit
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={handleCancelChanges}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { opacity: saving ? 0.5 : pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text variant="body" color="text">
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => void handleSaveChanges()}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { opacity: saving ? 0.5 : pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text variant="body" color="background">
                    {saving ? "Saving..." : "Save Changes"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setEditingProspectiveCustomer(null);
                    setShowCustomerForm(true);
                    setSaveMessage("");
                  }}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.addButton,
                    { opacity: saving ? 0.5 : pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text variant="body" color="background">
                    + Add Customer
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {saveMessage ? (
          <View style={styles.successBox}>
            <Text variant="body" color="text">
              {saveMessage}
            </Text>
          </View>
        ) : null}

        {pendingProspects.length > 0 ||
        Object.keys(prospectEdits).length > 0 ? (
          <View style={styles.pendingBox}>
            <Text variant="bodyStrong" color="text">
              Unsaved Customer Changes
            </Text>
            <Text variant="bodySmall" color="textMuted">
              {`${pendingProspects.length} new prospective customer${
                pendingProspects.length === 1 ? "" : "s"
              } and ${Object.keys(prospectEdits).length} prospective customer${
                Object.keys(prospectEdits).length === 1 ? "" : "s"
              } edited. Select Save Changes to persist them.`}
            </Text>
          </View>
        ) : null}

        <View style={styles.searchContainer}>
          <Text variant="label" color="textSecondary">
            Search Customers
          </Text>
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, email or phone"
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <Text variant="body" color="textMuted">
              Loading customers...
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <Text variant="h2" color="text">
                    Existing Customers
                  </Text>
                  <Text variant="bodySmall" color="textMuted">
                    Customers with membership purchase or membership history.
                  </Text>
                </View>

                <View style={styles.countBadge}>
                  <Text variant="label" color="primary">
                    {filteredRows.length}
                  </Text>
                </View>
              </View>

              <DataTable
                columns={customerColumns}
                data={filteredRows}
                keyExtractor={(item) => item.organizationUser.id}
                emptyMessage={
                  search.trim()
                    ? "No existing customers match your search."
                    : "No existing customers associated with this organization."
                }
                actions={[
                  {
                    label: "View",
                    onPress: viewExistingCustomer,
                  },
                ]}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <Text variant="h2" color="text">
                    Prospective Customers
                  </Text>
                  <Text variant="bodySmall" color="textMuted">
                    Customers associated with the organization who have not
                    purchased a membership yet.
                  </Text>
                </View>

                <View style={styles.countBadge}>
                  <Text variant="label" color="primary">
                    {filteredDisplayedProspects.length}
                  </Text>
                </View>
              </View>

              <DataTable
                columns={prospectColumns}
                data={filteredDisplayedProspects}
                keyExtractor={(item) => item.organizationUser.id}
                emptyMessage={
                  search.trim()
                    ? "No prospective customers match your search."
                    : "No prospective customers found."
                }
                actions={
                  isEditing
                    ? [
                        {
                          label: "Edit",
                          onPress: (item) => {
                            setEditingProspectiveCustomer(item);
                            setShowCustomerForm(true);
                            setSaveMessage("");
                          },
                        },
                        {
                          label: "View",
                          onPress: viewProspectiveCustomer,
                        },
                      ]
                    : [
                        {
                          label: "View",
                          onPress: viewProspectiveCustomer,
                        },
                      ]
                }
              />
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={showCustomerForm}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!saving) {
            setShowCustomerForm(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.formModal}>
            <View style={styles.modalHeader}>
              <View style={styles.headerText}>
                <Text variant="h2" color="text">
                  {editingProspectiveCustomer
                    ? "Edit Prospective Customer"
                    : "Add Prospective Customer"}
                </Text>
                <Text variant="bodySmall" color="textMuted">
                  {editingProspectiveCustomer
                    ? "Changes will be applied when you select Save Changes."
                    : "The customer will be added when you select Save Changes."}
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  setEditingProspectiveCustomer(null);
                  setShowCustomerForm(false);
                }}
                disabled={saving}
                style={styles.closeButton}
              >
                <Text variant="body" color="textMuted">
                  ✕
                </Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <CustomerForm
                organizationId={organization.id}
                stores={stores}
                countries={countries}
                userStatuses={userStatuses}
                activeUserStatusId={ACTIVE_USER_STATUS_ID}
                mode={editingProspectiveCustomer ? "edit" : "add"}
                initialUser={editingProspectiveCustomer?.user}
                initialSourceStoreId={
                  editingProspectiveCustomer?.acquisition?.sourceStoreId
                }
                onSave={handleCustomerFormSave}
                onCancel={() => {
                  setEditingProspectiveCustomer(null);
                  setShowCustomerForm(false);
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedCustomer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedCustomer(null)}
      >
        {selectedCustomer ? (
          <View style={styles.modalOverlay}>
            <View style={styles.viewModal}>
              <View style={styles.modalHeader}>
                <View style={styles.headerText}>
                  <View style={styles.customerTitleRow}>
                    <Text variant="h2" color="text">
                      {getDisplayName(selectedCustomer.user)}
                    </Text>

                    <View
                      style={[
                        styles.typeBadge,
                        selectedCustomer.type === "EXISTING"
                          ? styles.existingBadge
                          : styles.prospectBadge,
                      ]}
                    >
                      <Text variant="caption" color="text">
                        {selectedCustomer.type === "EXISTING"
                          ? "Existing Customer"
                          : "Prospective Customer"}
                      </Text>
                    </View>
                  </View>

                  <Text variant="bodySmall" color="textMuted">
                    Customer details
                  </Text>
                </View>

                <Pressable
                  onPress={() => setSelectedCustomer(null)}
                  style={styles.closeButton}
                >
                  <Text variant="body" color="textMuted">
                    ✕
                  </Text>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailsGrid}>
                  <DetailItem
                    label="First Name"
                    value={selectedCustomer.user.firstName}
                  />
                  <DetailItem
                    label="Middle Name"
                    value={selectedCustomer.user.middleName ?? "—"}
                  />
                  <DetailItem
                    label="Last Name"
                    value={selectedCustomer.user.lastName}
                  />
                  <DetailItem
                    label="Display Name"
                    value={getDisplayName(selectedCustomer.user)}
                  />
                  <DetailItem
                    label="Email"
                    value={selectedCustomer.user.primaryEmail ?? "—"}
                  />
                  <DetailItem
                    label="Phone"
                    value={getPhoneDisplay(selectedCustomer.user) || "—"}
                  />
                  <DetailItem
                    label="User Status"
                    value={formatStatusId(selectedCustomer.user.userStatusId)}
                  />
                </View>

                <View style={styles.infoCard}>
                  <Text variant="bodyStrong" color="text">
                    Organization Customer Relationship
                  </Text>

                  <DetailItem
                    label="Status"
                    value={getRelationshipStatus(selectedCustomer)}
                  />

                  <DetailItem
                    label="Joined"
                    value={
                      selectedCustomer.organizationUser.joiningDate
                        ? new Date(
                            selectedCustomer.organizationUser.joiningDate,
                          ).toLocaleDateString()
                        : "—"
                    }
                  />

                  <DetailItem
                    label="Organization User ID"
                    value={selectedCustomer.organizationUser.id}
                  />
                </View>

                {selectedCustomer.type === "EXISTING" ? (
                  <View style={styles.infoCard}>
                    <Text variant="bodyStrong" color="text">
                      Membership History
                    </Text>

                    <DetailItem
                      label="Subscriptions"
                      value={String(selectedCustomer.subscriptions.length)}
                    />

                    <Text variant="bodySmall" color="textMuted">
                      This person is an existing customer because membership
                      purchase history exists for this organization.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.infoCard}>
                    <Text variant="bodyStrong" color="text">
                      Prospective Customer
                    </Text>

                    <DetailItem
                      label="Registration Source"
                      value={
                        selectedCustomer.acquisition?.registrationSource ?? "—"
                      }
                    />

                    <DetailItem
                      label="Registration Channel"
                      value={
                        selectedCustomer.acquisition?.registrationChannel ?? "—"
                      }
                    />

                    <DetailItem
                      label="Source Store"
                      value={selectedCustomer.store?.name ?? "—"}
                    />

                    <Text variant="bodySmall" color="textMuted">
                      This person is a Customer User for the organization but
                      has not purchased a membership yet.
                    </Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setSelectedCustomer(null)}
                    style={styles.secondaryButton}
                  >
                    <Text variant="body" color="text">
                      Close
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

function formatStatusId(statusId: string | undefined): string {
  if (!statusId) {
    return "Unknown";
  }

  const known: Record<string, string> = {
    "status-active": "Active",
    "status-inactive": "Inactive",
    "status-suspended": "Suspended",
    "user-status-active": "Active",
    "user-status-inactive": "Inactive",
    "user-status-suspended": "Suspended",
    "organization-user-status-active": "Active",
    "organization-user-status-inactive": "Inactive",
    "organization-user-status-suspended": "Suspended",
  };

  if (known[statusId]) {
    return known[statusId];
  }

  return statusId
    .replace(/^(user-status|organization-user-status|status)-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="body" color="text">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  screen: {
    padding: 24,
    gap: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  addButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },
  successBox: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
  },
  pendingBox: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
    gap: 4,
  },
  searchContainer: {
    gap: 8,
    maxWidth: 500,
  },
  section: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 4,
  },
  countBadge: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#CCFBF1",
  },
  customerCell: {
    gap: 2,
  },
  primaryCell: {
    gap: 2,
  },
  center: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  formModal: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    gap: 24,
  },
  viewModal: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "90%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    gap: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  customerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  existingBadge: {
    backgroundColor: "#DCFCE7",
  },
  prospectBadge: {
    backgroundColor: "#FEF3C7",
  },
  detailsGrid: {
    gap: 16,
  },
  detailItem: {
    gap: 3,
  },
  infoCard: {
    gap: 14,
    padding: 18,
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
  },
});
