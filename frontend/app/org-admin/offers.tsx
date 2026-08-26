import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type {
  MembershipProduct,
  Offer,
  ReferenceDataItem,
  Status,
  Store,
} from "@/src/core";

import { services } from "@/src/core";

import { useBusiness } from "@/src/providers";
import { DataTable, DataTableColumn, Modal, Text } from "@/src/ui";

import { OfferForm } from "@/src/ui/admin/OfferForm";
import { useRouter } from "expo-router";
import { APP_ROUTES } from "@/src/constants/navigation";

export default function OrgAdminOffers() {
  const { organization } = useBusiness();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<MembershipProduct[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [offerStatuses, setOfferStatuses] = useState<Status[]>([]);

  const [loading, setLoading] = useState(true);

  const [formVisible, setFormVisible] = useState(false);

  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

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

        setOffers(offerList);
        setProducts(productList);
        setStores(storeList);
        setOfferStatuses(statusList);
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

  const createEmptyOffer = (): Offer => {
    const now = new Date().toISOString();

    const draftStatus =
      offerStatuses.find((item) => item.statusCode === "DRAFT") ??
      offerStatuses.find((item) => item.id === "offer-status-draft") ??
      offerStatuses[0];

    return {
      id: `offer-${Date.now()}`,

      organizationId: organization.id,

      offerCode: "",
      offerName: "",
      description: undefined,

      membershipProductId: undefined,
      storeId: undefined,

      discountPercentage: undefined,

      effectiveDate: now.substring(0, 10),
      expiryDate: undefined,

      statusId: draftStatus?.id ?? "",

      createdAt: now,
      createdBy: "user-system",

      updatedAt: now,
      updatedBy: "user-system",

      isDeleted: false,
      versionNo: 1,
    };
  };

  const handleAdd = () => {
    setEditingOffer(createEmptyOffer());
    setFormVisible(true);
  };

  const handleEdit = (offer: Offer) => {
    setEditingOffer(offer);
    setFormVisible(true);
  };

  const handleSave = async (updatedOffer: Offer) => {
    try {
      const existing = offers.some((item) => item.id === updatedOffer.id);

      if (existing) {
        const updated = await services.offer.updateOffer(
          organization.id,
          updatedOffer,
        );

        setOffers((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        const created = await services.offer.createOffer(
          organization.id,
          updatedOffer,
        );

        setOffers((current) => [...current, created]);
      }

      setFormVisible(false);
      setEditingOffer(null);
    } catch (error) {
      Alert.alert(
        "Unable to save offer",
        error instanceof Error ? error.message : "Unable to save offer.",
      );
    }
  };

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

        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => [
            styles.addButton,
            {
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text variant="body" color="background">
            + Add Offer
          </Text>
        </Pressable>
      </View>

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
            actions={[
              {
                label: "Edit",
                onPress: handleEdit,
              },
            ]}
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
        }}
        title={
          editingOffer && offers.some((item) => item.id === editingOffer.id)
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
            onSave={handleSave}
            onCancel={() => {
              setFormVisible(false);
              setEditingOffer(null);
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

  addButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
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
