// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumPaymentsByCurrency, formatMoneyTotal } from './client-payments';

test('totals are per currency, never combined', () => {
  const totals = sumPaymentsByCurrency([
    { amount: 697, currency: 'CAD' },
    { amount: 1397, currency: 'CAD' },
    { amount: 500, currency: 'USD' },
  ]);
  assert.deepEqual(totals, [{ currency: 'CAD', amount: 2094 }, { currency: 'USD', amount: 500 }]);
});

test('refunds net out within their own currency; numeric strings from Postgres work', () => {
  assert.deepEqual(sumPaymentsByCurrency([{ amount: '697.00', currency: 'CAD' }, { amount: '-100.50', currency: 'CAD' }]), [{ currency: 'CAD', amount: 596.5 }]);
  assert.deepEqual(sumPaymentsByCurrency([]), []);
});

test('formatting keeps the currency code and sign', () => {
  assert.equal(formatMoneyTotal({ currency: 'CAD', amount: 2094 }), '$2,094 CAD');
  assert.equal(formatMoneyTotal({ currency: 'USD', amount: -100.5 }), '−$100.5 USD');
});
