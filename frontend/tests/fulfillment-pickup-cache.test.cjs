const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');
const source = readFileSync(join(__dirname, '../src/core/services/fulfillment-pickup-cache.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsForTest = {};
new Function('exports', code)(exportsForTest);
const fresh = () => new Date(Date.now() + 60000).toISOString();

test('navigation reuses a still-valid credential without an issuance call', async () => {
  const cache = exportsForTest.createFulfillmentPickupCache();
  let calls = 0;
  const load = async () => ({ code: String(++calls), expiresAt: fresh() });
  const first = await cache.issue('user:org:order', 'code', load);
  assert.equal(cache.get('user:org:order', 'code').code, first.code);
  assert.equal((await cache.issue('user:org:order', 'code', load)).code, first.code);
  assert.equal(calls, 1);
  assert.equal(cache.get('other-user:org:order', 'code'), undefined);
  cache.invalidate('user:org:order');
});

test('explicit refresh replaces only the selected credential and informs other views', async () => {
  const cache = exportsForTest.createFulfillmentPickupCache();
  let updates = 0;
  cache.subscribe('order', () => updates++);
  await cache.issue('order', 'qr', async () => ({ reference: 'qr', expiresAt: fresh() }));
  await cache.issue('order', 'code', async () => ({ code: '123456', expiresAt: fresh() }));
  await cache.issue('order', 'code', async () => ({ code: '654321', expiresAt: fresh() }), true);
  assert.equal(cache.get('order', 'code').code, '654321');
  assert.equal(cache.get('order', 'qr').reference, 'qr');
  assert.ok(updates >= 6);
  cache.invalidate('order');
});

test('expired credentials require explicit regeneration', async () => {
  const cache = exportsForTest.createFulfillmentPickupCache();
  await assert.rejects(cache.issue('order', 'qr', async () => ({ reference: 'old', expiresAt: '2000-01-01T00:00:00Z' })));
  assert.equal(cache.get('order', 'qr'), undefined);
});

test('concurrent issuance shares one request and invalidation discards a late response', async () => {
  const cache = exportsForTest.createFulfillmentPickupCache();
  let calls = 0;
  let resolve;
  const load = () => { calls++; return new Promise((done) => { resolve = done; }); };
  const first = cache.issue('order', 'code', load);
  const second = cache.issue('order', 'code', load, true);
  await Promise.resolve();
  assert.equal(calls, 1);
  cache.invalidate('order');
  resolve({ code: '123456', expiresAt: fresh() });
  await assert.rejects(first);
  await assert.rejects(second);
  assert.equal(cache.get('order', 'code'), undefined);
});
