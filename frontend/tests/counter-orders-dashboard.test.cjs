const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

const root = join(__dirname, "../..");
const source = (path) => readFileSync(join(root, path), "utf8");
function load(path, dependencies = {}) {
  const code = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => {
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

const model = load("frontend/src/ui/domain/counter-orders-model.ts");
const calls = [];
const { CounterApi } = load("frontend/src/data/api/counter-api.ts", {
  "./entity-status-api": {}, "./result": {},
  "./http-client": { httpClient: { get: (url) => { calls.push(url); return Promise.resolve({ success: true }); } } },
});
const el = React.createElement;
const host = (tag) => ({ children, testID, accessibilityState, style }) => el(tag, {
  "data-testid": testID, "data-selected": accessibilityState?.selected, style,
}, children);
const { CounterOrdersPanels, CounterOrderQueue, CounterOrderDetails } = load("frontend/src/ui/domain/CounterOrdersDashboard.tsx", {
  "@expo/vector-icons": { Ionicons: () => null },
  "react-native": { Platform: { OS: "web" }, View: host("div"), ScrollView: host("section"), Pressable: host("button") },
  "@/src/core/domain/savings-display": { formatTransactionMoney: (minor, code) => minor == null ? undefined : `${code} ${minor / 100}` },
  "@/src/data/api/counter-api": { CounterApi },
  "@/src/providers": { useTheme: () => ({ colors: {}, radius: {} }) },
  "@/src/ui": {
    Card: host("article"), Text: host("span"), Badge: ({ label }) => el("span", null, label),
    Button: ({ label }) => el("button", null, label),
    StateView: ({ kind, title, message, testID }) => el("aside", { "data-state": kind, "data-testid": testID }, title, message),
  },
  "./counter-orders-model": model,
});
const first = { id: "FUL_1", reference: "ORDER-100", storeId: "OSC", storeName: "OSC Store", timezone: "America/Toronto",
  status: "READY", paymentState: "PAYMENT_UNCONFIRMED", totalMinor: 932, taxMinor: 107,
  currencyCode: "CAD", placedAt: "2026-11-22T14:00:00Z", items: [{ id: "line1", name: "Cookies", quantity: 2 }], timeline: [] };
const second = { ...first, id: "FUL_2", reference: "ORDER-200", paymentState: "PAID", paymentMethod: "GOOGLE_PAY", customerName: "Sample Customer" };
const queueState = { kind: "ready", data: { orders: [first, second], total: 42, statusCounts: { READY: 42 } } };
const noop = () => {};
const queue = (state, selectedId) => el(CounterOrderQueue, { state, selectedId, independent: true, offset: 0, onSelect: noop, onPage: noop, onRetry: noop });
const detail = (data) => el(CounterOrderDetails, { state: { kind: "ready", data }, onRetry: noop });

test("desktop and tablet show both panels at their respective proportions, mobile renders only the queue", () => {
  const desktop = model.counterOrdersLayout(1024, 764);
  const tablet = model.counterOrdersLayout(900, 640);
  const mobile = model.counterOrdersLayout(390, 390);
  assert.deepEqual([desktop.queueFlex, desktop.detailFlex, desktop.padding], [3, 2, 28]);
  assert.equal(tablet.split, true);
  const render = (layout) => renderToStaticMarkup(el(CounterOrdersPanels, { layout, queue: queue(queueState), details: detail(first) }));
  assert.match(render(desktop), /counter-orders-split.*counter-order-queue.*counter-order-details/);
  assert.match(render(mobile), /counter-orders-mobile-queue.*counter-order-queue/);
  assert.doesNotMatch(render(mobile), /counter-order-details/);
});

test("selection updates the detail and highlight without changing filters and supports keyboard navigation", () => {
  const scope = "org:store:staff";
  assert.equal(model.counterOrderSelection(scope, undefined, [first, second], true), first.id);
  assert.equal(model.counterOrderSelection(scope, undefined, [first, second], false), undefined);
  const selected = model.counterOrderSelection(scope, { scope, id: second.id }, [first], true);
  assert.equal(selected, second.id);
  assert.equal(model.counterOrderSelection(scope, { scope, id: second.id }, [first], false), second.id);
  assert.match(renderToStaticMarkup(queue(queueState, selected)), /counter-order-FUL_2" data-selected="true"/);
  assert.match(renderToStaticMarkup(detail(second)), /ORDER-200.*Sample Customer.*Google Pay/);
  assert.doesNotMatch(renderToStaticMarkup(detail(second)), /ORDER-100/);
  assert.match(renderToStaticMarkup(detail(first)), /Payment unconfirmed/);
  assert.equal(model.counterOrderKeyboardTarget([first.id, second.id], first.id, "ArrowDown"), second.id);
  assert.equal(model.counterOrderKeyboardTarget([first.id, second.id], second.id, "Home"), first.id);
});

test("stores and filters use only authorized scope and serialize status, search, pickup date and pagination", async () => {
  const allowed = [{ id: "OSC", name: "OSC Store", staffId: "S1" }, { id: "AJX", name: "Ajax Store", staffId: "S1" }];
  assert.equal(model.counterOrderStore(allowed, "forged"), allowed[0]);
  assert.equal(model.counterOrderStore([], "OSC"), undefined);
  const selected = model.counterOrderStore(allowed, "AJX");
  const filters = model.changeCounterOrderFilters({ status: "ACTIVE", search: "", offset: 25 },
    { status: "READY", search: " order-200 ", pickupDate: "2026-11-22" });
  const api = new CounterApi();
  const context = { organizationId: "ORG", storeId: selected.id, staffId: selected.staffId };
  await api.orderStores(context.organizationId);
  await api.orders(context, filters);
  await api.order(context, "FUL_2");
  const [stores, query, order] = calls.splice(0).map((url) => new URL(url, "https://example.test"));
  assert.equal(stores.pathname, "/api/v1/organizations/ORG/counter/orders/stores");
  assert.deepEqual(Object.fromEntries(query.searchParams), {
    storeId: "AJX", staffId: "S1", status: "READY", offset: "0", limit: "25", search: "order-200", pickupDate: "2026-11-22",
  });
  assert.equal(order.pathname, "/api/v1/organizations/ORG/counter/orders/FUL_2");
  assert.deepEqual(Object.fromEntries(order.searchParams), { storeId: "AJX", staffId: "S1" });
  assert.equal(model.counterOrderSelection("org:other-store:staff", { scope: "org:store:staff", id: second.id }, [first], true), first.id);
});

test("loading, empty and authorization errors render without exposing stale orders", () => {
  assert.match(renderToStaticMarkup(queue({ kind: "loading" })), /counter-orders-loading.*Loading orders/);
  assert.match(renderToStaticMarkup(queue({ kind: "ready", data: { orders: [], total: 0, statusCounts: {} } })), /counter-orders-empty.*No matching orders/);
  const denied = renderToStaticMarkup(queue({ kind: "error", message: "Order access is unavailable for this Store" }, first.id));
  assert.match(denied, /counter-orders-error.*Order access is unavailable for this Store/);
  assert.doesNotMatch(denied, /ORDER-100/);
});

test("source contracts guard list and detail by staff and Store and keep existing Counter routes", () => {
  const sql = source("DB/liquibase/sql/309a-counter-order-reads.sql");
  assert.match(sql, /u\.user_id=p_actor.*counter_can_operate/s);
  assert.match(sql, /get_counter_order_stores\(p_org,p_actor,p_staff,p_store\).*f\.store_id=s\.store_id AND f\.organization_id=p_org/s);
  assert.match(sql, /REVOKE ALL ON FUNCTION .*get_counter_fulfillment_orders/);
  assert.match(sql, /v\.provider_transaction_id=i\.provider_reference_id AND v\.amount_minor=c\.total_minor AND v\.currency_code=c\.currency_code/);
  assert.match(sql, /r\.receipt_snapshot#>>'\{payment,completed\}'='true'/);
  const service = source("server/src/main/kotlin/com/mynikatech/memgine/component/counter/CounterService.kt");
  assert.match(service, /principal\.posContext\?\.let.*context\.storeId != storeId.*private fun readOrders.*authorize\(org, store, staff, principal\)/s);
  const routes = source("frontend/src/constants/navigation.ts");
  assert.match(routes, /name: "counter".*name: "orders".*name: "customers".*name: "pending-transactions"/s);
  const counter = source("frontend/app/counter/index.tsx");
  for (const testID of ["counter-scan-redemption-qr", "counter-redemption-start-payment", "counter-send-redemption-otp", "counter-find-phone"]) {
    assert.ok(counter.includes(testID));
  }
});

test("existing Counter pending transactions, redemption review and history keep their scoped URLs", async () => {
  const api = new CounterApi();
  const scope = { organizationId: "ORG", storeId: "OSC", staffId: "S1" };
  await api.pendingTransactions(scope, 25, 25);
  await api.redemptionCheckoutReview(scope, "RTX_id");
  await api.transactions(scope, { transactionType: "COUNTER_REDEMPTION" });
  const requests = calls.splice(0).map((url) => new URL(url, "https://example.test"));
  const prefix = "/api/v1/organizations/ORG/counter";
  assert.deepEqual(requests.map((url) => url.pathname), [
    `${prefix}/pending-transactions`, `${prefix}/redemption-transactions/RTX_id/checkout/review`, `${prefix}/transactions`,
  ]);
  assert.ok(requests.every((url) => url.searchParams.get("storeId") === "OSC" && url.searchParams.get("staffId") === "S1"));
  assert.equal(requests[0].searchParams.get("offset"), "25");
  assert.equal(requests[2].searchParams.get("transactionType"), "COUNTER_REDEMPTION");
});
