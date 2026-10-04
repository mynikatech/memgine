import { useEffect, useMemo, useState } from "react";

import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  MembershipProduct,
  Offer,
  OfferUsageRule,
  Status,
  Store,
} from "@/src/core";

import type { Product } from "@/src/core";

import { OfferCtaType, services } from "@/src/core";

import { useBusiness } from "@/src/providers";

import {
  DataTable,
  DataTableColumn,
  Modal,
  Text,
  DraftSaveMessage,
} from "@/src/ui";

import { OfferForm } from "@/src/ui/admin/OfferForm";

import { useRouter } from "expo-router";

import { APP_ROUTES } from "@/src/constants/navigation";

import type { PickedBrandingAsset } from "@/src/core/brandingAssetPicker";

import { brandingAssetApi } from "@/src/data/api/branding-asset-api";

import {
  offerCommerceApi,
  type CommerceProductMapping,
  type MembershipOfferApplicabilityWrite,
  type OfferCommerceApplicabilityWrite,
  type OfferCommerceConfiguration,
} from "@/src/data/api/offer-commerce-api";

export default function OrgAdminOffers() {
  const { organization } = useBusiness();

  const [committedOffers, setCommittedOffers] = useState<Offer[]>([]);

  const [offers, setOffers] = useState<Offer[]>([]);

  const [committedUsageRules, setCommittedUsageRules] = useState<
    OfferUsageRule[]
  >([]);

  const [usageRules, setUsageRules] = useState<OfferUsageRule[]>([]);

  const [pendingImages, setPendingImages] = useState<
    Record<string, PickedBrandingAsset>
  >({});

  const [products, setProducts] = useState<MembershipProduct[]>([]);

  const [stores, setStores] = useState<Store[]>([]);

  const [offerStatuses, setOfferStatuses] = useState<Status[]>([]);

  const [commerceMappings, setCommerceMappings] = useState<
    CommerceProductMapping[]
  >([]);

  const [posProducts, setPosProducts] = useState<Product[]>([]);

  const [commerceConfigurations, setCommerceConfigurations] = useState<
    Record<string, OfferCommerceConfiguration>
  >({});

  const [committedCommerceConfigurations, setCommittedCommerceConfigurations] =
    useState<Record<string, OfferCommerceConfiguration>>({});

  const [membershipConfigurations, setMembershipConfigurations] = useState<
    Record<string, MembershipOfferApplicabilityWrite>
  >({});

  const [
    committedMembershipConfigurations,

    setCommittedMembershipConfigurations,
  ] = useState<Record<string, MembershipOfferApplicabilityWrite>>({});

  const [targetModes, setTargetModes] = useState<
    Record<string, "POS_PRODUCT" | "MEMBERSHIP_PRODUCT">
  >({});

  const [committedTargetModes, setCommittedTargetModes] = useState<
    Record<string, "POS_PRODUCT" | "MEMBERSHIP_PRODUCT">
  >({});

  const [dualApplicabilityOfferIds, setDualApplicabilityOfferIds] = useState<
    Set<string>
  >(new Set());

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [isEditing, setIsEditing] = useState(false);

  const [saveMessageVisible, setSaveMessageVisible] = useState(false);

  const [draftSaved, setDraftSaved] = useState(false);

  const [formVisible, setFormVisible] = useState(false);

  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

  const [viewingOffer, setViewingOffer] = useState(false);

  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [
          offerList,

          productList,

          storeList,

          statusList,

          mappings,

          catalogProducts,
        ] = await Promise.all([
          services.offer.listByOrganization(organization.id),

          services.membershipProduct.listProducts(organization.id),

          services.organization.listStores(organization.id),

          services.status.listOfferStatuses(),

          offerCommerceApi.mappings(organization.id),

          services.benefit.listCatalogProducts(organization.id),
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

        setPendingImages({});

        setProducts(productList);

        setStores(storeList);

        setOfferStatuses(statusList);

        setCommerceMappings(mappings);

        setPosProducts(catalogProducts);

        console.log("[Offers] Starting applicability load", {
          offerCount: activeOffers.length,
          offerIds: activeOffers.map((offer) => offer.id),
        });

        const posApplicability = await Promise.all(
          activeOffers.map(async (offer) => {
            try {
              const value = await offerCommerceApi.applicability(
                organization.id,
                offer.id,
              );

              console.log("[Offers] Commerce applicability", offer.id, value);

              return [offer.id, value] as const;
            } catch (error) {
              return [offer.id, null] as const;
            }
          }),
        );

        const membershipApplicability = await Promise.all(
          activeOffers.map(async (offer) => {
            try {
              const value = await offerCommerceApi.membershipApplicability(
                organization.id,
                offer.id,
              );

              console.log("[Offers] Membership applicability", offer.id, value);

              return [offer.id, value] as const;
            } catch (error) {
              return [offer.id, null] as const;
            }
          }),
        );

        console.log("[Offers] POS applicability RAW", posApplicability);
        console.log(
          "[Offers] Membership applicability RAW",
          membershipApplicability,
        );

        if (mounted) {
          const posConfigurations = Object.fromEntries(
            posApplicability

              .filter(([, value]) => value?.active)

              .map(([id, value]) => [
                id,

                {
                  productIds: value!.productMappings

                    .map((mapping) => mapping.productId)

                    .filter((productId): productId is string =>
                      Boolean(productId),
                    ),

                  productMappings: value!.productMappings,

                  adjustmentType: value!
                    .adjustmentType as OfferCommerceConfiguration["adjustmentType"],

                  percentage: value!.percentage ?? undefined,

                  amountMinor: value!.amountMinor ?? undefined,

                  currencyCode: value!.currencyCode ?? undefined,

                  active: value!.active,
                },
              ]),
          );

          const membershipConfigurations = Object.fromEntries(
            membershipApplicability

              .filter(([, value]) => value?.active)

              .map(([id, value]) => [
                id,

                {
                  behavior: value!.behavior,

                  targetMembershipProductId: value!.targetMembershipProductId,

                  targetSubscriptionPlanId:
                    value!.targetSubscriptionPlanId ?? undefined,

                  sourceMembershipProductId:
                    value!.sourceMembershipProductId ?? undefined,

                  sourceSubscriptionPlanId:
                    value!.sourceSubscriptionPlanId ?? undefined,

                  adjustmentType: value!.adjustmentType,

                  percentage: value!.percentage ?? undefined,

                  amountMinor: value!.amountMinor ?? undefined,

                  currencyCode: value!.currencyCode ?? undefined,

                  active: value!.active,

                  customerApplicability: value!.customerApplicability ?? "ALL",

                  membershipTargetMode:
                    value!.membershipTargetMode ?? "ALL_MEMBERSHIP_PRODUCTS",

                  selectedMembershipProductIds:
                    value!.selectedMembershipProductIds ?? [],
                },
              ]),
          );

          console.log("[Offers] POS configurations BUILT", posConfigurations);
          console.log(
            "[Offers] Membership configurations BUILT",
            membershipConfigurations,
          );

          setCommerceConfigurations(posConfigurations);

          setCommittedCommerceConfigurations(posConfigurations);

          setMembershipConfigurations(membershipConfigurations);

          setCommittedMembershipConfigurations(membershipConfigurations);

          setDualApplicabilityOfferIds(
            new Set(
              activeOffers

                .filter(
                  (offer) =>
                    Boolean(posConfigurations[offer.id]) &&
                    Boolean(membershipConfigurations[offer.id]),
                )

                .map((offer) => offer.id),
            ),
          );

          const modeEntries: Array<
            readonly [string, "POS_PRODUCT" | "MEMBERSHIP_PRODUCT"]
          > = [];

          for (const offer of activeOffers) {
            if (membershipConfigurations[offer.id]) {
              modeEntries.push([offer.id, "MEMBERSHIP_PRODUCT"] as const);
            } else if (posConfigurations[offer.id]) {
              modeEntries.push([offer.id, "POS_PRODUCT"] as const);
            }
          }

          const modes = Object.fromEntries(modeEntries);

          console.log("[Offers] Target modes BUILT", modes);

          setTargetModes(modes);

          setCommittedTargetModes(modes);
        }

        setIsEditing(false);

        setSaveMessageVisible(false);

        setDraftSaved(false);

        setFormVisible(false);

        setEditingOffer(null);

        setViewingOffer(false);
      } catch (error) {
        console.error("[Offers] LOAD FAILED", error);

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
      JSON.stringify(usageRules) !== JSON.stringify(committedUsageRules) ||
      JSON.stringify(commerceConfigurations) !==
        JSON.stringify(committedCommerceConfigurations) ||
      JSON.stringify(membershipConfigurations) !==
        JSON.stringify(committedMembershipConfigurations) ||
      JSON.stringify(targetModes) !== JSON.stringify(committedTargetModes),

    [
      offers,

      committedOffers,

      usageRules,

      committedUsageRules,

      commerceConfigurations,

      committedCommerceConfigurations,

      membershipConfigurations,

      committedMembershipConfigurations,

      targetModes,

      committedTargetModes,
    ],
  );

  const commerceApplicabilityFor = (
    offer: Offer,
  ): OfferCommerceApplicabilityWrite => {
    const configuration = commerceConfigurations[offer.id];

    if (!configuration)
      throw new Error("Org Product configuration is required.");

    const mappingIds: string[] = [];

    const unmapped: string[] = [];

    const ambiguous: string[] = [];

    for (const productId of configuration.productIds) {
      const mappings = commerceMappings.filter(
        (mapping) => mapping.productId === productId,
      );

      const productName =
        posProducts.find((product) => product.id === productId)?.productName ??
        productId;

      if (!mappings.length) unmapped.push(productName);
      else if (mappings.length > 1) ambiguous.push(productName);
      else mappingIds.push(mappings[0].mappingId);
    }

    if (unmapped.length)
      throw new Error(
        `These selected Products have no active Commerce mapping: ${unmapped.join(", ")}. Sync or reconcile them before saving.`,
      );

    if (ambiguous.length)
      throw new Error(
        `These selected Products have multiple active Org Product mappings and cannot be resolved automatically: ${ambiguous.join(", ")}.`,
      );

    if (!mappingIds.length)
      throw new Error("Select at least one mapped Org Product.");

    return {
      adjustmentType: configuration.adjustmentType,

      percentage: configuration.percentage,

      amountMinor: configuration.amountMinor,

      currencyCode: configuration.currencyCode,

      active: configuration.active,

      productMappingIds: mappingIds,
    };
  };

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

  const getOfferType = (
    offerId: string,
  ): "ORG_PRODUCT" | "MEMBERSHIP" | "DUAL" | null => {
    if (dualApplicabilityOfferIds.has(offerId)) {
      return "DUAL";
    }

    const mode = targetModes[offerId];

    if (mode === "MEMBERSHIP_PRODUCT") {
      return "MEMBERSHIP";
    }

    if (mode === "POS_PRODUCT") {
      return "ORG_PRODUCT";
    }

    if (membershipConfigurations[offerId]) {
      return "MEMBERSHIP";
    }

    if (commerceConfigurations[offerId]) {
      return "ORG_PRODUCT";
    }

    return null;
  };

  const getOfferTypeLabel = (offerId: string) => {
    switch (getOfferType(offerId)) {
      case "ORG_PRODUCT":
        return "Org Product";
      case "MEMBERSHIP":
        return "Membership";
      case "DUAL":
        return "Membership + Org Product";
      default:
        return "—";
    }
  };

  const getOrgProductNames = (offerId: string): string[] => {
    const configuration = commerceConfigurations[offerId];

    if (!configuration) {
      return [];
    }

    if (configuration.productMappings?.length) {
      return configuration.productMappings.map((mapping) => {
        const catalogProduct = posProducts.find(
          (product) => product.id === mapping.productId,
        );

        return (
          catalogProduct?.productName ??
          mapping.snapshot?.productName ??
          mapping.externalSku ??
          mapping.externalProductId ??
          mapping.productId ??
          "Unknown Product"
        );
      });
    }

    return configuration.productIds.map((productId) => {
      const catalogProduct = posProducts.find(
        (product) => product.id === productId,
      );

      return (
        catalogProduct?.productName ?? catalogProduct?.productCode ?? productId
      );
    });
  };

  const getMembershipProductsLabel = (offerId: string): string => {
    const configuration = membershipConfigurations[offerId];

    if (!configuration) {
      return "—";
    }

    if (configuration.behavior === "UPGRADE") {
      return configuration.targetMembershipProductId
        ? getProductName(configuration.targetMembershipProductId)
        : "Membership Upgrade";
    }

    if (configuration.membershipTargetMode === "ALL_MEMBERSHIP_PRODUCTS") {
      return "All Membership Products";
    }

    if (configuration.selectedMembershipProductIds.length > 0) {
      return configuration.selectedMembershipProductIds
        .map((productId) => getProductName(productId))
        .join(", ");
    }

    return "No Membership Products configured";
  };

  const getOfferProductsLabel = (offerId: string): string => {
    const type = getOfferType(offerId);
    const orgProductNames = getOrgProductNames(offerId);
    const membershipLabel = getMembershipProductsLabel(offerId);

    if (type === "DUAL") {
      const orgProducts =
        orgProductNames.length > 0
          ? orgProductNames.join(", ")
          : "No Org Products configured";

      return `${membershipLabel}; Org Products: ${orgProducts}`;
    }

    if (type === "MEMBERSHIP") {
      return membershipLabel;
    }

    if (type === "ORG_PRODUCT") {
      return orgProductNames.length > 0
        ? orgProductNames.join(", ")
        : "No Org Products configured";
    }

    return "—";
  };

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
        // Reuse a real Offer key because DataTableColumn<Offer> keys are typed
        // against the row model; rendering comes from canonical applicability state.
        key: "membershipProductId",
        title: "Offer Type",
        width: 190,
        render: (item) => (
          <Text variant="body" color="text">
            {getOfferTypeLabel(item.id)}
          </Text>
        ),
      },

      {
        key: "description",
        title: "Product(s)",
        width: 300,
        render: (item) => (
          <Text variant="body" color="text">
            {getOfferProductsLabel(item.id)}
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

    [
      products,
      stores,
      offerStatuses,
      commerceConfigurations,
      membershipConfigurations,
      targetModes,
      dualApplicabilityOfferIds,
      posProducts,
    ],
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

    setEditingOffer({ ...offer });

    setFormVisible(true);
  };

  const handleView = (offer: Offer) => {
    if (isEditing || saving) {
      return;
    }

    setViewingOffer(true);

    setEditingOffer({ ...offer });

    setFormVisible(true);
  };

  const handleSaveDraft = async (
    updatedOffer: Offer,

    updatedRules: OfferUsageRule[],

    image?: PickedBrandingAsset,

    configuration?: OfferCommerceConfiguration,

    membershipConfiguration?: MembershipOfferApplicabilityWrite,

    targetMode?: "POS_PRODUCT" | "MEMBERSHIP_PRODUCT",
  ) => {
    setPendingImages((current) => {
      const next = { ...current };

      if (image) next[updatedOffer.id] = image;

      return next;
    });

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

    if (configuration)
      setCommerceConfigurations((current) => ({
        ...current,

        [updatedOffer.id]: configuration,
      }));

    if (membershipConfiguration)
      setMembershipConfigurations((current) => ({
        ...current,

        [updatedOffer.id]: membershipConfiguration,
      }));

    if (targetMode)
      setTargetModes((current) => ({
        ...current,

        [updatedOffer.id]: targetMode,
      }));

    setFormVisible(false);

    setEditingOffer(null);

    setViewingOffer(false);

    setDraftSaved(true);
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
            setPendingImages((current) => {
              const next = { ...current };

              delete next[offer.id];

              return next;
            });

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

      for (const offer of offers) {
        const existing = committedById.get(offer.id);

        const currentRules = usageRules.filter(
          (rule) => rule.offerId === offer.id,
        );

        const previousRules = committedUsageRules.filter(
          (rule) => rule.offerId === offer.id,
        );

        const mode =
          targetModes[offer.id] ?? (!existing ? "POS_PRODUCT" : undefined);

        const configurationChanged =
          JSON.stringify(commerceConfigurations[offer.id]) !==
            JSON.stringify(committedCommerceConfigurations[offer.id]) ||
          JSON.stringify(membershipConfigurations[offer.id]) !==
            JSON.stringify(committedMembershipConfigurations[offer.id]) ||
          mode !==
            (committedTargetModes[offer.id] ??
              (!existing ? "POS_PRODUCT" : undefined));

        if (
          !existing ||
          JSON.stringify(existing) !== JSON.stringify(offer) ||
          JSON.stringify(currentRules) !== JSON.stringify(previousRules) ||
          configurationChanged
        ) {
          const hadPosApplicability = Boolean(
            committedCommerceConfigurations[offer.id],
          );

          const hadMembershipApplicability = Boolean(
            committedMembershipConfigurations[offer.id],
          );

          let offerToSave = offer;

          const pendingImage = pendingImages[offer.id];

          if (pendingImage) {
            const uploaded = await brandingAssetApi.upload(
              organization.id,

              "offerPromotion",

              pendingImage,
            );

            offerToSave = { ...offer, promotionImageUrl: uploaded.path };

            setOffers((current) =>
              current.map((item) =>
                item.id === offer.id ? offerToSave : item,
              ),
            );

            setPendingImages((current) => {
              const next = { ...current };

              delete next[offer.id];

              return next;
            });
          }

          const savedOffer = await services.offer.saveOfferWithRules(
            organization.id,

            offerToSave,

            currentRules,

            !existing,
          );

          if (mode === "POS_PRODUCT") {
            if (
              hadMembershipApplicability &&
              !dualApplicabilityOfferIds.has(offer.id)
            ) {
              await offerCommerceApi.deactivateMembershipApplicability(
                organization.id,

                savedOffer.id,
              );
            }

            const applicability = commerceApplicabilityFor(offer);

            await offerCommerceApi.save(
              organization.id,

              savedOffer.id,

              applicability,
            );
          } else if (mode === "MEMBERSHIP_PRODUCT") {
            if (
              hadPosApplicability &&
              !dualApplicabilityOfferIds.has(offer.id)
            ) {
              await offerCommerceApi.deactivateApplicability(
                organization.id,

                savedOffer.id,
              );
            }

            const applicability = membershipConfigurations[offer.id];

            if (!applicability)
              throw new Error("Membership Product configuration is required.");

            await offerCommerceApi.saveMembershipApplicability(
              organization.id,

              savedOffer.id,

              applicability,
            );
          }

          setCommittedOffers((current) => [
            ...current.filter((item) => item.id !== savedOffer.id),

            savedOffer,
          ]);

          setOffers((current) =>
            current.map((item) =>
              item.id === savedOffer.id ? savedOffer : item,
            ),
          );

          const savedRules = await services.offerUsageRule.listByOffer(
            savedOffer.id,
          );

          setCommittedUsageRules((current) => [
            ...current.filter((rule) => rule.offerId !== savedOffer.id),

            ...savedRules,
          ]);

          setUsageRules((current) => [
            ...current.filter((rule) => rule.offerId !== savedOffer.id),

            ...savedRules,
          ]);
        }
      }

      for (const committed of committedOffers) {
        if (!workingById.has(committed.id)) {
          await services.offer.deleteOffer(organization.id, committed.id);

          setCommittedOffers((current) =>
            current.filter((item) => item.id !== committed.id),
          );

          setCommittedUsageRules((current) =>
            current.filter((rule) => rule.offerId !== committed.id),
          );
        }
      }

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

      setPendingImages({});

      const activeCommerceConfigurations = Object.fromEntries(
        Object.entries(commerceConfigurations).filter(
          ([offerId]) =>
            (targetModes[offerId] ?? "POS_PRODUCT") === "POS_PRODUCT" ||
            dualApplicabilityOfferIds.has(offerId),
        ),
      );

      const activeMembershipConfigurations = Object.fromEntries(
        Object.entries(membershipConfigurations).filter(
          ([offerId]) =>
            targetModes[offerId] === "MEMBERSHIP_PRODUCT" ||
            dualApplicabilityOfferIds.has(offerId),
        ),
      );

      setCommerceConfigurations(activeCommerceConfigurations);

      setCommittedCommerceConfigurations(activeCommerceConfigurations);

      setMembershipConfigurations(activeMembershipConfigurations);

      setCommittedMembershipConfigurations(activeMembershipConfigurations);

      setCommittedTargetModes(targetModes);

      setIsEditing(false);

      setFormVisible(false);

      setEditingOffer(null);

      setViewingOffer(false);

      setSaveMessageVisible(true);

      setDraftSaved(false);

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

    setPendingImages({});

    setCommerceConfigurations(committedCommerceConfigurations);

    setMembershipConfigurations(committedMembershipConfigurations);

    setTargetModes(committedTargetModes);

    setIsEditing(false);

    setFormVisible(false);

    setEditingOffer(null);

    setViewingOffer(false);

    setDraftSaved(false);
  };

  const handleStartEditing = () => {
    if (saving) {
      return;
    }

    setSaveMessageVisible(false);

    setDraftSaved(false);

    setIsEditing(true);
  };

  const editingOfferRules = useMemo(
    () =>
      editingOffer
        ? usageRules.filter((rule) => rule.offerId === editingOffer.id)
        : [],

    [editingOffer?.id, usageRules],
  );

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
                    organization.id,

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

      <DraftSaveMessage visible={isEditing && draftSaved && hasChanges} />

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
                  organization.id,

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
            commerceMappings={commerceMappings}
            posProducts={posProducts.map((product) => ({
              id: product.id,

              name: product.productName
                ? `${product.productName}${product.productCode ? ` (${product.productCode})` : ""}`
                : product.productCode,
            }))}
            commerceConfiguration={
              !committedOffers.some((item) => item.id === editingOffer.id)
                ? (commerceConfigurations[editingOffer.id] ?? {
                    adjustmentType: "PRODUCT_PERCENT_OFF",

                    percentage: editingOffer.discountPercentage,

                    active: true,

                    productIds: [],
                  })
                : (commerceConfigurations[editingOffer.id] ?? null)
            }
            membershipConfiguration={
              membershipConfigurations[editingOffer.id] ?? null
            }
            additionalPosCommerceConfiguration={
              membershipConfigurations[editingOffer.id] &&
              commerceConfigurations[editingOffer.id]
                ? commerceConfigurations[editingOffer.id]
                : null
            }
            targetMode={
              !committedOffers.some((item) => item.id === editingOffer.id)
                ? (targetModes[editingOffer.id] ?? "POS_PRODUCT")
                : (targetModes[editingOffer.id] ?? null)
            }
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
