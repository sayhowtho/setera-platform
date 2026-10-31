// Payments ledger totals (migrations/032, High Table Total Paid + Lifetime
// Revenue Collected). One total per currency: CAD and USD are never added
// together (Alex, 2026-10-05).

export type MoneyTotal = { currency: string; amount: number };

// Largest total first; negative entries (refunds/corrections) net out within
// their own currency.
export function sumPaymentsByCurrency(payments: { amount: number | string; currency: string }[]): MoneyTotal[] {
  const by: Record<string, number> = {};
  payments.forEach(p => { by[p.currency] = (by[p.currency] || 0) + Number(p.amount); });
  return Object.entries(by)
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

export function formatMoneyTotal(t: MoneyTotal): string {
  return (t.amount < 0 ? '−$' : '$') + Math.abs(t.amount).toLocaleString('en-CA', { maximumFractionDigits: 2 }) + ' ' + t.currency;
}
