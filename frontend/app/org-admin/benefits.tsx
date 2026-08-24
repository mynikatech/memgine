import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Benefit, ReferenceDataItem, services, Status } from "@/src/core";

import { useBusiness } from "@/src/providers";
import { DataTable, DataTableColumn, Modal, Text } from "@/src/ui";

import { BenefitForm } from "@/src/ui/admin/BenefitForm";

export default function OrgAdminBenefits() {
  const { organization } = useBusiness();

  const [benefits, setBenefits] = useState<Benefit[]>([]);

  const [benefitCategories, setBenefitCategories] = useState<
    ReferenceDataItem[]
  >([]);

  const [benefitTypes, setBenefitTypes] = useState<ReferenceDataItem[]>([]);

  const [benefitStatuses, setBenefitStatuses] = useState<Status[]>([]);

  const [loading, setLoading] = useState(true);

  const [formVisible, setFormVisible] = useState(false);

  const [editingBenefit, setEditingBenefit] = useState<Benefit | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      try {
        const [benefitList, categoryList, typeList, statusList] =
          await Promise.all([
            services.benefit.listByOrganization(organization.id),
            services.referenceData.listBenefitCategories(),
            services.referenceData.listBenefitTypes(),
            services.status.listBenefitStatuses(),
          ]);

        if (!mounted) {
          return;
        }

        setBenefits(benefitList);
        setBenefitCategories(categoryList);
        setBenefitTypes(typeList);
        setBenefitStatuses(statusList);
      } catch (error) {
        if (!mounted) {
          return;
        }

        Alert.alert(
          "Unable to load benefits",
          error instanceof Error ? error.message : "Unable to load benefits.",
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [organization.id]);

  const getCategoryName = (id: string) =>
    benefitCategories.find((item) => item.id === id)?.name ?? "Unknown";

  const getTypeName = (id: string) =>
    benefitTypes.find((item) => item.id === id)?.name ?? "Unknown";

  const getStatusName = (id: string) =>
    benefitStatuses.find((item) => item.id === id)?.statusName ?? "Unknown";

  const getDisplayName = (benefit: Benefit) =>
    benefit.displayName ?? benefit.benefitName;

  const columns = useMemo<DataTableColumn<Benefit>[]>(
    () => [
      {
        key: "benefitCode",
        title: "Benefit Code",
        width: 150,
      },
      {
        key: "benefitName",
        title: "Benefit Name",
        width: 240,
        render: (item) => (
          <Text variant="body" color="text">
            {getDisplayName(item)}
          </Text>
        ),
      },
      {
        key: "benefitCategoryId",
        title: "Category",
        width: 160,
        render: (item) => (
          <Text variant="body" color="text">
            {getCategoryName(item.benefitCategoryId)}
          </Text>
        ),
      },
      {
        key: "benefitTypeId",
        title: "Type",
        width: 140,
        render: (item) => (
          <Text variant="body" color="text">
            {getTypeName(item.benefitTypeId)}
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
      {
        key: "benefitStatusId",
        title: "Status",
        width: 130,
        render: (item) => (
          <Text variant="body" color="text">
            {getStatusName(item.benefitStatusId)}
          </Text>
        ),
      },
    ],
    [benefitCategories, benefitTypes, benefitStatuses],
  );

  const createEmptyBenefit = (): Benefit => {
    const now = new Date().toISOString();

    return {
      id: `benefit-${Date.now()}`,

      organizationId: organization.id,

      benefitCode: "",
      benefitName: "",
      displayName: undefined,

      benefitCategoryId: "",
      benefitTypeId: "",
      benefitStatusId: "benefit-status-active",

      description: undefined,

      effectiveDate: now.substring(0, 10),
      expiryDate: undefined,

      createdAt: now,
      createdBy: "user-system",

      updatedAt: now,
      updatedBy: "user-system",

      isDeleted: false,
      versionNo: 1,
    };
  };

  const handleAdd = () => {
    setEditingBenefit(createEmptyBenefit());
    setFormVisible(true);
  };

  const handleEdit = (benefit: Benefit) => {
    setEditingBenefit(benefit);
    setFormVisible(true);
  };

  const handleSave = async (benefit: Benefit) => {
    try {
      const existing = benefits.some((item) => item.id === benefit.id);

      if (existing) {
        const updated = await services.benefit.updateBenefit(
          organization.id,
          benefit,
        );

        setBenefits((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        const created = await services.benefit.createBenefit(
          organization.id,
          benefit,
        );

        setBenefits((current) => [...current, created]);
      }

      setFormVisible(false);
      setEditingBenefit(null);
    } catch (error) {
      Alert.alert(
        "Unable to save benefit",
        error instanceof Error ? error.message : "Unable to save the benefit.",
      );
    }
  };

  const handleDelete = async (benefit: Benefit) => {
    try {
      await services.benefit.deleteBenefit(organization.id, benefit.id);

      setBenefits((current) =>
        current.filter((item) => item.id !== benefit.id),
      );
    } catch (error) {
      Alert.alert(
        "Unable to delete benefit",
        error instanceof Error
          ? error.message
          : "Unable to delete the benefit.",
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
            Benefits
          </Text>

          <Text variant="bodySmall" color="textMuted">
            Manage the benefits offered to your members.
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
            + Add Benefit
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text variant="body" color="textMuted">
            Loading benefits...
          </Text>
        </View>
      ) : (
        <DataTable
          columns={columns}
          data={benefits.filter((item) => !item.isDeleted)}
          keyExtractor={(item) => item.id}
          emptyMessage="No benefits configured."
          actions={[
            {
              label: "Edit",
              onPress: handleEdit,
            },
            {
              label: "Delete",
              onPress: handleDelete,
            },
          ]}
        />
      )}

      <Modal
        visible={formVisible}
        onClose={() => {
          setFormVisible(false);
          setEditingBenefit(null);
        }}
        title={
          editingBenefit &&
          benefits.some((item) => item.id === editingBenefit.id)
            ? "Edit Benefit"
            : "Add Benefit"
        }
        scrollable
        testID="benefit-form-modal"
      >
        {editingBenefit ? (
          <BenefitForm
            benefit={editingBenefit}
            benefitCategories={benefitCategories}
            benefitTypes={benefitTypes}
            benefitStatuses={benefitStatuses}
            onSave={handleSave}
            onCancel={() => {
              setFormVisible(false);
              setEditingBenefit(null);
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

  center: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
});
