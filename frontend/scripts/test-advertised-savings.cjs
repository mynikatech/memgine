const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.join(__dirname, "../src/core/domain/savings-display.ts");
const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const savingsModule = new Module(filename, module);
savingsModule._compile(outputText, filename);
const { readSavingsOverride, advertisedSavingsLabel, potentialSavingsLabel, potentialSavingsValue, potentialSavingsAssumptions, formatSavingsMoney } = savingsModule.exports;
const { subscriptionSavingsDisplay, verifiedSavingsMoney } = savingsModule.exports;

assert.deepEqual(subscriptionSavingsDisplay([
  { coverageState: "PARTIAL", currencyCode: "USD", verifiedRedemptionCount: 2, verifiedNetSavingsMinor: 199 },
  { coverageState: "PARTIAL", currencyCode: "CAD", verifiedRedemptionCount: 1, verifiedNetSavingsMinor: 0 },
  { coverageState: "COMPLETE", currencyCode: "JPY", netSavingsMinor: 90 },
]), { complete: ["JPY 90"], partial: ["USD 1.99", "CAD 0.00"], incomplete: true });
assert.deepEqual(subscriptionSavingsDisplay([
  { coverageState: "PARTIAL", currencyCode: "USD", verifiedRedemptionCount: 0, verifiedNetSavingsMinor: 0 },
  { coverageState: "NO_VERIFIED_DATA", currencyCode: "CAD", verifiedNetSavingsMinor: 0 },
]), { complete: [], partial: [], incomplete: true });
assert.equal(verifiedSavingsMoney({ verificationState: "MISSING_FINALIZED_DISCOUNT", netSavingsMinor: 199, currencyCode: "USD" }), undefined);
assert.equal(verifiedSavingsMoney({ verificationState: "VERIFIED", netSavingsMinor: 199, currencyCode: "USD" }), "USD 1.99");

const money = { currency: "CAD", amountMinor: 550, decimalPlaces: 2 };
assert.deepEqual(readSavingsOverride("5,50", "cad"), money);
assert.deepEqual(readSavingsOverride("0", "", { calculated: money }), { ...money, amountMinor: 0 });
assert.equal(readSavingsOverride("", "CAD"), null);
assert.equal(readSavingsOverride("5.001", "CAD"), undefined);
assert.equal(readSavingsOverride("-1", "CAD"), undefined);
assert.equal(readSavingsOverride("90071992547410", "CAD"), undefined);
assert.equal(advertisedSavingsLabel({ calculated: money }, "use"), undefined);
assert.equal(advertisedSavingsLabel({ effective: money }, "use"), "Potential saving per use: up to CAD 5.50");
assert.equal(advertisedSavingsLabel({ effective: money }, "redemption"), "Potential saving per redemption: up to CAD 5.50");
assert.equal(formatSavingsMoney({ ...money, amountMinor: Number.MAX_SAFE_INTEGER }), "CAD 90071992547409.91");
assert.equal(formatSavingsMoney({ currency: "JPY", amountMinor: 50, decimalPlaces: 0 }), "JPY 50");
assert.equal(formatSavingsMoney({ currency: "KWD", amountMinor: 1234, decimalPlaces: 3 }), "KWD 1.234");
assert.equal(formatSavingsMoney({ ...money, amountMinor: 0 }), "CAD 0.00");
assert.equal(potentialSavingsValue({ ...money, period: 0, periodUnit: "DAY" }), undefined);
assert.equal(potentialSavingsValue({ ...money, period: 1, periodUnit: "YEAR" }), "Up to CAD 5.50 over 1 year");
assert.match(potentialSavingsLabel({ ...money, complete: false, period: 2, periodUnit: "WEEK" }), /Partial potential savings: up to CAD 5\.50 over 2 weeks/);
const overriddenPlan = {
  ...money, amountMinor: 0, calculatedAmountMinor: 550, overrideAmountMinor: 0,
  source: "OVERRIDE", complete: false, period: 1, periodUnit: "MONTH",
};
assert.equal(potentialSavingsLabel(overriddenPlan), "Potential savings: up to CAD 0.00 over 1 month");
assert.equal(potentialSavingsAssumptions(overriddenPlan), "Business-provided estimate for a new membership term.");
assert.equal(readSavingsOverride("10.001", "KWD")?.amountMinor, 10001);
assert.equal(readSavingsOverride("10.1", "JPY"), undefined);
