import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from "react-native";
import { useBusiness } from "@/src/providers";
import { Modal, ReferenceSelect } from "@/src/ui";
import { services } from "@/src/core";
import {
  fulfillmentConfigurationApi as api,
  type CollectionHours,
  type FulfillmentJourney,
  type FulfillmentPolicy,
  type FulfillmentReferenceChoices,
  type FulfillmentWorkflow,
  type FulfillmentWorkflowRuleChoices,
  type OrderFulfillmentPolicy,
  type OrganizationFulfillmentConfiguration,
  type StoreFulfillmentConfiguration,
} from "@/src/data/api/fulfillment-configuration-api";

type Help = (title: string, explanation: string) => void;
type StoreChoice = { id: string; name: string };
const days: (keyof CollectionHours)[] = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
];
const workflows: { id: FulfillmentWorkflow; name: string; help: string }[] = [
  { id: "NONE", name: "None", help: "No preparation stages. Staff confirm the actual handover once items are available. This does not mark items in stock or automatically fulfilled." },
  { id: "SIMPLE", name: "Simple", help: "Basic placed-to-fulfilled tracking. Handover still requires a staff action." },
  { id: "DETAILED", name: "Detailed", help: "Track placed, preparing, ready and fulfilled stages for items requiring preparation." },
];
const journeyFields: { code: FulfillmentJourney; label: string; help: string }[] = [
  { code: "IMMEDIATE_PAY_AT_COUNTER", label: "Redeem at Counter", help: "The existing Counter redemption journey. Its availability must be enforced by Counter runtime before administrators can turn it off here." },
  { code: "ADVANCE_PAY_NOW", label: "Order ahead · Pay now", help: "Allows customers to pay at the time of an advance order once the customer ordering journey is activated." },
  { code: "ADVANCE_PAY_AT_COUNTER", label: "Order ahead · Pay at Counter", help: "Allows customers to request ahead and pay at collection once the Counter journey is activated." },
];
const numberFields: { key: keyof OrderFulfillmentPolicy; label: string; help: string }[] = [
  { key: "defaultPreparationMinutes", label: "Preparation (min)", help: "Typical time needed to prepare an order; used as a starting estimate." },
  { key: "minimumLeadMinutes", label: "Minimum lead (min)", help: "Minimum time between requesting an advance order and the earliest collection time." },
  { key: "maximumHorizonMinutes", label: "Booking horizon (min)", help: "Maximum time in advance that customers can schedule collection. 10,080 minutes equals seven days." },
  { key: "collectionWindowMinutes", label: "Collection window (min)", help: "Suggested time available to collect after an item is ready or a scheduled time. It does not automatically cancel an order." },
  { key: "recommendedExtensionMinutes", label: "Extension length (min)", help: "Suggested length for each collection-time extension." },
  { key: "recommendedExtensionCount", label: "Extension count", help: "Suggested maximum number of collection-time extensions." },
  { key: "recommendedTotalExtensionMinutes", label: "Total extension (min)", help: "Suggested total extension time across all requests." },
  { key: "cancellationCutoffMinutes", label: "Cancellation cutoff (min)", help: "Guidance for how close to collection a customer may request cancellation. Requests still require applicable handling and payment checks." },
  { key: "noShowGraceMinutes", label: "No-show grace (min)", help: "Time after expected collection before staff may consider recording a no-show. This does not automatically forfeit entitlements." },
  { key: "pickupReminderLeadMinutes", label: "Reminder lead (min)", help: "How many minutes before expected collection a scheduled reminder may be sent." },
];
const controlFields: { key: keyof OrderFulfillmentPolicy; label: string; help: string }[] = [
  { key: "showExpectedCompletion", label: "Show expected completion", help: "Show the estimated preparation completion time to customers." },
  { key: "showExpectedCollection", label: "Show expected collection", help: "Show the expected pickup time to customers." },
  { key: "customerExtensionRequestsEnabled", label: "Allow collection change requests", help: "Customers may request a change to their collection time; approval is a separate decision." },
  { key: "extensionOverrideAdminOnly", label: "Admin-only extension overrides", help: "Only Organization Admins may authorize extensions beyond the usual guidance." },
  { key: "customerCancellationRequestsEnabled", label: "Allow cancellation requests", help: "Customers may request cancellation; it does not automatically approve or refund an order." },
  { key: "staffNoShowRecordingEnabled", label: "Staff may record no-shows", help: "Allows authorized staff to record when a customer has not arrived for collection." },
];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const errorMessage = (error: { message: string } | undefined, fallback: string) => error?.message ?? fallback;

function diffOrder(base: OrderFulfillmentPolicy, current: OrderFulfillmentPolicy): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(current) as (keyof OrderFulfillmentPolicy)[]) {
    if (key === "journeys") {
      const journeys: Record<string, boolean> = {};
      for (const journey of Object.keys(current.journeys) as FulfillmentJourney[]) {
        if (current.journeys[journey] !== base.journeys[journey]) journeys[journey] = current.journeys[journey];
      }
      if (Object.keys(journeys).length) changes.journeys = journeys;
    } else if (key === "collectionHours") {
      if (JSON.stringify(current.collectionHours) !== JSON.stringify(base.collectionHours) && current.collectionHours) {
        changes.collectionHours = current.collectionHours;
      }
    } else if (JSON.stringify(current[key]) !== JSON.stringify(base[key])) {
      changes[key] = current[key];
    }
  }
  return changes;
}

function InfoButton({ title, help, onHelp }: { title: string; help: string; onHelp: Help }) {
  return <Pressable onPress={() => onHelp(title, help)} hitSlop={8} accessibilityRole="button"
    accessibilityLabel={`About ${title}`} style={styles.infoButton}>
    <Ionicons name="information-circle-outline" size={18} color="#547390" />
  </Pressable>;
}
function InfoLabel({ title, help, onHelp, small = false }: {
  title: string; help: string; onHelp: Help; small?: boolean;
}) {
  return <View style={styles.infoLabel}>
    <Text style={small ? styles.smallLabel : styles.rowLabel}>{title}</Text>
    <InfoButton title={title} help={help} onHelp={onHelp} />
  </View>;
}
function ToggleRow({ title, help, value, disabled, onChange, onHelp }: {
  title: string; help: string; value: boolean; disabled?: boolean;
  onChange: (value: boolean) => void; onHelp: Help;
}) {
  return <View style={styles.toggleRow}>
    <InfoLabel title={title} help={help} onHelp={onHelp} />
    <Switch value={value} disabled={disabled} onValueChange={onChange}
      style={styles.compactSwitch} />
  </View>;
}
function Chip({ title, selected, onPress, disabled = false }: {
  title: string; selected: boolean; onPress: () => void; disabled?: boolean;
}) {
  return <Pressable onPress={onPress} disabled={disabled}
    style={[styles.chip, selected && styles.chipActive, disabled && styles.faded]}>
    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{title}</Text>
  </Pressable>;
}
function Panel({ title, help, children, open, toggle, onHelp }: {
  title: string; help: string; children: ReactNode; open: boolean;
  toggle: () => void; onHelp: Help;
}) {
  return <View style={styles.panel}>
    <View style={styles.panelHeading}>
      <Pressable onPress={toggle} style={styles.panelToggle} accessibilityRole="button">
        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={17} color="#36536E" />
        <Text style={styles.panelTitle}>{title}</Text>
      </Pressable>
      <InfoButton title={title} help={help} onHelp={onHelp} />
    </View>
    {open && <View style={styles.panelBody}>{children}</View>}
  </View>;
}

export default function FulfillmentAdminSettings() {
  const { organization } = useBusiness();
  const orgId = organization.id;
  const [orgConfig, setOrgConfig] = useState<OrganizationFulfillmentConfiguration | null>(null);
  const [storeConfig, setStoreConfig] = useState<StoreFulfillmentConfiguration | null>(null);
  const [stores, setStores] = useState<StoreChoice[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [references, setReferences] = useState<FulfillmentReferenceChoices>({});
  const [rules, setRules] = useState<FulfillmentWorkflowRuleChoices | null>(null);
  const [draft, setDraft] = useState<FulfillmentPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [help, setHelp] = useState<{ title: string; explanation: string } | null>(null);
  const [openPanels, setOpenPanels] = useState<string[]>(["workflow"]);
  const [catalogId, setCatalogId] = useState("");
  const [targetKind, setTargetKind] = useState<"CATEGORY" | "PRODUCT">("CATEGORY");
  const [categoryId, setCategoryId] = useState("");
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [ruleChoice, setRuleChoice] = useState<string | null>(null);

  const onHelp: Help = (title, explanation) => setHelp({ title, explanation });
  const togglePanel = (key: string) => setOpenPanels((prior) => prior.includes(key) ? prior.filter((k) => k !== key) : [...prior, key]);
  const panelOpen = (key: string) => openPanels.includes(key);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [org, refs, list, workflowRules] = await Promise.all([
        api.organization(orgId), api.references(orgId), services.organization.listStores(orgId), api.workflowRules(orgId),
      ]);
      if (!org.success) throw new Error(errorMessage(org.error, "Cannot load fulfillment settings"));
      if (!refs.success) throw new Error(errorMessage(refs.error, "Cannot load choices"));
      if (!workflowRules.success) throw new Error(errorMessage(workflowRules.error, "Cannot load catalog rules"));
      setOrgConfig(org.data);
      setReferences(refs.data);
      setStores(list.map((s) => ({ id: s.id, name: s.name })));
      setRules(workflowRules.data);
      setDraft(clone(org.data.effectivePolicy));
      setSelectedStore("");
      setStoreConfig(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const selectScope = async (storeId: string) => {
    if (saving || ruleSaving) return;
    setSelectedStore(storeId);
    setMessage("");
    setError("");
    setRuleChoice(null);
    setProductId("");
    setCategoryId("");
    setCatalogId("");
    setProductSearch("");
    if (!orgConfig) return;
    setLoading(true);
    try {
      const [storeResult, ruleResult] = await Promise.all([
        storeId ? api.store(orgId, storeId) : Promise.resolve(null), api.workflowRules(orgId, storeId),
      ]);
      if (storeResult && !storeResult.success) throw new Error(errorMessage(storeResult.error, "Cannot load Store settings"));
      if (!ruleResult.success) throw new Error(errorMessage(ruleResult.error, "Cannot load workflow rules"));
      setStoreConfig(storeResult?.data ?? null);
      setDraft(clone(storeResult?.data.effectivePolicy ?? orgConfig.effectivePolicy));
      setRules(ruleResult.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };

  const changeOrder = (fn: (order: OrderFulfillmentPolicy) => OrderFulfillmentPolicy) => {
    setDraft((prior) => prior ? ({
      ...prior, fulfillmentTypes: { ...prior.fulfillmentTypes, ORDER: fn(prior.fulfillmentTypes.ORDER) },
    }) : null);
    setMessage("");
  };
  const order = draft?.fulfillmentTypes.ORDER;
  const orgOrder = orgConfig?.effectivePolicy.fulfillmentTypes.ORDER;

  const save = async () => {
    if (!draft || !orgConfig) return;
    setSaving(true);
    setError(""); setMessage("");
    try {
      if (selectedStore) {
        if (!storeConfig || !orgOrder) throw new Error("Store settings have not loaded");
        const changes = diffOrder(orgOrder, draft.fulfillmentTypes.ORDER);
        const overrides = Object.keys(changes).length ? { fulfillmentTypes: { ORDER: changes } } : {};
        const result = await api.saveStore(orgId, selectedStore, overrides, storeConfig.versionNo);
        if (!result.success) throw new Error(errorMessage(result.error, "Could not save Store settings"));
        setStoreConfig(result.data);
        setDraft(clone(result.data.effectivePolicy));
      } else {
        const result = await api.saveOrganization(orgId, draft, orgConfig.versionNo);
        if (!result.success) throw new Error(errorMessage(result.error, "Could not save organization settings"));
        setOrgConfig(result.data);
        setDraft(clone(result.data.effectivePolicy));
      }
      setMessage("Settings saved.");
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      setError(msg); Alert.alert("Unable to save", msg);
    } finally { setSaving(false); }
  };

  const catalogs = useMemo(() => {
    const unique = new Map<string, { id: string; name: string }>();
    for (const category of rules?.categories ?? []) {
      unique.set(category.catalogId, { id: category.catalogId, name: category.catalogName });
    }
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rules]);
  const categories = useMemo(() => (rules?.categories ?? [])
    .filter((category) => !catalogId || category.catalogId === catalogId)
    .map((category) => ({
      id: category.categoryId,
      name: `${category.categoryName} (${category.productCount} products)${catalogId ? "" : ` · ${category.catalogName}`}`,
    })), [rules, catalogId]);
  const products = useMemo(() => (rules?.products ?? []).map((product) => ({
    id: product.productId,
    name: `${product.productName} · ${product.catalogName}${product.categoryName ? ` / ${product.categoryName}` : ""}`,
  })), [rules]);
  const targetId = targetKind === "CATEGORY" ? categoryId : productId;
  const selectedCategory = (rules?.categories ?? []).find((category) => category.categoryId === categoryId);
  const effectiveTargetKind = targetKind === "PRODUCT" ? "PRODUCT" : (selectedCategory?.targetKind ?? "CATEGORY");
  const savedRule = (rules?.rules ?? []).find((rule) => rule.targetKind === effectiveTargetKind
    && rule.targetId === targetId && (rule.storeId ?? "") === selectedStore);
  const currentRuleChoice = ruleChoice ?? savedRule?.workflow ?? "INHERIT";

  const loadProductSearch = async () => {
    setError("");
    setProductId(""); setRuleChoice(null);
    try {
      const result = await api.workflowRules(orgId, selectedStore, productSearch.trim());
      if (!result.success) throw new Error(errorMessage(result.error, "Product search failed"));
      setRules(result.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const saveRule = async () => {
    if (!targetId) return;
    setRuleSaving(true); setError(""); setMessage("");
    try {
      const result = await api.saveWorkflowRule(orgId, {
        storeId: selectedStore || null, targetKind: effectiveTargetKind, targetId,
        workflow: currentRuleChoice === "INHERIT" ? null : currentRuleChoice as FulfillmentWorkflow,
        versionNo: savedRule?.versionNo ?? 0,
      });
      if (!result.success) throw new Error(errorMessage(result.error, "Cannot save workflow rule"));
      const refreshed = await api.workflowRules(orgId, selectedStore, targetKind === "PRODUCT" ? productSearch.trim() : "");
      if (!refreshed.success) throw new Error(errorMessage(refreshed.error, "Cannot reload workflow rules"));
      setRules(refreshed.data);
      setRuleChoice(null);
      setMessage("Workflow rule saved.");
    } catch (cause) { const msg = cause instanceof Error ? cause.message : String(cause); setError(msg); Alert.alert("Unable to save", msg); }
    finally { setRuleSaving(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text>Loading fulfillment settings…</Text></View>;
  if (!draft) return <View style={styles.center}><Text>{error || "Configuration unavailable"}</Text><Pressable onPress={() => void reload()}><Text>Retry</Text></Pressable></View>;

  return <View style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        <Text style={styles.title}>Fulfillment</Text>
        <InfoButton title="Fulfillment settings"
          help="Choose organization-wide defaults and optional Store or catalog exceptions. A workflow describes how items are tracked; it does not prove availability, payment or handover."
          onHelp={onHelp} />
      </View>
      <Text style={styles.helperLine}>Set one Organization default. Store, POS category and product overrides are optional.</Text>
      <View style={styles.scopeSelector}>
        <InfoLabel title="Configuration scope" small onHelp={onHelp}
          help="Organization defaults apply everywhere without further setup. If a Store needs different rules, select it here. Store, imported POS category and individual product overrides are all optional." />
        <View style={styles.scopeDropdown}>
          <ReferenceSelect value={selectedStore}
            items={[{ id: "", name: "Organization defaults" }, ...stores]}
            onChange={(id) => { void selectScope(id); }}
            placeholder="Organization defaults" />
        </View>
      </View>
      {order && <>
        <Panel title="Essentials & customer journeys" open={panelOpen("essentials")}
          toggle={() => togglePanel("essentials")} onHelp={onHelp}
          help="Choose which order journeys are allowed. Currently available journeys remain subject to the business’s Counter setup and access rules.">
          <ToggleRow title="Enable Order" help="Order fulfillment is configured here. Availability of existing Counter redemption is managed by its Counter permissions and cannot be disabled from this setting."
            onHelp={onHelp} value={order.enabled} disabled
            onChange={(enabled) => changeOrder((current) => ({ ...current, enabled }))} />
          {journeyFields.map((journey) => <ToggleRow key={journey.code} title={journey.label}
            help={journey.help} onHelp={onHelp} value={order.journeys[journey.code]}
            disabled={journey.code === "IMMEDIATE_PAY_AT_COUNTER" || (!!selectedStore && !orgOrder?.journeys[journey.code])}
            onChange={(enabled) => changeOrder((current) => ({ ...current, journeys: { ...current.journeys, [journey.code]: enabled } }))} />)}
        </Panel>

        <Panel title="Workflow & handover" open={panelOpen("workflow")}
          toggle={() => togglePanel("workflow")} onHelp={onHelp}
          help="Set the normal workflow. None requires only a verified handover, Simple records basic progress, and Detailed records preparation and readiness. Store and catalog rules may override this default.">
          <InfoLabel title="Default workflow" help="Applies unless a Store, Poynt catalog category or individual product has a more specific rule." onHelp={onHelp} />
          <View style={styles.chips}>{workflows.map((item) => <View key={item.id} style={styles.workflowOption}>
            <Chip title={item.name} selected={order.workflow === item.id}
              onPress={() => changeOrder((current) => ({ ...current, workflow: item.id }))} />
            <InfoButton title={`${item.name} workflow`} help={item.help} onHelp={onHelp} />
          </View>)}</View>
          <ToggleRow title="Allow partial handover" value={order.partialHandoverEnabled ?? false}
            onHelp={onHelp}
            help="Allow staff to confirm only the available items, leaving the rest pending. An unavailable item may have a reason and estimated availability time. No item is handed over automatically, including under None."
            onChange={(enabled) => changeOrder((current) => ({ ...current, partialHandoverEnabled: enabled }))} />
          <View style={styles.inlineRow}>
            <View style={styles.column}>
              <InfoLabel title="Customer-facing label" help="The wording shown to customers; the underlying fulfillment type remains Order." onHelp={onHelp} small />
              <ReferenceSelect value={order.customerLabel}
                items={(references.FULFILLMENT_TYPE ?? []).filter((choice) => choice.supported)
                  .map((choice) => ({ id: choice.label, name: choice.label }))}
                onChange={(customerLabel) => changeOrder((current) => ({ ...current, customerLabel }))} />
            </View>
            <View style={styles.column}>
              <InfoLabel title="Collection scheduling" help="ASAP means as soon as possible. Scheduled allows customers to select a future collection slot, within the configured limits." onHelp={onHelp} small />
              <View style={styles.chips}>
                <Chip title="ASAP" selected={order.collectionPolicy === "ASAP_ONLY"}
                  onPress={() => changeOrder((current) => ({ ...current, collectionPolicy: "ASAP_ONLY" }))} />
                <Chip title="Scheduled" selected={order.collectionPolicy === "ASAP_OR_SCHEDULED"}
                  onPress={() => changeOrder((current) => ({ ...current, collectionPolicy: "ASAP_OR_SCHEDULED" }))} />
              </View>
            </View>
          </View>
        </Panel>

        <Panel title="Advanced overrides (optional)" open={panelOpen("catalog")}
          toggle={() => togglePanel("catalog")} onHelp={onHelp}
          help="Optional. Organization defaults work across all Stores. Select a Store only when it needs exceptions. Poynt categories use that Store's actual synced catalog; individual product exceptions are optional. No new category records are required.">
          <View style={styles.inlineRow}>
            <View style={styles.column}>
              <InfoLabel title="Rule applies to" help="Category rules cover all mapped products in that category. Product rules override the category for one exceptional item." onHelp={onHelp} small />
              <View style={styles.chips}>
                <Chip title="Category" selected={targetKind === "CATEGORY"} onPress={() => { setTargetKind("CATEGORY"); setRuleChoice(null); }} />
                <Chip title="Product exception" selected={targetKind === "PRODUCT"} onPress={() => { setTargetKind("PRODUCT"); setRuleChoice(null); }} />
              </View>
            </View>
            {targetKind === "CATEGORY" && <View style={styles.column}>
              <InfoLabel title="Poynt / POS catalog" help="Select a synced catalogue to see its real category names. Categories with the same name in different catalogs remain distinct." onHelp={onHelp} small />
              <ReferenceSelect value={catalogId} items={catalogs} allowClear placeholder="All catalogs"
                onChange={(id) => { setCatalogId(id); setCategoryId(""); setRuleChoice(null); }} />
            </View>}
          </View>
          {targetKind === "CATEGORY" ? <>
            {!selectedStore && <Text style={styles.helperLine}>Poynt category exceptions are available after selecting a Store above. Organization defaults require no Store setup.</Text>}
            <InfoLabel title="Existing category" help="Existing Memgine categories can be configured at Organization scope. For Poynt categories, select a Store first: its synced category identity includes the integration and external catalog, preventing rules from spilling into unrelated Stores." onHelp={onHelp} small />
            <ReferenceSelect value={categoryId} items={categories} placeholder="Choose a catalog category"
              onChange={(id) => { setCategoryId(id); setRuleChoice(null); }} />
          </> : <>
            <InfoLabel title="Find exceptional product" help="The first 100 products load automatically. Search by name, SKU or product code for more. Selecting a Store limits choices to linked products in that Store, as on the Products tab." onHelp={onHelp} small />
            <View style={styles.searchRow}>
              <TextInput value={productSearch} onChangeText={setProductSearch}
                placeholder="Search products (first 100 shown)" style={styles.searchInput} onSubmitEditing={() => void loadProductSearch()} />
              <Pressable onPress={() => void loadProductSearch()} style={styles.secondaryAction}><Text style={styles.actionText}>Search</Text></Pressable>
            </View>
            <ReferenceSelect value={productId} items={products} placeholder="Select a product"
              onChange={(id) => { setProductId(id); setRuleChoice(null); }} />
          </>}
          {!!targetId && <View style={styles.ruleEditor}>
            <InfoLabel title="Workflow for selection" onHelp={onHelp} small
              help="Inherit removes the explicit rule, allowing the next applicable product, category, Store or organization default to apply." />
            <ReferenceSelect value={currentRuleChoice}
              items={[{ id: "INHERIT", name: "Inherit default" }, ...workflows.map((w) => ({ id: w.id, name: w.name }))]}
              onChange={setRuleChoice} />
            <Pressable onPress={() => void saveRule()} disabled={ruleSaving || currentRuleChoice === (savedRule?.workflow ?? "INHERIT")}
              style={[styles.secondaryAction, (ruleSaving || currentRuleChoice === (savedRule?.workflow ?? "INHERIT")) && styles.faded]}>
              <Text style={styles.actionText}>{ruleSaving ? "Saving…" : "Save workflow rule"}</Text>
            </Pressable>
          </View>}
          <Text style={styles.helperLine}>{(rules?.categories ?? []).length} existing catalog categories · {(rules?.rules ?? []).filter((r) => (r.storeId ?? "") === selectedStore).length} custom workflow rules in this scope.</Text>
        </Panel>

        <Panel title="Timing & guidance" open={panelOpen("timing")}
          toggle={() => togglePanel("timing")} onHelp={onHelp}
          help="Configure expected preparation, lead times, collection windows, extensions, cancellation and no-show guidance. These values do not automatically cancel, refund or consume an entitlement.">
          <View style={styles.numbers}>{numberFields.map((field) => <View key={field.key} style={styles.numberCell}>
            <InfoLabel title={field.label} help={field.help} onHelp={onHelp} small />
            <TextInput keyboardType="number-pad" style={styles.input}
              value={String(order[field.key] ?? 0)}
              onChangeText={(value) => changeOrder((current) => ({ ...current, [field.key]: value === "" ? 0 : Number(value) }))} />
          </View>)}</View>
        </Panel>

        <Panel title="Customer & staff controls" open={panelOpen("controls")}
          toggle={() => togglePanel("controls")} onHelp={onHelp}
          help="Control what customers may request and what staff may record. A request is not an automatic approval or financial transaction.">
          <View style={styles.twoColumns}>{controlFields.map((field) => <View key={field.key} style={styles.halfColumn}>
            <ToggleRow title={field.label} help={field.help} onHelp={onHelp} value={Boolean(order[field.key])}
              onChange={(enabled) => changeOrder((current) => ({ ...current, [field.key]: enabled }))} />
          </View>)}</View>
        </Panel>

        <Panel title="Customer notifications" open={panelOpen("notifications")}
          toggle={() => togglePanel("notifications")} onHelp={onHelp}
          help="Each event is independent. You may enable only cancellation, only readiness, or any combination. Delivery also requires a supported event and configured notification channels.">
          <View style={styles.twoColumns}>
            {(references.FULFILLMENT_NOTIFICATION_EVENT ?? []).map((event) => <View key={event.code} style={styles.halfColumn}>
              <ToggleRow title={event.label} onHelp={onHelp}
                help={`Requests a customer notification when the '${event.label}' event occurs. Other events can remain disabled. Actual delivery depends on enabled channels.`}
                value={order.notificationEvents.includes(event.code)}
                onChange={(enabled) => changeOrder((current) => ({ ...current,
                  notificationEvents: enabled ? [...current.notificationEvents, event.code]
                    : current.notificationEvents.filter((code) => code !== event.code),
                }))} />
            </View>)}
          </View>
        </Panel>

        {!!selectedStore && <Panel title="Store collection hours" open={panelOpen("hours")}
          toggle={() => togglePanel("hours")} onHelp={onHelp}
          help="Optional weekday-specific collection hours using local Store time. Empty windows mean no collection on that day. Unchanged values inherit the existing policy.">
          <View style={styles.dayHeader}><InfoLabel title="Collection windows (HH:MM)" onHelp={onHelp} small
            help="Set one local-time collection window per day. A blank start or end closes that weekday. These are separate from the Store's POS opening hours." /></View>
          <View style={styles.dayGrid}>{days.map((day) => {
            const window = (order.collectionHours?.[day] ?? [])[0];
            return <View key={day} style={styles.dayRow}>
              <Text style={styles.dayText}>{day.slice(0, 3)}</Text>
              <TextInput style={styles.timeInput} placeholder="09:00" value={window?.start ?? ""}
                onChangeText={(value) => changeOrder((current) => ({ ...current,
                  collectionHours: { ...current.collectionHours,
                    [day]: value ? [{ start: value, end: window?.end ?? "17:00" }] : [],
                  },
                }))} />
              <Text style={styles.smallLabel}>–</Text>
              <TextInput style={styles.timeInput} placeholder="17:00" value={window?.end ?? ""}
                onChangeText={(value) => changeOrder((current) => ({ ...current,
                  collectionHours: { ...current.collectionHours,
                    [day]: value ? [{ start: window?.start ?? "09:00", end: value }] : [],
                  },
                }))} />
            </View>;
          })}</View>
        </Panel>}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
        <View style={styles.footer}>
          <Pressable style={[styles.primaryAction, saving && styles.faded]} disabled={saving} onPress={() => void save()}>
            <Text style={styles.primaryText}>{saving ? "Saving…" : selectedStore ? "Save Store defaults" : "Save Organization defaults"}</Text>
          </Pressable>
          {!!selectedStore && <Pressable style={styles.secondaryAction}
            onPress={() => { if (orgConfig) setDraft(clone(orgConfig.effectivePolicy)); }}>
            <Text style={styles.actionText}>Reset draft</Text>
          </Pressable>}
        </View>
      </>}
    </ScrollView>
    <Modal visible={!!help} onClose={() => setHelp(null)} title={help?.title ?? "Information"}>
      <Text style={styles.helpText}>{help?.explanation}</Text>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: 14, paddingBottom: 36, maxWidth: 1060, width: "100%", alignSelf: "center", gap: 8 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  heading: { flexDirection: "row", alignItems: "center", gap: 4 },
  title: { fontSize: 22, fontWeight: "700", color: "#10243C" },
  scopeSelector: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 3 },
  scopeDropdown: { minWidth: 225, flexGrow: 1, flexBasis: "45%", maxWidth: 430 },
  infoButton: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  infoLabel: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0, gap: 1 },
  rowLabel: { color: "#263E54", fontSize: 13, flexShrink: 1 },
  smallLabel: { color: "#30465E", fontSize: 12, fontWeight: "600", flexShrink: 1 },
  panel: { borderWidth: 1, borderColor: "#DCE5ED", backgroundColor: "white", borderRadius: 10, overflow: "hidden" },
  panelHeading: { flexDirection: "row", alignItems: "center", minHeight: 40, paddingRight: 8 },
  panelToggle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, paddingVertical: 9 },
  panelTitle: { fontSize: 15, fontWeight: "700", color: "#163650" },
  panelBody: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 12, gap: 6, borderTopWidth: 1, borderTopColor: "#EDF2F6" },
  toggleRow: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#E8EDF2", gap: 6 },
  compactSwitch: { transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: "#DAE2EA", backgroundColor: "#F3F6F9", paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8 },
  chipActive: { borderColor: "#2875A9", backgroundColor: "#DDECF8" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#294257" },
  chipTextActive: { color: "#15557E" },
  faded: { opacity: 0.45 },
  workflowOption: { flexDirection: "row", alignItems: "center", gap: 0 },
  inlineRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  column: { flexGrow: 1, flexBasis: "45%", minWidth: 215, gap: 3 },
  numbers: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 7 },
  numberCell: { minWidth: 172, flexGrow: 1, flexBasis: "28%", gap: 2 },
  input: { backgroundColor: "white", borderRadius: 7, borderWidth: 1, borderColor: "#CFDCE5", paddingHorizontal: 10, paddingVertical: 7, height: 38, color: "#263E54" },
  twoColumns: { flexDirection: "row", flexWrap: "wrap", columnGap: 16 },
  halfColumn: { minWidth: 235, flexBasis: "45%", flexGrow: 1 },
  ruleEditor: { borderTopWidth: 1, borderColor: "#E4EBF0", paddingTop: 9, gap: 5 },
  searchRow: { flexDirection: "row", gap: 6 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: "#CFDCE5", borderRadius: 7, paddingHorizontal: 10, color: "#263E54" },
  primaryAction: { alignSelf: "flex-start", backgroundColor: "#1B5D95", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  primaryText: { color: "white", fontSize: 13, fontWeight: "700" },
  secondaryAction: { alignSelf: "flex-start", borderWidth: 1, borderColor: "#B6CDDE", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#EBF4FB" },
  actionText: { fontSize: 12, color: "#195581", fontWeight: "700" },
  helperLine: { fontSize: 11, color: "#60758A", marginTop: 3 },
  dayHeader: { paddingBottom: 3 },
  dayGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 5 },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 235, flexBasis: "45%" },
  dayText: { width: 35, fontSize: 12, fontWeight: "700", color: "#324C63" },
  timeInput: { flex: 1, maxWidth: 82, paddingHorizontal: 7, paddingVertical: 6, height: 34, borderRadius: 7, borderWidth: 1, borderColor: "#D1DCE5", color: "#263E54" },
  footer: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingTop: 5 },
  error: { color: "#B91C1C", fontSize: 12 },
  success: { color: "#16734C", fontSize: 12 },
  helpText: { fontSize: 15, lineHeight: 23, color: "#263E54" },
});
