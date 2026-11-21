const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const source = readFileSync(join(__dirname, "../src/ui/domain/fulfillment-store-eligibility.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const helpers = {};
new Function("exports", compiled)(helpers);
const { storeOptions, selectedFulfillmentStore, storeConflictMessage, fulfillmentProductScope, fulfillmentReviewScope } = helpers;

const offerKey = "OFFER:offer";
const benefitKey = "BENEFIT:benefit";
const onlineJourney = "ADVANCE_PAY_NOW";
const west = {
  id: "west", name: "West Store", journeys: [onlineJourney],
  products: { [offerKey]: [{ productId: "cookies", productName: "Cookies" }] },
  payNowProducts: { [offerKey]: [{ productId: "cookies", productName: "Cookies" }] },
};
const east = {
  ...west, id: "east", name: "East Store",
  payNowProducts: { [offerKey]: [{ productId: "bread", productName: "Bread" }] },
};

test("only Stores returned for a Store-specific offer can be selected", () => {
  assert.deepEqual(storeOptions([west], { east: east.name, west: "Old name" }), [
    { id: west.id, name: west.name, eligible: true },
    { id: east.id, name: east.name, eligible: false },
  ]);
  assert.equal(selectedFulfillmentStore([west], east.id), west);
  assert.equal(selectedFulfillmentStore([west, east]), undefined);
  assert.equal(selectedFulfillmentStore([], east.id), undefined);
});

test("a rejected basket names both items and their distinct eligible Stores", () => {
  const message = storeConflictMessage([[offerKey, "Cookie offer"], [benefitKey, "Bread benefit"]], {
    [offerKey]: [west], [benefitKey]: [east],
  });
  assert.match(message, /No Store can redeem these items together/);
  assert.match(message, /Cookie offer \(West Store\)/);
  assert.match(message, /Bread benefit \(East Store\)/);
});

test("changing Stores invalidates product choices and the review quote", () => {
  const westScope = fulfillmentProductScope(west, onlineJourney);
  const eastScope = fulfillmentProductScope(east, onlineJourney);
  assert.notEqual(westScope.key, eastScope.key);
  assert.deepEqual(eastScope.options[offerKey].map(({ productId }) => productId), ["bread"]);
  assert.notEqual(westScope.key, fulfillmentProductScope({ ...west, payNowProducts: east.payNowProducts }, onlineJourney).key);

  const westReview = { selection: { subscriptionId: "subscription", benefitIds: [], offerIds: ["offer"] },
    storeId: west.id, journey: onlineJourney, productSelections: { [offerKey]: "cookies" }, requestKey: "same-key" };
  assert.notEqual(fulfillmentReviewScope("org", westReview),
    fulfillmentReviewScope("org", { ...westReview, storeId: east.id, productSelections: { [offerKey]: "bread" } }));
  assert.notEqual(fulfillmentReviewScope("org", westReview),
    fulfillmentReviewScope("org", { ...westReview, selection: { ...westReview.selection, benefitIds: ["benefit"] } }));
});
