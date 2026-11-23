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
const pickup = load("frontend/src/ui/domain/counter-pickup-model.ts");
const calls = [];
const posts = [];
const { CounterApi } = load("frontend/src/data/api/counter-api.ts", {
  "./entity-status-api": {}, "./result": {},
  "./http-client": { httpClient: {
    get: (url) => { calls.push(url); return Promise.resolve({ success: true }); },
    post: (url, body) => { posts.push({ url, body }); return Promise.resolve({ success: true }); },
  } },
});
const el = React.createElement;
const host = (tag) => ({ children, testID, accessibilityState, style }) => el(tag, {
  "data-testid": testID, "data-selected": accessibilityState?.selected, style,
}, children);
const { CollectionReview, CounterOrdersPanels, CounterOrderQueue, CounterOrderDetails } = load("frontend/src/ui/domain/CounterOrdersDashboard.tsx", {
  "@expo/vector-icons": { Ionicons: () => null },
  "react-native": { Platform: { OS: "web" }, View: host("div"), ScrollView: host("section"), Pressable: host("button") },
  "@/src/core/domain/savings-display": { formatTransactionMoney: (minor, code) => minor == null ? undefined : `${code} ${minor / 100}` },
  "@/src/data/api/counter-api": { CounterApi },
  "@/src/providers": { useTheme: () => ({ colors: {}, radius: {} }) },
  "@/src/ui": {
    Card: host("article"), Text: host("span"), Badge: ({ label }) => el("span", null, label),
    Button: ({ label, disabled }) => el("button", { disabled }, label),
    StateView: ({ kind, title, message, testID }) => el("aside", { "data-state": kind, "data-testid": testID }, title, message),
  },
  "./counter-orders-model": model,
  "./collection-extension": { collectionExtensionLocalTime: () => undefined },
  "./CounterPickupLookup": { CounterPickupLookup: () => null },
});
const first = { id: "FUL_1", reference: "ORDER-100", storeId: "OSC", storeName: "OSC Store", timezone: "America/Toronto",
  status: "READY", paymentState: "PAYMENT_UNCONFIRMED", totalMinor: 932, taxMinor: 107,
  currencyCode: "CAD", placedAt: "2026-11-22T14:00:00Z", items: [{ id: "line1", name: "Cookies", quantity: 2 }], timeline: [] };
const second = { ...first, id: "FUL_2", reference: "ORDER-200", paymentState: "PAID", paymentMethod: "GOOGLE_PAY", customerName: "Sample Customer" };
const queueState = { kind: "ready", data: { orders: [first, second], total: 42, statusCounts: { READY: 42 } } };
const noop = () => {};
const queue = (state, selectedId) => el(CounterOrderQueue, { state, selectedId, independent: true, offset: 0, onSelect: noop, onPage: noop, onRetry: noop });
const detail = (data) => el(CounterOrderDetails, { state: { kind: "ready", data }, onRetry: noop });

test("authorization submits the credential in the body and collection submits only the order version", async () => {
  const api = new CounterApi();
  const ctx = { organizationId: "ORG", storeId: "OSC", staffId: "STAFF" };
  const credential = "MEMGINE_PICKUP:" + "A".repeat(43);
  await api.transitionOrder(ctx, first.id, "start-preparing", 2);
  await api.transitionOrder(ctx, first.id, "mark-ready", 3);
  await api.authorizeOrderPickup(ctx, first.id, 4, "qr", credential);
  await api.completeOrderCollection(ctx, first.id, 5);
  const [prepare, ready, authorize, collect] = posts.splice(0);
  assert.match(prepare.url, /orders\/FUL_1\/actions\/start-preparing\?.*storeId=OSC.*staffId=STAFF/);
  assert.match(ready.url, /orders\/FUL_1\/actions\/mark-ready\?/);
  assert.deepEqual(prepare.body, { version: 2 });
  assert.deepEqual(ready.body, { version: 3 });
  assert.match(collect.url, /orders\/FUL_1\/actions\/complete-collection\?/);
  assert.match(authorize.url, /orders\/FUL_1\/actions\/authorize-pickup-qr\?/);
  assert.ok(!authorize.url.includes(credential));
  assert.deepEqual(authorize.body, { version: 4, credential });
  assert.deepEqual(collect.body, { version: 5 });
});

test("collection review shows actual evidence, items and an explicit confirmation", () => {
  const lifecycle = { canCompleteCollection: true, payment: "VERIFIED_ONLINE", verificationMethod: "QR" };
  const order = { ...second, lifecycle };
  const review = (data, busy = false) => renderToStaticMarkup(el(CollectionReview, { order: data, busy, onComplete: noop }));
  assert.match(review(order), /ORDER-200.*Sample Customer.*OSC Store.*Ready for pickup.*Cookies.*Online payment verified.*Pickup QR verified.*Complete Collection/);
  assert.match(review(order, true), /<button disabled=""[^>]*>Complete Collection/);
  const unpaid = { ...order, lifecycle: { canCompleteCollection: false, payment: "PAYMENT_REQUIRED", outstandingMinor: 932 } };
  assert.match(review(unpaid), /Payment due at counter.*Outstanding.*CAD 9.32.*<button disabled=/);
  assert.doesNotMatch(renderToStaticMarkup(detail(unpaid)), /<span>Paid<\/span>/);
  assert.match(renderToStaticMarkup(detail({ ...order, status: "FULFILLED", lifecycle: { ...lifecycle, collectedAt: first.placedAt } })), /Collected/);
});

test("the scanner and reference path cannot synthesize a collection credential", () => {
  const dashboard = source("frontend/src/ui/domain/CounterOrdersDashboard.tsx");
  const scanner = source("frontend/src/ui/domain/CounterPickupLookup.tsx");
  assert.match(scanner, /match.code === "VERIFIED" && kind === "qr" \? value : undefined/);
  assert.match(scanner, /expectedOrderId && match.orderId !== expectedOrderId/);
  assert.match(dashboard, /collect\s*&&\s*\(isCounterDesk\s*\|\|\s*!lifecycle\.canCompleteCollection\s*\|\|\s*!confirmCollection\)/);
  assert.match(dashboard, /actionInFlight.current = true/);
  assert.match(dashboard, /api\.authorizeOrderPickup\(\s*context,\s*match\.orderId,\s*order\.data\.lifecycle\.version,\s*"qr",\s*credential,?\s*\)/);
  assert.doesNotMatch(dashboard + scanner, /AsyncStorage|localStorage|sessionStorage|120_000|pickupCredential =/);
});

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
  const workspace = { organizationId: "ORG", storeId: "AJX", staffId: "S1" };
  assert.equal(model.counterOrderStore(allowed, { ...workspace, storeId: "forged" }), undefined);
  assert.equal(model.counterOrderStore(allowed, { ...workspace, staffId: "unknown" }), undefined);
  assert.equal(model.counterOrderStore([], workspace), undefined);
  const selected = model.counterOrderStore(allowed, workspace);
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

test("Orders inherit the active Store and staff and remount on context changes", () => {
  const workspace = { organizationId: "ORG", storeId: "AJX", staffId: "S1" };
  const fixed = { organizationId: "ORG", storeId: "OSC", staffId: "S2" };
  assert.equal(model.counterOrdersContext("ORG", workspace), workspace);
  assert.equal(model.counterOrdersContext("ORG", workspace, fixed), fixed);
  assert.equal(model.counterOrdersContext("ORG", workspace, { ...fixed, organizationId: "other" }), undefined);
  assert.equal(model.counterOrdersContext("ORG", null), undefined);
  const route = source("frontend/app/counter/orders.tsx");
  assert.match(route, /key=\{JSON.stringify\(\[session\?\.userId, scope\.organizationId, scope\.storeId, scope\.staffId, orderId\]/);
  assert.match(route, /Open Counter workspace/);
  assert.doesNotMatch(source("frontend/src/ui/domain/CounterOrdersDashboard.tsx"), /ReferenceSelect label="Store"/);
});

test("native permissions and unavailable web cameras preserve a manual fallback", async () => {
  let requests = 0;
  const grant = async () => { requests++; return { granted: true }; };
  assert.equal(await pickup.requestPickupCameraAccess(false, false, null, grant), "granted");
  assert.equal(await pickup.requestPickupCameraAccess(false, false, { granted: false, canAskAgain: false }, grant), "denied");
  assert.equal(await pickup.requestPickupCameraAccess(true, false, null, grant), "unavailable");
  assert.equal(requests, 1);
  assert.equal(await pickup.requestPickupCameraAccess(true, true, null, async () => { throw new Error("blocked"); }), "unavailable");
  assert.equal(await pickup.requestPickupCameraAccess(true, true, null, async () => ({ granted: false })), "denied");
  const scanner = source("frontend/src/ui/domain/CounterPickupLookup.tsx");
  assert.match(scanner, /onBarcodeScanned=\{\(\{ data \}\).*submit\("qr", data, "camera"\)/);
  assert.match(scanner, /onMountError=.*[\s\S]*Use a keyboard scanner or enter the QR reference/);
  assert.match(scanner, /presentationStyle="fullScreen"/);
  assert.match(scanner, /onSubmitEditing=.*submit\("qr", qrInput\)/);
});

test("repeated camera frames and keyboard submissions are suppressed with explicit rearming", () => {
  const gate = pickup.createPickupAttemptGate();
  assert.equal(gate.begin("camera"), false);
  gate.armCamera();
  assert.equal(gate.begin("camera"), true);
  assert.equal(gate.begin("camera"), false);
  assert.equal(gate.begin("manual"), false);
  gate.finish();
  assert.equal(gate.begin("camera"), false);
  assert.equal(gate.begin("manual"), true);
  gate.finish();
  gate.armCamera();
  assert.equal(gate.begin("camera"), true);
});

test("keyboard QR input and exact order lookup use distinct body-only requests", async () => {
  const token = `MEMGINE_PICKUP:${"A".repeat(43)}`;
  const context = { organizationId: "ORG", storeId: "AJX", staffId: "S1" };
  assert.equal(pickup.pickupQrReference(` ${token}\r\n`), token);
  assert.equal(pickup.pickupQrReference("123456"), undefined);
  assert.equal(pickup.pickupQrReference(`MEMGINE_REDEMPTION:${"A".repeat(43)}`), undefined);
  assert.equal(pickup.pickupOrderReference(token), undefined);
  assert.equal(pickup.pickupOrderReference(" #RTX_00000091 "), "RTX_00000091");
  const api = new CounterApi();
  await api.verifyPickupQr(context, token);
  await api.lookupPickupOrderReference(context, "RTX_00000091");
  const [verify, find] = posts.splice(0);
  assert.equal(verify.url, "/api/v1/organizations/ORG/counter/orders/pickup/verify?storeId=AJX&staffId=S1");
  assert.deepEqual(verify.body, { credential: token });
  assert.equal(find.url, "/api/v1/organizations/ORG/counter/orders/pickup/reference?storeId=AJX&staffId=S1");
  assert.deepEqual(find.body, { reference: "RTX_00000091" });
});

test("lookup statuses give distinct recovery guidance without customer details", () => {
  for (const [code, message] of [["EXPIRED", /expired/], ["REVOKED", /revoked/], ["USED", /already been used/],
    ["WRONG_STORE", /another Store/], ["INVALID", /invalid/], ["FORBIDDEN", /current Counter access/], ["NOT_FOUND", /available at this Store/]]) {
    assert.match(pickup.pickupLookupMessage(code), message);
  }
});

test("out-of-filter matched order has an independent detail and reference is identification only", () => {
  const selected = model.counterOrderSelection("scope", { scope: "scope", id: second.id }, [first], true);
  assert.equal(selected, second.id);
  const showMatch = (kind) => renderToStaticMarkup(el(CounterOrderDetails, { state: { kind: "ready", data: second },
    pickupMatch: { kind, orderId: second.id }, outsideQueue: true, onRetry: noop }));
  assert.match(showMatch("verified"), /Pickup QR verified.*Collection has not been completed.*outside the current queue/s);
  assert.match(showMatch("reference"), /Order located by reference.*does not verify pickup/);
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
