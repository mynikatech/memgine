/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const read = (relative) =>
  fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

function load(relative) {
  const filename = path.join(__dirname, "..", relative);

  const { outputText } = ts.transpileModule(read(relative), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const loaded = new Module(filename, module);
  loaded._compile(outputText, filename);
  return loaded.exports;
}

const helpers = load("src/core/domain/membership-helpers.ts");
const { compactPotentialSavingsLabel } = load(
  "src/core/domain/savings-display.ts",
);
const { APP_ROUTES } = load("src/constants/navigation.ts");
const silver = {
  id: "silver",
  subscriptionPlanName: "SILVER",
  subscriptionPeriod: 1,
  subscriptionPeriodUnit: "MONTH",
};
const gold = {
  id: "gold",
  subscriptionPlanName: "GOLD",
  subscriptionPeriod: 1,
  subscriptionPeriodUnit: "YEAR",
};
const catalog = [{ id: "bakery-membership", plans: [silver, gold] }];

const newCustomer = helpers.activeMembershipPlanIds([]);
assert.equal(
  helpers.discoveryMembershipAction(newCustomer.size > 0, true),
  "Explore Memberships",
);
assert.equal(
  helpers.discoverableMembershipProducts(catalog, newCustomer)[0].plans.length,
  2,
);
assert.equal(
  APP_ROUTES.discover.memberships("bakery"),
  "/discover/bakery?section=memberships",
);
assert.equal(
  APP_ROUTES.discover.membership("bakery", catalog[0].id, "gold"),
  "/discover/bakery?productId=bakery-membership&planId=gold",
);
assert.equal(APP_ROUTES.discover.organization("bakery"), "/discover/bakery");
assert.equal(
  APP_ROUTES.join.membership("bakery", catalog[0].id, "gold"),
  "/join?organizationId=bakery&productId=bakery-membership&planId=gold",
);

const ownsSilver = helpers.activeMembershipPlanIds([
  { planId: "silver", status: "active" },
]);
const available = helpers.discoverableMembershipProducts(catalog, ownsSilver);
assert.equal(
  helpers.discoveryMembershipAction(ownsSilver.size > 0, available.length > 0),
  "Explore More Memberships",
);
assert.deepEqual(available[0].plans, [gold]);
assert.equal(helpers.resolveJoinPlan(catalog[0], "gold"), gold);
assert.equal(helpers.resolveJoinPlan(catalog[0], "unknown"), undefined);
assert.equal(helpers.resolveJoinPlan(catalog[0]), silver);

const historyOnly = helpers.activeMembershipPlanIds([
  { planId: "silver", status: "EXPIRED" },
  { planId: "gold", status: "CANCELLED" },
]);
assert.equal(
  helpers.discoveryMembershipAction(historyOnly.size > 0, true),
  "Explore Memberships",
);
assert.equal(
  helpers.discoverableMembershipProducts(catalog, historyOnly)[0].plans.length,
  2,
);
assert.equal(helpers.discoveryMembershipAction(false, false), "View Business");
assert.equal(helpers.discoveryMembershipAction(true, false), "View Business");
assert.deepEqual(
  helpers.discoverableMembershipProducts(catalog, new Set(["silver", "gold"])),
  [],
);

const savings = {
  amountMinor: 447946,
  currency: "CAD",
  decimalPlaces: 2,
  period: 1,
  periodUnit: "YEAR",
  complete: true,
};
assert.equal(
  compactPotentialSavingsLabel(savings),
  "Potential savings: Up to CAD 4,479.46 over 1 year",
);
assert.equal(
  compactPotentialSavingsLabel({
    ...savings,
    amountMinor: 0,
    source: "OVERRIDE",
  }),
  "Potential savings: Up to CAD 0.00 over 1 year",
);

const experience = read("src/experience/BusinessExperience.tsx");
const row = experience.slice(
  experience.indexOf("const availableMembershipsSection"),
  experience.indexOf("const renderExperienceOffer"),
);
assert.match(
  row,
  /onPress=\{\(\) => setSelectedAvailablePlan\(\{ membership, plan \}\)\}/,
);

assert.match(row, /onPress=\{\(\) => joinPlan\(membership, plan\)\}/);

assert.doesNotMatch(row, /onExploreMembership\?\./);

assert.doesNotMatch(row, /label="View Membership Details"/);
assert.match(
  experience,
  /!isPlanExploration && !isHistoricalSubscription &&\s*exp\.membership\?\.active/,
);
assert.match(experience, /<MembershipAgreementHistoryLink/);
assert.doesNotMatch(
  experience,
  /MembershipAgreementPopup|MembershipAgreementDocumentView/,
);
assert.match(
  read("src/ui/domain/MembershipAgreementHistoryLink.tsx"),
  /View Membership Agreement[\s\S]+<MembershipAgreementDocumentView/,
);
const modal = read("src/ui/domain/MembershipPlanDetailsModal.tsx");

assert.match(modal, /title="Membership Details"/);
assert.match(modal, /Included Benefits/);
assert.match(modal, /Potential Savings/);

assert.match(modal, /membership\.benefitIds\.includes\(benefit\.id\)/);

assert.doesNotMatch(modal, /<OfferCard|Membership Agreement|Actual Savings/);

assert.match(experience, /<MembershipPlanDetailsModal/);
const discovery = read("app/discover/[organizationId].tsx");
assert.match(
  discovery,
  /const selectedMembership = productId \? undefined : focused/,
);
assert.match(
  discovery,
  /<BusinessExperience[\s\S]+router\.push\(APP_ROUTES\.discover\.membership\(organizationId, id, selectedPlanId\)/,
);
const purchased = read("app/business/[subscriptionId].tsx");
assert.match(
  purchased,
  /<BusinessExperience[\s\S]+subscription=\{current\.subscription\}/,
);
assert.match(
  read("app/customer/cards.tsx"),
  /const openBusiness[\s\S]+APP_ROUTES\.business\.subscription\(card\.subscription\.id\)/,
);
assert.match(
  read("app/join.tsx"),
  /const plan = resolveJoinPlan\(product, params\.planId\)/,
);
