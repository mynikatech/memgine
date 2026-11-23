const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const sql = readFileSync(join(__dirname, '../../DB/liquibase/sql/310e-customer-redemption-savings.sql'), 'utf8');
const sqlFile = (name) => readFileSync(join(__dirname, '../../DB/liquibase/sql', name), 'utf8');

test('canonical transaction and subscription functions select redemption evidence without source-channel filtering', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION .*get_customer_transaction_actual_savings/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION .*get_customer_subscription_actual_savings/);
  assert.doesNotMatch(sql, /source_channel/i);
  assert.match(sql, /redemption_status IS DISTINCT FROM 'SUCCESS'/);
  assert.match(sql, /status <> 'COMPLETED'/);
  assert.match(sql, /organization_user_record\.user_id = p_customer_user_id/);
  assert.match(sql, /link_count > 1/);
});

test('fulfilled collection and confirmed Collect evidence gate online orders', () => {
  assert.match(sql, /MISSING_COLLECTION_EVIDENCE/);
  assert.match(sql, /fulfillment_status\.status_code IS DISTINCT FROM 'FULFILLED'/);
  assert.match(sql, /actual_collection_at IS NULL/);
  assert.match(sql, /poynt_collect_verified_captures verified_capture/);
  assert.match(sql, /verified_capture\.amount_minor = linked_record\.total_minor/);
  assert.match(sql, /payment_attempt\.status = 'SUCCEEDED'/);
  assert.match(sql, /PAYMENT_RECONCILIATION_REQUIRED/);
  assert.match(sql, /payment_timing\.status_code = 'PAY_AT_COUNTER'/);
  assert.match(sql, /linked_record\.total_minor = 0/);
});

test('refund evidence and currency grouping remain part of the canonical calculation', () => {
  assert.match(sql, /AMBIGUOUS_REFUND/);
  assert.match(sql, /verified_reversal/);
  assert.match(sql, /GROUP BY financial_record\.currency_code/);
  assert.match(sql, /MISSING_APPLIED_DISCOUNT_EVIDENCE/);
  assert.doesNotMatch(sql, /\b[a-z]\./);
  assert.match(sql, /refund_record\.execution_status = 'SUCCEEDED'/);
  assert.match(sql, /resolution_record\.action_status = 'COMPLETED'/);
  assert.equal((sql.match(/SET search_path = pg_catalog, "\$\{schemaName\}", pg_temp/g) || []).length, 2);
});

test('unverified payment, refund and partial restoration cannot enter verified totals', () => {
  assert.match(sql, /THEN 'PAYMENT_RECONCILIATION_REQUIRED'/);
  assert.match(sql, /THEN 'AMBIGUOUS_REFUND'/);
  assert.match(sql, /THEN 'AMBIGUOUS_ITEM_REVERSAL'/);
  assert.match(sql, /item_summary\.restored_count > 0 AND item_summary\.restored_count < item_summary\.item_count/);
  assert.match(sql, /CASE WHEN commerce_record\.verification = 'VERIFIED' THEN/);
  assert.match(sql, /sum\(financial_record\.net_savings_minor\) FILTER \(WHERE financial_record\.verification_state = 'VERIFIED'\)/);
});

test('receipt and collection contracts support the savings evidence checks', () => {
  const schema = sqlFile('265-unified-transaction-receipts.sql');
  const receipt = sqlFile('266-customer-safe-receipt-snapshots.sql');
  const finalizer = sqlFile('309c-counter-order-lifecycle.sql');
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_receipts_commerce_source/);
  assert.match(receipt, /WHEN v_order_number <> v_receipt_number THEN 'COUNTER_REDEMPTION'/);
  assert.match(finalizer, /SET status='SUCCESS',staff_id=p_staff,completed_at=v_now/);
  assert.match(finalizer, /fulfilled_at=CASE WHEN v_target='FULFILLED' THEN v_now/);
  assert.match(finalizer, /actual_collection_at=CASE WHEN v_target='FULFILLED' THEN v_now/);
});
