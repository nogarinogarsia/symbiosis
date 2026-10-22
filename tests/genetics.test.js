import { test } from 'node:test';
import assert from 'node:assert/strict';

test('existing genetics and diversity suite', async () => {
  // The browser report uses DOM only for output; run the same assertions in CI.
  globalThis.document = { getElementById: () => ({ appendChild() {} }), createElement: () => ({}) };
  globalThis.window = {};
  try {
    await import('../js/tests.js');
    const report = window.__results;
    assert.ok(report.total >= 38);
    assert.deepEqual(report.results.filter(r => !r.ok), []);
  } finally { delete globalThis.document; delete globalThis.window; }
});
