const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const sql = readFileSync(join(__dirname, '../../DB/liquibase/sql/309h-order-collection-extension.sql'), 'utf8');
const ui = readFileSync(join(__dirname, '../src/ui/domain/CounterOrdersDashboard.tsx'), 'utf8');
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(join(__dirname, '../src/ui/domain/collection-extension.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const helper = {};
new Function('exports', code)(helper);

test('extension changes lock the scoped order and reject stale or conflicting requests', () => {
  assert.match(sql, /counter_order_operator\(p_org,p_store,p_staff,p_actor\)/);
  assert.match(sql, /f0\.organization_id=p_org AND f0\.store_id=p_store FOR UPDATE OF f0/);
  assert.match(sql, /f\.version_no IS DISTINCT FROM p_version/);
  assert.match(sql, /pending\.fulfillment_action_id IS DISTINCT FROM p_request/);
  assert.match(sql, /p_action='EXTEND' AND pending\.fulfillment_action_id IS NOT NULL/);
  assert.match(sql, /f\.cancellation_requested_at IS NOT NULL/);
});

test('collection time validates Store window, horizon and ambiguous local times', () => {
  assert.match(sql, /pg_timezone_names/);
  assert.match(sql, /maximumHorizonMinutes/);
  assert.match(sql, /collectionWindowMinutes/);
  assert.match(sql, /generate_series\(utc_time-interval '3 hours'/);
  assert.match(sql, /p_action='REJECT' THEN expected_collection_at/);
  assert.doesNotMatch(sql, /UPDATE (?:commerce_transactions|redemption_transaction|redemption_entitlement_reservations|payment_intents)/i);
});

test('dashboard asks for confirmation and identifies the pending request', () => {
  assert.match(ui, /requestId: pending/);
  assert.match(ui, /Approve Extension/);
  assert.match(ui, /Reject Extension/);
  assert.match(ui, /Extend Collection Time/);
});

test('Store wall time is serialized without device timezone conversion', () => {
  assert.equal(helper.collectionExtensionLocalTime('2027-11-07', '01:30'), '2027-11-07T01:30:00');
  assert.equal(helper.collectionExtensionLocalTime('2027-03-14', '02:30'), '2027-03-14T02:30:00');
  assert.equal(helper.collectionExtensionLocalTime('2027-03-14', '25:30'), undefined);
  assert.match(sql, /WHEN 'APPROVE' THEN 'COLLECTION_CHANGE_APPROVED' WHEN 'REJECT' THEN 'COLLECTION_CHANGE_REJECTED' ELSE 'STAFF_COLLECTION_EXTENDED'/);
  assert.match(sql, /pending\.fulfillment_action_id IS DISTINCT FROM p_request/);
});
