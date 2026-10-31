// Single source of truth for the standard Setera packages (setup fee included).
// Shown in both the Rep Resources and High Table Resources payment-link sections.
// To change a link or price, edit it here only. (The "No Setup Fee" links above
// them in those sections come from the plan_links table, not this file.)
export type PaymentPackage = {
  name: string;
  minutes: number;
  setupFee: number;   // one-time, CAD
  monthly: number;    // CAD / month (exact, cents included)
  url: string;
};

export const PAYMENT_PACKAGES: PaymentPackage[] = [
  { name: 'Setera Launch',  minutes: 200,  setupFee: 1397, monthly: 697.00, url: 'https://buy.stripe.com/test_placeholder' },
  { name: 'Setera Grow',    minutes: 1000, setupFee: 1397, monthly: 1348.65, url: 'https://buy.stripe.com/test_placeholder' },
  { name: 'Setera Starter', minutes: 3000, setupFee: 1397, monthly: 2249.55, url: 'https://buy.stripe.com/test_placeholder' },
];
