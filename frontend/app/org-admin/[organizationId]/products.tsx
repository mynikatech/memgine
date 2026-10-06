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
  const [error, setError] = useState<string>();
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
  const [importRows, setImportRows] = useState<ProductImportRow[]>([]);
  const [preview, setPreview] = useState<ProductImportPreview[]>([]);
  const [fileName, setFileName] = useState("");
  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    const [c, p, i] = await Promise.all([
      organizationProductApi.catalogs(org),
      organizationProductApi.products(org),
      apis.integrationConfiguration.list(org),
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
    setLoading(false);
  }, [org]);
  useFocusEffect(
    useCallback(() => {
    void load();
    }, [load]),
  );
  const activeCatalog = catalogs.find((c) => c.productCatalogId === catalogId);
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
