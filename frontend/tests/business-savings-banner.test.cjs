const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');
const root = join(__dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const js = ts.transpileModule(read('src/core/domain/savings-display.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const savings = {};
new Function('exports', js)(savings);

test('business savings uses original minor units and disambiguates CAD and USD', () => {
  assert.match(savings.formatBusinessSavingsMoney(799, 'CAD'), /7[.,]99.*CAD/);
  assert.match(savings.formatBusinessSavingsMoney(124, 'USD'), /1[.,]24.*USD/);
  assert.match(savings.formatBusinessSavingsMoney(25000, 'INR'), /250[.,]00/);
  assert.match(savings.formatBusinessSavingsMoney(0, 'CAD'), /0[.,]00.*CAD/);
  assert.equal(savings.formatBusinessSavingsMoney(-1, 'CAD'), undefined);
  assert.equal(savings.formatBusinessSavingsMoney(1, 'invalid'), undefined);
});

test('banner preserves partial and unavailable coverage and displays separate currencies', () => {
  const banner = read('src/ui/domain/BusinessSavingsBanner.tsx');
  assert.match(banner, /Verified savings so far/);
  assert.match(banner, /Savings history incomplete/);
  assert.match(banner, /Savings unavailable/);
  assert.match(banner, /totals\.map/);
  assert.match(banner, /totals\.length === 1/);
  assert.match(banner, /activePlanCurrencyCode/);
  assert.match(banner, /flex: 1/);
});

test('business savings is scoped to customer and organization and refreshes on focus and history updates', () => {
  const experience = read('src/experience/BusinessExperience.tsx');
  assert.match(experience, /businessSavingsScope = JSON\.stringify\(\[organization\.id, customerUserId\]\)/);
  assert.match(experience, /businessActualSavings\(organization\.id\)/);
  assert.match(experience, /businessSavingsScope, customerUserId, focused, historyRefresh, isPreviewMode, organization\.id/);
  assert.match(experience, /!isPreviewMode && !previewSection && customerUserId/);
});

test('business savings SQL reuses owned subscription verification and never reads POS currency', () => {
  const sql = readFileSync(join(root, '../DB/liquibase/sql/310d-customer-business-savings.sql'), 'utf8');
  assert.match(sql, /get_customer_subscription_actual_savings\(/);
  assert.match(sql, /organization_user\.user_id = p_customer_user_id/);
  assert.match(sql, /organization_user\.organization_id = p_organization_id/);
  assert.match(sql, /count\(DISTINCT currency\.currency_code\) = 1/);
  assert.match(sql, /LEFT JOIN currencies currency/);
  assert.match(sql, /currency\.currency_code IS NULL/);
  assert.match(sql, /currency\.currency_code !~ '\^\[A-Z\]\{3\}\$'/);
  assert.match(sql, /NOT coalesce\(currency\.is_active, false\)/);
  assert.match(sql, /unattributed_history AS/);
  assert.match(sql, /owned_membership\.subscription_id = commerce\.subscription_id/);
  assert.match(sql, /unattributed_history\.has_gap AND EXISTS \(SELECT 1 FROM owned_savings\)/);
  assert.match(sql, /UNION ALL[\s\S]*'NO_VERIFIED_DATA'::varchar/);
  assert.doesNotMatch(sql, /merchant_currency_code/);
});
