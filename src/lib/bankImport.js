import { parseCsv } from './csv.js';

// Maps a bank-exported CSV (Chase credit card or Chase checking, plus a
// generic fallback for similar files) onto the app's transaction shape.
//
// Conventions in Chase exports: purchases/debits are negative amounts,
// payments/credits positive. Credit-card "Payment" rows are transfers from
// your own bank account, so they're skipped rather than counted as income.

const CHASE_CATEGORY_MAP = {
  groceries: 'groceries',
  'food & drink': 'dining',
  gas: 'transport',
  automotive: 'transport',
  travel: 'transport',
  'bills & utilities': 'utilities',
  'health & wellness': 'health',
  entertainment: 'entertainment',
  shopping: 'shopping',
  personal: 'personal',
  home: 'housing',
  education: 'other',
  'fees & adjustments': 'other',
  'gifts & donations': 'other',
  'professional services': 'other',
  miscellaneous: 'other',
};

// Card payments / paying the card from checking — same money moving between
// the user's own accounts, not new income or spending.
const TRANSFER_RE =
  /payment thank you|payment to chase card|chase credit crd\s+(epay|autopay)|autopay\s*payment|online payment \d+ to chase/i;

function isoFromUsDate(raw) {
  const s = String(raw ?? '').trim();
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function centsFromAmount(raw) {
  let s = String(raw ?? '').trim().replace(/[$,\s]/g, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (s === '' || s === '.' || !/^\d*\.?\d*$/.test(s)) return null;
  const value = Number.parseFloat(s);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

export function mapBankCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('That file looks empty.');

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);

  let format;
  let dateIdx;
  let descIdx;
  let amountIdx;
  let categoryIdx = -1;
  let typeIdx = -1;

  if (col('transaction date') !== -1 && col('amount') !== -1) {
    format = 'Chase credit card';
    dateIdx = col('transaction date');
    descIdx = col('description');
    amountIdx = col('amount');
    categoryIdx = col('category');
    typeIdx = col('type');
  } else if (col('posting date') !== -1 && col('amount') !== -1) {
    format = 'Chase checking account';
    dateIdx = col('posting date');
    descIdx = col('description');
    amountIdx = col('amount');
  } else {
    format = 'bank CSV';
    dateIdx = header.findIndex((h) => h.includes('date'));
    descIdx = header.findIndex(
      (h) => h.includes('desc') || h.includes('payee') || h.includes('name'),
    );
    amountIdx = header.findIndex((h) => h.includes('amount'));
    categoryIdx = header.findIndex((h) => h.includes('category'));
    if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
      throw new Error(
        "Couldn't recognize the columns. Expected a Chase credit card or checking export, or any CSV with date, description, and amount columns.",
      );
    }
  }

  const transactions = [];
  let skippedTransfers = 0;
  let skippedUnreadable = 0;

  for (const row of rows.slice(1)) {
    if (row.every((c) => !String(c).trim())) continue;
    const date = isoFromUsDate(row[dateIdx]);
    const cents = centsFromAmount(row[amountIdx]);
    const description = String(row[descIdx] ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
    if (!date || cents === null || cents === 0 || !description) {
      skippedUnreadable++;
      continue;
    }

    const rawType = typeIdx !== -1 ? String(row[typeIdx] ?? '').trim().toLowerCase() : '';
    if (rawType === 'payment' || TRANSFER_RE.test(description)) {
      skippedTransfers++;
      continue;
    }

    const isExpense = cents < 0;
    const sourceCategory =
      categoryIdx !== -1 ? String(row[categoryIdx] ?? '').trim().toLowerCase() : '';
    const category = isExpense
      ? (CHASE_CATEGORY_MAP[sourceCategory] ?? 'other')
      : /payroll|direct\s?dep|salary/i.test(description)
        ? 'salary'
        : 'other-income';

    transactions.push({
      type: isExpense ? 'expense' : 'income',
      description,
      amountCents: Math.abs(cents),
      category,
      date,
    });
  }

  if (transactions.length === 0 && skippedTransfers === 0) {
    throw new Error('No usable transactions found in that file.');
  }
  return { format, transactions, skippedTransfers, skippedUnreadable };
}
