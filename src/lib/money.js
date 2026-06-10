// All amounts are stored as integer cents to avoid floating-point drift when summing.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCents(cents) {
  return usd.format(cents / 100);
}

export function formatCentsCompact(cents) {
  return usdCompact.format(cents / 100);
}

export function parseAmountToCents(input) {
  const cleaned = String(input).replace(/[$,\s]/g, '');
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}
