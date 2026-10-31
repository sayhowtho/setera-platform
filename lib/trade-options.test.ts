import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrade, TRADE_OPTIONS } from './trade-options';

test('normalizeTrade: aliases map to the listed trade, any case, trimmed', () => {
  assert.equal(normalizeTrade('Renovations'), 'Renovation');
  assert.equal(normalizeTrade('  renovations '), 'Renovation');
  assert.equal(normalizeTrade('RENOVATIONS'), 'Renovation');
  assert.equal(normalizeTrade('General Contracting'), 'General Construction');
  assert.equal(normalizeTrade('General contracting'), 'General Construction');
  assert.equal(normalizeTrade('General Contractor'), 'General Construction');
  assert.equal(normalizeTrade('\tgeneral CONTRACTOR\n'), 'General Construction');
});

test('normalizeTrade: every other value is returned exactly as sent', () => {
  for (const t of TRADE_OPTIONS) assert.equal(normalizeTrade(t), t);
  for (const t of ['Cabinetry', 'Well Drilling', 'roofing', ' Drywall ', 'General Contractors', 'Renovation & Repair', 'Reno', '', '   ', 'constructor', '__proto__']) {
    assert.equal(normalizeTrade(t), t);
  }
});
