const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(source, dependencies = {}) {
  const content = readFileSync(join(__dirname, "../src", source), "utf8");
  const compiled = ts.transpileModule(content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, (name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  });
  return exports;
}

const { collectCompletion, collectRecoveryUrl, collectReloadUrl, collectReturnUrl, collectStatusMatchesIntent, customerFulfillmentReturnPath,
  verifiedFulfillmentDestination } = load("core/services/fulfillment-collect-navigation.ts");
const { isCustomerOnlySession, landingFor } = load("core/auth/auth-navigation.ts", {
  "@/src/constants/navigation": { APP_ROUTES: { customer: { cards: "/customer/cards" }, workspaces: "/workspaces" } },
  "react-native": { Platform: { OS: "web" } },
});
const { fulfillmentContentWidth, fulfillmentPageGutter, redemptionContentWidth, entitlementUnavailableLabel,
  reservationLabel, receiptLineSubtotals, receiptLineKey, activeCounterQrForSelection, isWideFulfillmentLayout } = load("ui/domain/fulfillment-presentation.ts");

const payment = {
  paymentIntentId: "PAY_order", providerCode: "POYNT_COLLECT", status: "SUCCEEDED",
  fulfillmentCheckout: { organizationId: "ORG_bakery", subscriptionId: "SUB_silver", fulfillmentId: "FUL_exact" },
};
const reconciled = { payment: { paymentIntentId: payment.paymentIntentId, subscriptionId: "SUB_silver", status: "SUCCEEDED" },
  fulfillment: { id: "FUL_exact" } };

for (const [method, platform] of [["card", "web"], ["Google Pay", "native"]]) {
  test(`${method} confirmation returns to the exact server-owned order on ${platform}`, () => {
    const confirmation = { payment };
    assert.equal(collectCompletion(confirmation), "fulfillment");
    const callback = new URL(collectReturnUrl(platform, payment), "https://memgine.example");
    assert.equal(callback.protocol, platform === "web" ? "https:" : "memgine:");
    assert.equal(callback.searchParams.get("intent"), payment.paymentIntentId);
    assert.deepEqual(verifiedFulfillmentDestination(reconciled, callback.searchParams.get("org"),
      callback.searchParams.get("intent"), "details"), {
      pathname: "/business/fulfillment", params: { org: "ORG_bakery", subscription: "SUB_silver", view: "details", id: "FUL_exact" },
    });
  });
}

test("customer-only web sessions land on customer cards", () => {
  const customer = { access: [{ organizationId: "ORG_bakery", capabilities: ["CUSTOMER_ACCESS"] }] };
  assert.equal(isCustomerOnlySession(customer), true);
  assert.equal(landingFor(customer), "/customer/cards");
  assert.equal(isCustomerOnlySession({ ...customer, posContext: {} }), false);
});

test("reload and Back preserve local return routes and reject another checkout's cookie status", () => {
  const callback = collectReturnUrl("web", payment);
  const href = "/business/fulfillment?org=ORG_bakery&subscription=SUB_silver&view=details&id=FUL_exact";
  assert.equal(customerFulfillmentReturnPath(callback), callback);
  assert.equal(customerFulfillmentReturnPath(href), href);
  assert.equal(customerFulfillmentReturnPath("//other.example/payment-return?x=1"), undefined);
  assert.equal(collectStatusMatchesIntent({ payment }, payment.paymentIntentId), true);
  assert.equal(collectStatusMatchesIntent({ payment }, "PAY_other"), false);
  const cleaned = new URL(collectReloadUrl("web", payment), "https://memgine.example");
  assert.equal(cleaned.searchParams.has("session"), false);
  assert.equal(cleaned.searchParams.get("fulfillmentReturn"), "web");
  const fallback = collectRecoveryUrl("web", cleaned.searchParams.get("org"), cleaned.searchParams.get("subscription"), cleaned.searchParams.get("intent"));
  assert.equal(fallback, "/payment-return?fulfillmentPayment=1&org=ORG_bakery&subscription=SUB_silver&intent=PAY_order");
});

test("pending and verified-capture recovery never treat a callback as an accepted order", () => {
  const unresolved = { ...payment, status: "PROCESSING",
    fulfillmentCheckout: { ...payment.fulfillmentCheckout, fulfillmentId: undefined, verifiedCapture: true } };
  assert.equal(collectCompletion({ payment: unresolved }), undefined);
  assert.equal(collectCompletion({ payment: { ...unresolved, status: "SUCCEEDED" } }), undefined);
  assert.equal(new URL(collectReturnUrl("web", unresolved), "https://memgine.example").searchParams.has("view"), false);
  for (const status of ["PENDING", "PROCESSING"]) {
    assert.equal(verifiedFulfillmentDestination({ ...reconciled, payment: { ...reconciled.payment, status } },
      "ORG_bakery", payment.paymentIntentId, "details").params.view, "payment");
  }
  assert.equal(verifiedFulfillmentDestination(reconciled, "ORG_bakery", "PAY_other", "details"), undefined);
});

test("membership confirmation retains its subscription requirement and native return", () => {
  const membership = { ...payment, membershipPlanId: "PLAN_gold", fulfillmentCheckout: null };
  assert.equal(collectCompletion({ payment: membership }), undefined);
  assert.equal(collectCompletion({ payment: membership, subscription: { subscriptionId: "SUB_new" } }), "membership");
  assert.equal(collectReturnUrl("native", membership, true), "memgine://payment-return?cancelPayment=1");
});

test("reservation status stays actionable separately from genuine exhaustion and unused capacity", () => {
  assert.equal(reservationLabel("Order", "RTX_000081"), "Reserved for Order RTX_000081");
  assert.equal(entitlementUnavailableLabel("LIMIT_REACHED", "Usage limit reached", true), undefined);
  assert.equal(entitlementUnavailableLabel("LIMIT_REACHED", "Usage limit reached", false), "Usage limit reached");
  assert.equal(entitlementUnavailableLabel("AVAILABLE", null, true), undefined);
  assert.equal(entitlementUnavailableLabel("UNAVAILABLE_TODAY", "Unavailable today", true), "Unavailable today");
});

test("mobile gutters leave usable space while desktop order and redemption content stay bounded", () => {
  assert.equal(fulfillmentPageGutter(360), 16);
  assert.equal(fulfillmentPageGutter(1440), 24);
  assert.ok(fulfillmentContentWidth < redemptionContentWidth && redemptionContentWidth < 1440);
  assert.equal(isWideFulfillmentLayout(390), false);
  assert.equal(isWideFulfillmentLayout(1280), true);
});

test("only a live QR for an overlapping item blocks a new redemption", () => {
  const now = Date.parse("2026-11-22T10:00:00Z");
  const expired = { transactionId: "expired", expiresAt: "2026-11-22T09:59:59Z", items: [{ itemType: "OFFER", itemId: "same" }] };
  const open = { transactionId: "open", expiresAt: "2026-11-22T10:05:00Z", items: [{ itemType: "OFFER", itemId: "same" }] };
  assert.equal(activeCounterQrForSelection([expired, open], [], ["same"], now), open);
  assert.equal(activeCounterQrForSelection([expired, open], ["same"], [], now), undefined);
  assert.equal(activeCounterQrForSelection([expired, open], [], ["other"], now), undefined);
  assert.equal(activeCounterQrForSelection([expired, open], [], ["same"], Date.parse(open.expiresAt)), undefined);
});

test("line subtotals use receipt snapshots and omit ambiguous or missing prices", () => {
  const line = { description: "Cookies", quantity: 2, unitPriceMinor: 500, currency: "CAD", subtotalMinor: 999 };
  const key = receiptLineKey("Cookies", 2, 500, "CAD");
  assert.equal(receiptLineSubtotals(JSON.stringify({ lines: [line] })).get(key), 999);
  assert.equal(receiptLineSubtotals(JSON.stringify({ lines: [line, { ...line, subtotalMinor: 1000 }] })).get(key), null);
  assert.equal(receiptLineSubtotals("{}").has(key), false);
});
