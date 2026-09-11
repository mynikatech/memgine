import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  MembershipProduct,
  Offer,
  OfferUsageRule,
  Status,
  Store,
} from "@/src/core";

import { OfferCtaType, services } from "@/src/core";

import { useBusiness } from "@/src/providers";
import { DataTable, DataTableColumn, Modal, Text } from "@/src/ui";

import { OfferForm } from "@/src/ui/admin/OfferForm";
import { useRouter } from "expo-router";
import { APP_ROUTES } from "@/src/constants/navigation";

export default function OrgAdminOffers() {
  const { organization } = useBusiness();

  const [committedOffers, setCommittedOffers] = useState<Offer[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);

  const [committedUsageRules, setCommittedUsageRules] = useState<
    OfferUsageRule[]
  >([]);
  const [usageRules, setUsageRules] = useState<OfferUsageRule[]>([]);

  const [products, setProducts] = useState<MembershipProduct[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [offerStatuses, setOfferStatuses] = useState<Status[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saveMessageVisible, setSaveMessageVisible] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [viewingOffer, setViewingOffer] = useState(false);

  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [offerList, productList, storeList, statusList] =
          await Promise.all([
            services.offer.listByOrganization(organization.id),
            services.membershipProduct.listProducts(organization.id),
            services.organization.listStores(organization.id),
            services.status.listOfferStatuses(),
          ]);

        if (!mounted) {
          return;
        }

        const activeOffers = offerList.filter((item) => !item.isDeleted);

        const offerIds = activeOffers.map((item) => item.id);

        const ruleList =
          offerIds.length > 0
            ? await services.offerUsageRule.listByOffers(offerIds)
            : [];

        if (!mounted) {
          return;
        }

        setCommittedOffers(activeOffers);
        setOffers(activeOffers);

        setCommittedUsageRules(ruleList.filter((item) => !item.isDeleted));

        setUsageRules(ruleList.filter((item) => !item.isDeleted));

        setProducts(productList);
        setStores(storeList);
        setOfferStatuses(statusList);

        setIsEditing(false);
        setSaveMessageVisible(false);
        setFormVisible(false);
        setEditingOffer(null);
        setViewingOffer(false);
      } catch (error) {
        if (!mounted) {
          return;
        }

        Alert.alert(
          "Unable to load offers",
          error instanceof Error ? error.message : "Unable to load offers.",
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  const hasChanges = useMemo(
    () =>
      JSON.stringify(offers) !== JSON.stringify(committedOffers) ||
      JSON.stringify(usageRules) !== JSON.stringify(committedUsageRules),
    [offers, committedOffers, usageRules, committedUsageRules],
  );

  const getProductName = (productId?: string) => {
    if (!productId) {
      return "All products";
    }

    const product = products.find((item) => item.id === productId);

    return product?.displayName ?? product?.membershipProductName ?? "Unknown";
  };

  const getStoreName = (storeId?: string) => {
    if (!storeId) {
      return "All stores";
    }

    return stores.find((store) => store.id === storeId)?.name ?? "Unknown";
  };

  const getStatusName = (statusId: string) =>
    offerStatuses.find((item) => item.id === statusId)?.statusName ?? "Unknown";

  const columns = useMemo<DataTableColumn<Offer>[]>(
    () => [
      {
        key: "offerCode",
        title: "Offer Code",
        width: 190,
      },
      {
        key: "offerName",
        title: "Offer Name",
        width: 230,
      },
      {
        key: "membershipProductId",
        title: "Membership Product",
        width: 220,
        render: (item) => (
          <Text variant="body" color="text">
            {getProductName(item.membershipProductId)}
          </Text>
        ),
      },
      {
        key: "storeId",
        title: "Store",
        width: 200,
        render: (item) => (
          <Text variant="body" color="text">
            {getStoreName(item.storeId)}
          </Text>
        ),
      },
      {
        key: "discountPercentage",
        title: "Discount",
        width: 110,
        render: (item) => (
          <Text variant="body" color="text">
            {item.discountPercentage !== undefined
              ? `${item.discountPercentage}%`
              : "—"}
          </Text>
        ),
      },
      {
        key: "statusId",
        title: "Status",
        width: 120,
        render: (item) => (
          <Text variant="body" color="text">
            {getStatusName(item.statusId)}
          </Text>
        ),
      },
      {
        key: "effectiveDate",
        title: "Effective",
        width: 130,
      },
      {
        key: "expiryDate",
        title: "Expiry",
        width: 130,
        render: (item) => (
          <Text variant="body" color="text">
            {item.expiryDate ?? "—"}
          </Text>
        ),
      },
    ],
    [products, stores, offerStatuses],
  );

  const generateOfferCode = (): string => {
    const prefix = `${organization.code}-OFFER`;

    const usedCodes = new Set(
      offers
        .map((offer) => offer.offerCode.trim().toUpperCase())
        .filter(Boolean),
    );

    let sequence = 1;

    while (usedCodes.has(`${prefix}-${String(sequence).padStart(3, "0")}`)) {
      sequence += 1;
    }

    return `${prefix}-${String(sequence).padStart(3, "0")}`;
  };

  const createEmptyOffer = (): Offer => {
    const now = new Date().toISOString();

    const offerCode = generateOfferCode();

    const activeStatus =
      offerStatuses.find(
        (item) =>
          item.statusCode?.trim().toUpperCase() === "ACTIVE" ||
          item.statusName?.trim().toLowerCase() === "active",
      ) ??
      offerStatuses.find((item) => item.id === "offer-status-active") ??
      offerStatuses[0];

    return {
      id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,

      organizationId: organization.id,

      offerCode,
      offerName: "",
      description: undefined,

      promotionImageUrl: "",

      badgeText: undefined,

      availabilityText: undefined,

      membershipProductId: undefined,

      storeId: undefined,

      discountPercentage: undefined,

      effectiveDate: now.substring(0, 10),

      expiryDate: undefined,

      ctaLabel: "",

      ctaType: OfferCtaType.REDEEM_OFFER,

      ctaTarget: undefined,

      statusId: activeStatus?.id ?? "",

      createdAt: now,

      createdBy: "user-system",

      updatedAt: now,

      updatedBy: "user-system",

      isDeleted: false,

      versionNo: 1,
    };
  };

  const handleAdd = () => {
    if (!isEditing || saving) {
      return;
    }

    setViewingOffer(false);

    setEditingOffer(createEmptyOffer());

    setFormVisible(true);
  };

  const handleEdit = (offer: Offer) => {
    if (!isEditing || saving) {
      return;
    }

    setViewingOffer(false);

    setEditingOffer({
      ...offer,
    });

    setFormVisible(true);
  };

  const handleView = (offer: Offer) => {
    if (isEditing || saving) {
      return;
    }

    setViewingOffer(true);

    setEditingOffer({
      ...offer,
    });

    setFormVisible(true);
  };

  const handleSaveDraft = async (
    updatedOffer: Offer,
    updatedRules: OfferUsageRule[],
  ) => {
    setOffers((current) => {
      const exists = current.some((item) => item.id === updatedOffer.id);

      if (exists) {
        return current.map((item) =>
          item.id === updatedOffer.id ? updatedOffer : item,
        );
      }

      return [...current, updatedOffer];
    });

    setUsageRules((current) => {
      const otherRules = current.filter(
        (rule) => rule.offerId !== updatedOffer.id,
      );

      return [...otherRules, ...updatedRules];
    });

    setFormVisible(false);
    setEditingOffer(null);
    setViewingOffer(false);
  };

  const handleDelete = (offer: Offer) => {
    if (!isEditing || saving) {
      return;
    }

    Alert.alert(
      "Delete Offer",
      `Delete "${
        offer.offerName || offer.offerCode
      }"? The offer will be removed when you save the changes.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setOffers((current) =>
              current.filter((item) => item.id !== offer.id),
            );

            setUsageRules((current) =>
              current.filter((rule) => rule.offerId !== offer.id),
            );
          },
        },
      ],
    );
  };

  const handleSaveChanges = async () => {
    if (!hasChanges || saving) {
      return;
    }

    setSaving(true);

    try {
      const committedById = new Map(
        committedOffers.map((offer) => [offer.id, offer]),
      );

      const workingById = new Map(offers.map((offer) => [offer.id, offer]));

      /*
       * ------------------------------------------------------------
       * Persist Offers
       * ------------------------------------------------------------
       */

      for (const offer of offers) {
        const existing = committedById.get(offer.id);

        if (!existing) {
          await services.offer.createOffer(organization.id, offer);
          continue;
        }

        if (JSON.stringify(existing) !== JSON.stringify(offer)) {
          await services.offer.updateOffer(organization.id, offer);
        }
      }

      for (const committed of committedOffers) {
        if (!workingById.has(committed.id)) {
          await services.offer.updateOffer(organization.id, {
            ...committed,
            isDeleted: true,
            updatedAt: new Date().toISOString(),
            updatedBy: "user-system",
          });
        }
      }

      /*
       * ------------------------------------------------------------
       * Persist Offer Usage Rules
       * ------------------------------------------------------------
       *
       * These are deliberately persisted through the independent
       * Offer Usage Rule service. They are NOT embedded in Offer.
       */

      const committedRulesById = new Map(
        committedUsageRules.map((rule) => [rule.id, rule]),
      );

      const workingRulesById = new Map(
        usageRules.map((rule) => [rule.id, rule]),
      );

      for (const rule of usageRules) {
        const existing = committedRulesById.get(rule.id);

        if (!existing) {
          await services.offerUsageRule.createRule(rule);
          continue;
        }

        if (JSON.stringify(existing) !== JSON.stringify(rule)) {
          await services.offerUsageRule.updateRule(rule);
        }
      }

      for (const committedRule of committedUsageRules) {
        if (!workingRulesById.has(committedRule.id)) {
          await services.offerUsageRule.deleteRule(committedRule.id);
        }
      }

      /*
       * ------------------------------------------------------------
       * Reload persisted state
       * ------------------------------------------------------------
       */

      const persistedOffers = await services.offer.listByOrganization(
        organization.id,
      );

      const activePersistedOffers = persistedOffers.filter(
        (item) => !item.isDeleted,
      );

      const persistedOfferIds = activePersistedOffers.map((offer) => offer.id);

      const persistedRules = persistedOfferIds.length
        ? await services.offerUsageRule.listByOffers(persistedOfferIds)
        : [];

      const activePersistedRules = persistedRules.filter(
        (rule) => !rule.isDeleted,
      );

      setCommittedOffers(activePersistedOffers);

      setOffers(activePersistedOffers);

      setCommittedUsageRules(activePersistedRules);

      setUsageRules(activePersistedRules);

      setIsEditing(false);
      setFormVisible(false);
      setEditingOffer(null);
      setViewingOffer(false);
      setSaveMessageVisible(true);

      setTimeout(() => {
        setSaveMessageVisible(false);
      }, 4000);
    } catch (error) {
      Alert.alert(
        "Unable to save changes",
        error instanceof Error
          ? error.message
          : "Unable to save offer changes.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEditing = () => {
    if (saving) {
      return;
    }

    setOffers(committedOffers);

    setUsageRules(committedUsageRules);

    setIsEditing(false);
    setFormVisible(false);
    setEditingOffer(null);
    setViewingOffer(false);
  };

  const handleStartEditing = () => {
    if (saving) {
      return;
    }

    setSaveMessageVisible(false);
    setIsEditing(true);
  };

  const editingOfferRules = editingOffer
    ? usageRules.filter((rule) => rule.offerId === editingOffer.id)
    : [];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.screen}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title" color="text">
            Offers
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Manage promotional offers, targeting, discounts and validity.
          </Text>
        </View>

        {!isEditing ? (
          <Pressable
            onPress={handleStartEditing}
            disabled={saving}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                opacity: saving ? 0.5 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text variant="body" color="text">
              Edit
            </Text>
          </Pressable>
        ) : (
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleCancelEditing}
              disabled={saving}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="text">
                Cancel
              </Text>
            </Pressable>

            <Pressable
              onPress={handleSaveChanges}
              disabled={saving || !hasChanges}
              style={({ pressed }) => [
                styles.addButton,
                {
                  opacity: saving || !hasChanges ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="background">
                {saving ? "Saving..." : "Save Changes"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                router.push(
                  APP_ROUTES.orgAdmin.customerExperienceSection(
                    "offers",
                  ) as never,
                )
              }
              disabled={saving}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="text">
                Preview
              </Text>
            </Pressable>

            <Pressable
              onPress={handleAdd}
              disabled={saving}
              style={({ pressed }) => [
                styles.addButton,
                {
                  opacity: saving ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text variant="body" color="background">
                + Add Offer
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {saveMessageVisible ? (
        <View style={styles.successMessage}>
          <Text variant="bodySmall" color="text">
            Changes saved successfully
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <Text variant="body" color="textMuted">
            Loading offers...
          </Text>
        </View>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={offers.filter((item) => !item.isDeleted)}
            keyExtractor={(item) => item.id}
            emptyMessage="No offers configured."
            actions={
              isEditing
                ? [
                    {
                      label: "Edit",
                      onPress: handleEdit,
                    },
                    {
                      label: "Delete",
                      onPress: handleDelete,
                    },
                  ]
                : [
                    {
                      label: "View",
                      onPress: handleView,
                    },
                  ]
            }
          />

          <Pressable
            onPress={() =>
              router.push(
                APP_ROUTES.orgAdmin.customerExperienceSection(
                  "offers",
                ) as never,
              )
            }
            style={({ pressed }) => [
              styles.previewLink,
              {
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Text variant="body" color="primary">
              Preview
            </Text>
          </Pressable>
        </>
      )}

      <Modal
        visible={formVisible}
        onClose={() => {
          setFormVisible(false);
          setEditingOffer(null);
          setViewingOffer(false);
        }}
        title={
          viewingOffer
            ? "View Offer"
            : editingOffer &&
                committedOffers.some((item) => item.id === editingOffer.id)
              ? "Edit Offer"
              : "Add Offer"
        }
        scrollable
        testID="offer-form-modal"
      >
        {editingOffer ? (
          <OfferForm
            offer={editingOffer}
            membershipProducts={products}
            stores={stores}
            offerStatuses={offerStatuses}
            existingOffers={offers}
            usageRules={editingOfferRules}
            isNewOffer={
              !committedOffers.some((item) => item.id === editingOffer.id)
            }
            readOnly={viewingOffer}
            onSave={handleSaveDraft}
            onCancel={() => {
              setFormVisible(false);
              setEditingOffer(null);
              setViewingOffer(false);
            }}
          />
        ) : null}
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  screen: {
    padding: 24,
    gap: 24,
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

  addButton: {
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

  successMessage: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: "center",
    backgroundColor: "#ECFDF5",
  },

  previewLink: {
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 0,
  },

  center: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
});
