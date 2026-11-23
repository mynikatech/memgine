const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(join(__dirname, '../src/ui/domain/counter-financial-state.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const state = {};
new Function('exports', code)(state);

for (const journey of ['IMMEDIATE_PAY_AT_COUNTER', 'ADVANCE_PAY_NOW', 'ADVANCE_PAY_AT_COUNTER']) {
  for (const method of ['QR', 'PICKUP_CODE', 'PHONE_OTP', 'STAFF_ASSISTED']) {
    test(`${journey} ${method} requires verified payment and order state`, () => {
      const order = { status: 'READY', lifecycle: { journey, verificationMethod: method, payment: 'NO_PAYMENT_REQUIRED' } };
      assert.equal(state.counterFinancialComplete(order), true);
      for (const payment of ['PAYMENT_REQUIRED', 'PAYMENT_UNRESOLVED', 'FINANCIAL_EXCEPTION', 'REFUND_CONFLICT', 'CASH_CONFIRMATION_REQUIRED']) {
        assert.equal(state.counterFinancialComplete({ ...order, lifecycle: { ...order.lifecycle, payment } }), false);
      }
      assert.equal(state.counterFinancialComplete({ ...order, lifecycle: { ...order.lifecycle, payment: 'VERIFIED_ONLINE' } }), true);
      assert.equal(state.counterFinancialComplete({ ...order, lifecycle: { ...order.lifecycle, payment: 'VERIFIED_AT_COUNTER' } }), true);
      assert.equal(state.counterFinancialComplete({ ...order, lifecycle: { ...order.lifecycle, verificationMethod: null } }), false);
      assert.equal(state.counterFinancialComplete({ ...order, lifecycle: { ...order.lifecycle, collectionBlocker: 'SUPPORT_UNRESOLVED' } }), false);
      assert.equal(state.counterFinancialComplete({ ...order, status: 'FULFILLED' }), false);
    });
  }
}

test('payment controls require complete server-provided financial detail', () => {
  const order = { currencyCode: 'CAD', subtotalMinor: 1099, discountMinor: 274, taxMinor: 107, totalMinor: 932,
    items: [{ name: 'Product', quantity: 1, unitPriceMinor: 1099, subtotalMinor: 1099 }] };
  assert.equal(state.counterFinancialReviewAvailable(order), true);
  assert.equal(state.counterFinancialReviewAvailable({ ...order, taxMinor: null }), false);
  assert.equal(state.counterFinancialReviewAvailable({ ...order, items: [] }), false);
  assert.equal(state.counterFinancialReviewAvailable({ ...order, items: [{ ...order.items[0], unitPriceMinor: null }] }), false);
  assert.equal(state.counterFinancialReviewAvailable({ ...order, subtotalMinor: 0, discountMinor: 0, taxMinor: 0, totalMinor: 0 }), true);
});
