import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as XLSX from "xlsx";
import { Button, Checkbox, DataTable, Input, Modal, Text } from "@/src/ui";
import { useBusiness, useTheme } from "@/src/providers";
import type { IntegrationConfiguration } from "@/src/core";
import { apis } from "@/src/data/data-registry";
import { APP_ROUTES } from "@/src/constants/navigation";
import {
  organizationProductApi,
  type OrganizationProduct,
  type OrganizationProductCatalog,
  type OrganizationCommerceProductMapping,
  type ProductImportPreview,
  type ProductImportRow,
} from "@/src/data/api/organization-product-api";

const emptyProduct = {
  productCode: "",
  productName: "",
  description: "",
  sku: "",
  basePriceMinor: "",
  currencyCode: "CAD",
  externalProductId: "",
};
const emptyCatalog = {
  catalogName: "",
  source: "MANUAL" as "MANUAL" | "INTEGRATION",
  integrationConfigurationId: "",
  externalCatalogId: "",
  active: true,
};
const productImportTemplateFileName = "Memgine_Product_Import_Template.xlsx";
const productImportHeaders = [
  "Memgine Product ID",
  "External Product ID",
  "Product Code",
  "Product Name",
  "SKU",
  "UPC",
  "Description",
  "Category External ID",
  "Category Name",
  "Base Price",
  "Currency",
  "Active",
];
const productImportColumnWidths = [24, 24, 20, 30, 20, 20, 36, 26, 24, 14, 12, 12];
function string(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
function moneyToMinor(value: unknown): number {
  const amount = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
}

export default function OrgAdminProducts() {
  const { organizationId: routeOrganizationId } = useLocalSearchParams<{
    organizationId: string;
  }>();
  const { organization } = useBusiness();
  const org = routeOrganizationId ?? organization?.id ?? "";
  const router = useRouter();
  const theme = useTheme();
  const [catalogs, setCatalogs] = useState<OrganizationProductCatalog[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConfiguration[]>([]);
  const [products, setProducts] = useState<OrganizationProduct[]>([]);
  const [mappings, setMappings] = useState<OrganizationCommerceProductMapping[]>([]);
  const [error, setError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<any>(emptyProduct);
  const [editing, setEditing] = useState<OrganizationProduct | null>(null);
  const [catalogId, setCatalogId] = useState("");
  const [showProduct, setShowProduct] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogEditing, setCatalogEditing] =
    useState<OrganizationProductCatalog | null>(null);
  const [catalog, setCatalog] = useState<any>(emptyCatalog);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [mappingProduct, setMappingProduct] =
    useState<OrganizationProduct | null>(null);
  const [selectedMappingId, setSelectedMappingId] = useState("");
  const [resolvingMapping, setResolvingMapping] = useState(false);
  const [importRows, setImportRows] = useState<ProductImportRow[]>([]);
  const [preview, setPreview] = useState<ProductImportPreview[]>([]);
  const [fileName, setFileName] = useState("");
  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    const [c, p, i, m] = await Promise.all([
      organizationProductApi.catalogs(org),
      organizationProductApi.products(org),
      apis.integrationConfiguration.list(org),
      organizationProductApi.mappings(org),
    ]);
    if (!c.success) setError(c.error?.message);
    else {
      setCatalogs(c.data);
      setCatalogId((v) => v || c.data[0]?.productCatalogId || "");
    }
    if (!p.success) setError(p.error?.message);
    else setProducts(p.data);
    if (!i.success) setError(i.error?.message);
    else setIntegrations(i.data);
    if (!m.success) setError(m.error?.message);
    else setMappings(m.data);
    setLoading(false);
  }, [org]);
  useFocusEffect(
    useCallback(() => {
    void load();
    }, [load]),
  );
  const activeCatalog = catalogs.find((c) => c.productCatalogId === catalogId);
  const mappingHealth = (item: OrganizationProduct) => {
    if (!item.integrationConfigurationId) return { label: "—" };
    const activeCount = mappings.filter(
      (mapping) =>
        mapping.active &&
        mapping.productId === item.productId &&
        mapping.integrationConfigurationId === item.integrationConfigurationId &&
        !mapping.storeId,
    ).length;
    if (activeCount === 1) return { label: "Mapped" };
    return {
      label: "Needs attention",
      detail:
        activeCount === 0 ? "No active mapping" : `${activeCount} active mappings`,
    };
  };
  const activeMappingsForProduct = (item: OrganizationProduct) =>
    mappings.filter(
      (mapping) =>
        mapping.active &&
        mapping.productId === item.productId &&
        mapping.integrationConfigurationId === item.integrationConfigurationId,
    );
  const activeOrganizationScopeMappings = (item: OrganizationProduct) =>
    activeMappingsForProduct(item).filter((mapping) => !mapping.storeId);
  const recommendedMappingIds = (item: OrganizationProduct) => {
    const canonicalSku = item.sku?.trim().toUpperCase();
    if (!canonicalSku) return [];
    return activeOrganizationScopeMappings(item)
      .filter((mapping) => mapping.externalSku?.trim().toUpperCase() === canonicalSku)
      .map((mapping) => mapping.mappingId);
  };
  const openMappingFix = (item: OrganizationProduct) => {
    const recommendedIds = recommendedMappingIds(item);
    setError(undefined);
    setSuccessMessage(undefined);
    setSelectedMappingId(recommendedIds.length === 1 ? recommendedIds[0] : "");
    setMappingProduct(item);
  };
  const resolveMapping = async () => {
    if (!mappingProduct || !selectedMappingId) {
      setError("Choose the one active mapping to keep.");
      return;
    }
    setResolvingMapping(true);
    const result = await organizationProductApi.resolveMapping(
      org,
      mappingProduct.productId,
      selectedMappingId,
    );
    setResolvingMapping(false);
    if (!result.success) {
      setError(result.error?.message);
      return;
    }
    setMappingProduct(null);
    setSelectedMappingId("");
    setSuccessMessage("Mapping fixed.");
    await load();
  };
  const saveCatalog = async () => {
    if (!catalog.catalogName?.trim()) {
      setError("Catalog Name is required.");
      return;
    }
    if (catalog.source === "INTEGRATION" && !catalog.integrationConfigurationId) {
      setError("Select an Integration Configuration for an integration catalog.");
      return;
    }
    setSavingCatalog(true);
    const result = await organizationProductApi.saveCatalog(org, {
      productCatalogId: catalogEditing?.productCatalogId,
      catalogName: catalog.catalogName.trim(),
      description: undefined,
      integrationConfigurationId:
        catalog.source === "INTEGRATION"
          ? catalog.integrationConfigurationId
          : null,
      externalCatalogId:
        catalog.source === "INTEGRATION"
          ? catalog.externalCatalogId.trim() || null
          : null,
      active: catalog.active,
      versionNo: catalogEditing?.versionNo,
    });
    setSavingCatalog(false);
    if (!result.success) {
      setError(result.error?.message);
      return;
    }
    setCatalogId(result.data.productCatalogId);
    setShowCatalog(false);
    setCatalogEditing(null);
    setCatalog(emptyCatalog);
    await load();
  };
  const openCatalog = (selected?: OrganizationProductCatalog) => {
    setError(undefined);
    setCatalogEditing(selected ?? null);
    setCatalog(
      selected
        ? {
            catalogName: selected.catalogName,
            source: selected.integrationConfigurationId ? "INTEGRATION" : "MANUAL",
            integrationConfigurationId: selected.integrationConfigurationId ?? "",
            externalCatalogId: selected.externalCatalogId ?? "",
            active: selected.active,
          }
        : emptyCatalog,
    );
    setShowCatalog(true);
  };
  const save = async () => {
    if (
      !catalogId ||
      !product.productCode ||
      !product.productName ||
      !product.basePriceMinor
    )
      return setError("Catalog, code, name and price are required.");
    const result = await organizationProductApi.saveProduct(org, {
      ...(editing ?? {}),
      productId: editing?.productId,
      productCatalogId: catalogId,
      productCode: product.productCode,
      productName: product.productName,
      description: product.description || undefined,
      sku: product.sku || undefined,
      basePriceMinor: Number(product.basePriceMinor),
      currencyCode: product.currencyCode || "CAD",
      externalProductId: product.externalProductId || undefined,
      active: true,
      versionNo: editing?.versionNo,
    });
    if (!result.success) return setError(result.error?.message);
    setShowProduct(false);
    setEditing(null);
    setProduct(emptyProduct);
    await load();
  };
  const downloadImportTemplate = () => {
    if (Platform.OS !== "web") {
      setError("Excel template download is available in Org Admin web.");
      return;
    }
    const workbook = XLSX.utils.book_new();
    const productImportSheet = XLSX.utils.aoa_to_sheet([productImportHeaders]);
    productImportSheet["!cols"] = productImportColumnWidths.map((wch) => ({ wch }));
    const instructionsSheet = XLSX.utils.aoa_to_sheet([
      ["Memgine Product Import Template"],
      ["Keep the Product Import sheet blank and enter one product per row."],
      [],
      ["Column", "Instructions"],
      [
        "Memgine Product ID",
        "Leave blank for new Products. Use only when intentionally updating a known Memgine Product.",
      ],
      [
        "External Product ID",
        "Optional. For integrations without a separate external Product ID, leave blank; SKU can be used as the integration identity.",
      ],
      [
        "Product Code",
        "Required. Must be unique within the organization/import.",
      ],
      ["Product Name", "Required."],
      [
        "SKU",
        "For integration-linked catalogs this is the primary POS Product identity. It must be unique in the import. The same Product Code with a different SKU represents a different Product and must use a unique Product Code.",
      ],
      ["UPC", "Optional."],
      ["Category External ID", "Optional."],
      ["Category Name", "Optional."],
      ["Base Price", "Required. Use a normal currency amount, for example 4.99."],
      ["Currency", "Required 3-letter ISO code, for example CAD."],
      [
        "Active",
        "TRUE/FALSE. Defaults to TRUE if the existing importer behavior supports that.",
      ],
    ]);
    instructionsSheet["!cols"] = [{ wch: 28 }, { wch: 112 }];
    XLSX.utils.book_append_sheet(workbook, productImportSheet, "Product Import");
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");

    const workbookBytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blobBytes = new Uint8Array(workbookBytes);
    const url = URL.createObjectURL(
      new Blob([blobBytes.buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = productImportTemplateFileName;
    link.click();
    URL.revokeObjectURL(url);
  };
  const selectFile = async (event: any) => {
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) return;
    setError(undefined);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      const rows = records.map((r, index) => ({
        rowNumber: index + 2,
        productId: string(r["Memgine Product ID"]),
        externalProductId: string(r["External Product ID"]),
        productCode: string(r["Product Code"]),
        productName: string(r["Product Name"]),
        sku: string(r["SKU"]),
        upc: string(r["UPC"]),
        description: string(r["Description"]),
        categoryExternalId: string(r["Category External ID"]),
        categoryName: string(r["Category Name"]),
        basePriceMinor: moneyToMinor(r["Base Price"]),
        currencyCode: (string(r["Currency"]) || "CAD").toUpperCase(),
        active: string(r["Active"]).toLowerCase() !== "false",
      }));
      setFileName(file.name);
      setImportRows(rows);
      setPreview([]);
    } catch {
      setError(
        "Unable to read this Excel workbook. Use the documented column names and a .xlsx file.",
      );
    }
  };
  const previewImport = async () => {
    if (!catalogId || !importRows.length)
      return setError("Choose a catalog and Excel file first.");
    const result = await organizationProductApi.preview(org, {
      productCatalogId: catalogId,
      fileName,
      rows: importRows,
    });
    if (!result.success) return setError(result.error?.message);
    setPreview(result.data);
  };
  const commitImport = async () => {
    if (preview.some((r) => r.classification === "ERROR")) return;
    const result = await organizationProductApi.commit(org, {
      productCatalogId: catalogId,
      fileName,
      rows: importRows,
    });
    if (!result.success) return setError(result.error?.message);
    setShowImport(false);
    setImportRows([]);
    setPreview([]);
    await load();
  };
  const importErrors = preview.filter(
    (p) => p.classification === "ERROR",
  ).length;
  if (loading)
    return (
      <View style={{ padding: theme.spacing.xl }}>
        <Text>Loading products…</Text>
      </View>
    );
  return (
    <ScrollView
      contentContainerStyle={{
        padding: theme.spacing.xl,
        gap: theme.spacing.lg,
      }}
    >
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="h1">Products</Text>
        <Text color="textMuted">
          Manage your organization’s catalog. Integration-linked products keep
          their canonical Memgine Product identity.
        </Text>
      </View>
      {error ? <Text color="danger">{error}</Text> : null}
      {successMessage ? <Text color="success">{successMessage}</Text> : null}
      <View
        style={{
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        }}
      >
        <Text variant="bodyStrong">Catalog</Text>
        {catalogs.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            {catalogs.map((item) => (
              <Pressable
                key={item.productCatalogId}
                onPress={() => setCatalogId(item.productCatalogId)}
                style={{
                  padding: theme.spacing.sm,
                  borderWidth: 1,
                  borderColor:
                    catalogId === item.productCatalogId
                      ? theme.colors.primary
                      : theme.colors.border,
                  borderRadius: theme.radius.md,
                }}
              >
                <Text variant="bodyStrong">{item.catalogName}</Text>
                <Text color="textMuted">
                  {item.integrationName
                    ? `${item.integrationName} · ${item.provider ?? "Integration"}`
                    : "Manual"}
                </Text>
              </Pressable>
            ))}
            {activeCatalog ? (
              <Button
                label="Edit Catalog"
                size="sm"
                variant="outline"
                onPress={() => openCatalog(activeCatalog)}
              />
            ) : null}
          </View>
        ) : (
          <Text color="textMuted">
            No product catalog configured yet. Create a catalog before adding or
            importing products.
          </Text>
        )}
        <Button label="Add Catalog" size="sm" onPress={() => openCatalog()} />
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: theme.spacing.sm,
          flexWrap: "wrap",
        }}
      >
        <Button
          label="Add Product"
          disabled={!catalogId}
          onPress={() => {
            setEditing(null);
            setProduct(emptyProduct);
            setShowProduct(true);
          }}
        />
        <Button
          label="Upload Excel"
          variant="outline"
          disabled={!catalogId}
          onPress={() => setShowImport(true)}
        />
        <Button
          label="Download Template"
          variant="outline"
          onPress={downloadImportTemplate}
        />
      </View>
      <DataTable
        data={products}
        keyExtractor={(p) => p.productId}
        columns={[
          {
            key: "name",
            title: "Product",
            render: (p) => (
              <View>
                <Text variant="bodyStrong">{p.productName}</Text>
                <Text color="textMuted">{p.productCode}</Text>
              </View>
            ),
          },
          {
            key: "catalog",
            title: "Catalog",
            render: (p) => <Text>{p.catalogName ?? "—"}</Text>,
          },
          {
            key: "price",
            title: "Price",
            render: (p) => (
              <Text>
                {p.basePriceMinor != null
                  ? `${p.currencyCode ?? ""} ${(p.basePriceMinor / 100).toFixed(2)}`
                  : "—"}
              </Text>
            ),
          },
          {
            key: "external",
            title: "External ID",
            render: (p) => <Text>{p.externalProductIds ?? "—"}</Text>,
          },
          {
            key: "mapping",
            title: "Mapping",
            render: (p) => {
              const health = mappingHealth(p);
              const canFix =
                health.label === "Needs attention" &&
                activeOrganizationScopeMappings(p).length > 1;
              return (
                <View>
                  <Text
                    variant={health.label === "Needs attention" ? "bodyStrong" : "body"}
                    color={health.label === "Needs attention" ? "danger" : "text"}
                  >
                    {health.label}
                  </Text>
                  {health.detail ? (
                    <Text color="textMuted">{health.detail}</Text>
                  ) : null}
                  {canFix ? (
                    <Button
                      label="Fix mapping"
                      size="sm"
                      variant="outline"
                      onPress={() => openMappingFix(p)}
                    />
                  ) : null}
                </View>
              );
            },
          },
        ]}
        actions={[
          {
            label: "Edit",
            onPress: (p) => {
              setEditing(p);
              setCatalogId(p.productCatalogId ?? catalogId);
              setProduct({
                ...p,
                basePriceMinor: String(p.basePriceMinor ?? ""),
                externalProductId: p.externalProductIds?.split(", ")[0] ?? "",
              });
              setShowProduct(true);
            },
          },
        ]}
        emptyMessage="No products yet. Add products manually or import an Excel workbook."
      />
      <Modal
        visible={mappingProduct !== null}
        onClose={() => {
          setMappingProduct(null);
          setSelectedMappingId("");
        }}
        title="Fix mapping"
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          {mappingProduct ? (
            <>
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="bodyStrong">{mappingProduct.productName}</Text>
                <Text color="textMuted">
                  Canonical Product SKU: {mappingProduct.sku || "Not set"}
                </Text>
                <Text color="textMuted">
                  {mappingProduct.integrationName ?? "Integration"} · Organization-wide
                </Text>
              </View>
              <Text color="textMuted">
                Choose the one active mapping to keep. The other active mappings in
                this Product's integration and store scope will be deactivated.
              </Text>
              {activeOrganizationScopeMappings(mappingProduct).map((mapping) => {
                const recommended = recommendedMappingIds(mappingProduct).includes(
                  mapping.mappingId,
                );
                const selected = selectedMappingId === mapping.mappingId;
                return (
                  <Pressable
                  key={mapping.mappingId}
                  onPress={() => setSelectedMappingId(mapping.mappingId)}
                  style={{
                    gap: theme.spacing.xs,
                    padding: theme.spacing.md,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    borderRadius: theme.radius.md,
                  }}
                >
                  <Text variant="bodyStrong">
                    {selected ? "●" : "○"} {mapping.externalSku || mapping.externalProductId}
                    {recommended ? "  Recommended" : ""}
                  </Text>
                  <Text color="textMuted">
                    External Product ID: {mapping.externalProductId}
                  </Text>
                  {mapping.externalSku ? (
                    <Text color="textMuted">SKU: {mapping.externalSku}</Text>
                  ) : null}
                  <Text color="textMuted">
                    Integration: {mappingProduct.integrationName ?? "Integration"}
                  </Text>
                  <Text color="textMuted">Store: Organization-wide</Text>
                </Pressable>
                );
              })}
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <Button
                  label="Cancel"
                  variant="outline"
                  onPress={() => {
                    setMappingProduct(null);
                    setSelectedMappingId("");
                  }}
                />
                <Button
                  label={resolvingMapping ? "Saving…" : "Save mapping"}
                  disabled={!selectedMappingId || resolvingMapping}
                  onPress={() => void resolveMapping()}
                />
              </View>
            </>
          ) : null}
        </View>
      </Modal>
      <Modal
        visible={showCatalog}
        onClose={() => setShowCatalog(false)}
        title={catalogEditing ? "Edit Catalog" : "Add Catalog"}
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          <Input
            label="Catalog Name"
            required
            value={catalog.catalogName ?? ""}
            onChangeText={(value) =>
              setCatalog((current: any) => ({ ...current, catalogName: value }))
            }
          />
          <Text variant="bodyStrong">Source</Text>
          {(["MANUAL", "INTEGRATION"] as const).map((source) => (
            <Pressable
              key={source}
              onPress={() =>
                setCatalog((current: any) => ({
                  ...current,
                  source,
                  integrationConfigurationId:
                    source === "MANUAL" ? "" : current.integrationConfigurationId,
                }))
              }
              style={{
                padding: theme.spacing.sm,
                borderWidth: 1,
                borderColor:
                  catalog.source === source
                    ? theme.colors.primary
                    : theme.colors.border,
                borderRadius: theme.radius.md,
              }}
            >
              <Text>{source === "MANUAL" ? "Manual" : "Integration"}</Text>
            </Pressable>
          ))}
          {catalog.source === "INTEGRATION" ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="bodyStrong">Integration Configuration</Text>
              {integrations.length ? (
                <View style={{ gap: theme.spacing.sm }}>
                  {integrations.map((integration) => (
                    <Pressable
                      key={integration.id}
                      onPress={() =>
                        setCatalog((current: any) => ({
                          ...current,
                          integrationConfigurationId: integration.id,
                        }))
                      }
                      style={{
                        padding: theme.spacing.sm,
                        borderWidth: 1,
                        borderColor:
                          catalog.integrationConfigurationId === integration.id
                            ? theme.colors.primary
                            : theme.colors.border,
                        borderRadius: theme.radius.md,
                      }}
                    >
                      <Text variant="bodyStrong">{integration.integrationName}</Text>
                      <Text color="textMuted">{integration.provider}</Text>
                    </Pressable>
                  ))}
                  <Button
                    label="Manage Integrations"
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      router.push(
                        APP_ROUTES.orgAdmin.settings.integrations(org) as never,
                      )
                    }
                  />
                </View>
              ) : (
                <View style={{ gap: theme.spacing.sm }}>
                  <Text color="textMuted">
                    No Integration Configurations are available for this organization.
                  </Text>
                  <Button
                    label="Set Up Integration"
                    size="sm"
                    onPress={() =>
                      router.push(
                        APP_ROUTES.orgAdmin.settings.integrations(org) as never,
                      )
                    }
                  />
                </View>
              )}
              <Input
                label="External Catalog ID"
                value={catalog.externalCatalogId ?? ""}
                onChangeText={(value) =>
                  setCatalog((current: any) => ({
                    ...current,
                    externalCatalogId: value,
                  }))
                }
              />
            </View>
          ) : null}
          <Checkbox
            label="Active"
            value={catalog.active !== false}
            onValueChange={(active) =>
              setCatalog((current: any) => ({ ...current, active }))
            }
          />
          <Button
            label={savingCatalog ? "Saving…" : "Save Catalog"}
            disabled={savingCatalog}
            onPress={() => void saveCatalog()}
          />
        </View>
      </Modal>
      <Modal
        visible={showProduct}
        onClose={() => setShowProduct(false)}
        title={editing ? "Edit Product" : "Add Product"}
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text color="textMuted">Catalog</Text>
          {catalogs.map((c) => (
            <Pressable
              key={c.productCatalogId}
              onPress={() => setCatalogId(c.productCatalogId)}
              style={{
                padding: theme.spacing.sm,
                borderWidth: 1,
                borderColor:
                  catalogId === c.productCatalogId
                    ? theme.colors.primary
                    : theme.colors.border,
                borderRadius: theme.radius.md,
              }}
            >
              <Text>
                {c.catalogName}
                {c.integrationName ? ` · ${c.integrationName}` : " · Manual"}
              </Text>
            </Pressable>
          ))}
          <Input
            label="Product Code"
            value={product.productCode ?? ""}
            onChangeText={(v) =>
              setProduct((p: any) => ({ ...p, productCode: v }))
            }
          />
          <Input
            label="Product Name"
            value={product.productName ?? ""}
            onChangeText={(v) =>
              setProduct((p: any) => ({ ...p, productName: v }))
            }
          />
          <Input
            label="SKU"
            value={product.sku ?? ""}
            onChangeText={(v) => setProduct((p: any) => ({ ...p, sku: v }))}
          />
          <Input
            label="Base price (major units)"
            keyboardType="decimal-pad"
            value={
              product.basePriceMinor
                ? String(Number(product.basePriceMinor) / 100)
                : ""
            }
            onChangeText={(v) =>
              setProduct((p: any) => ({
                ...p,
                basePriceMinor: String(moneyToMinor(v)),
              }))
            }
          />
          <Input
            label="Currency"
            value={product.currencyCode ?? "CAD"}
            maxLength={3}
            onChangeText={(v) =>
              setProduct((p: any) => ({ ...p, currencyCode: v.toUpperCase() }))
            }
          />
          {activeCatalog?.integrationConfigurationId ? (
            <Input
              label="External Product ID"
              value={product.externalProductId ?? ""}
              onChangeText={(v) =>
                setProduct((p: any) => ({ ...p, externalProductId: v }))
              }
            />
          ) : null}
          <Button label="Save Product" onPress={() => void save()} />
        </View>
      </Modal>
      <Modal
        visible={showImport}
        onClose={() => setShowImport(false)}
        title="Upload Product Excel"
        scrollable
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text color="textMuted">
            Choose a catalog, then upload .xlsx columns: Memgine Product ID,
            External Product ID, Product Code, Product Name, SKU, UPC,
            Description, Category External ID, Category Name, Base Price,
            Currency, Active.
          </Text>
          {catalogs.map((c) => (
            <Pressable
              key={c.productCatalogId}
              onPress={() => setCatalogId(c.productCatalogId)}
              style={{
                padding: theme.spacing.sm,
                borderWidth: 1,
                borderColor:
                  catalogId === c.productCatalogId
                    ? theme.colors.primary
                    : theme.colors.border,
                borderRadius: theme.radius.md,
              }}
            >
              <Text>{c.catalogName}</Text>
            </Pressable>
          ))}
          {Platform.OS === "web" ? (
            <input type="file" accept=".xlsx" onChange={selectFile as any} />
          ) : (
            <Text color="textMuted">
              Excel upload is available in Org Admin web.
            </Text>
          )}
          <Button
            label="Validate & Preview"
            disabled={!importRows.length}
            onPress={() => void previewImport()}
          />
          {preview.length ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text>
                {preview.length} rows:{" "}
                {preview.filter((r) => r.classification === "NEW").length} new,{" "}
                {preview.filter((r) => r.classification === "UPDATE").length}{" "}
                updates,{" "}
                {preview.filter((r) => r.classification === "UNCHANGED").length}{" "}
                unchanged, {importErrors} errors.
              </Text>
              {preview
                .filter((r) => r.classification === "ERROR")
                .map((r) => (
                  <Text key={r.rowNumber} color="danger">
                    Row {r.rowNumber}: {r.reason}
                  </Text>
                ))}
              <Button
                label="Commit Import"
                disabled={importErrors > 0}
                onPress={() => void commitImport()}
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}
