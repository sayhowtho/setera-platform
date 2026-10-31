// Trade dropdown choices (Add/Edit Prospect, Book Now, calendar booking).
// prospects.trade is free text: Bodhi batches and website demo requests can
// store any value, and the Prospects Trade filter lists what is actually
// stored (prospect_trade_options, migrations/040), not just these.
export const TRADE_OPTIONS = ['Roofing', 'HVAC', 'Electrical', 'Mechanical', 'Plumbing', 'General Construction', 'Renovation', 'Drywall', 'Painting', 'Flooring', 'Automotive', 'Other'];

// Spellings of a listed trade that get saved as the listed one. Matched
// trimmed and case-insensitively; every other value (unknown ones too) is
// stored exactly as sent. Applied on create/import (/api/prospects/create,
// /api/bodhi/prospects) and on High Table Add/Edit Prospect.
const TRADE_ALIASES = new Map<string, string>([
  ['renovations', 'Renovation'],
  ['general contracting', 'General Construction'],
  ['general contractor', 'General Construction'],
]);

export function normalizeTrade(trade: string): string {
  return TRADE_ALIASES.get(trade.trim().toLowerCase()) ?? trade;
}
