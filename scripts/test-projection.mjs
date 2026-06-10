// Unit checks for the projection engine. Run: node scripts/test-projection.mjs
import {
  buildProjection,
  currentBalanceCents,
  estimateDailyVariableSpend,
  estimateDailyVariableSpendCents,
  nextOccurrence,
  occurrencesBetween,
} from '../src/lib/projection.js';

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`FAIL ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// --- occurrences ---
const rent = { type: 'expense', description: 'Rent', amountCents: 145000, frequency: 'monthly', anchorDate: '2026-01-01' };
check(
  'monthly on the 1st',
  occurrencesBetween(rent, '2026-06-11', '2026-09-10'),
  ['2026-07-01', '2026-08-01', '2026-09-01'],
);

const eom = { ...rent, description: 'EOM bill', anchorDate: '2026-01-31' };
check(
  'monthly on the 31st clamps to short months',
  occurrencesBetween(eom, '2026-02-01', '2026-04-30'),
  ['2026-02-28', '2026-03-31', '2026-04-30'],
);

const paycheck = { type: 'income', description: 'Paycheck', amountCents: 100000, frequency: 'biweekly', anchorDate: '2026-06-05' };
check(
  'biweekly steps in 14-day increments from anchor',
  occurrencesBetween(paycheck, '2026-06-10', '2026-07-20'),
  ['2026-06-19', '2026-07-03', '2026-07-17'],
);

const gym = { type: 'expense', description: 'Gym', amountCents: 4200, frequency: 'weekly', anchorDate: '2026-06-08' };
check('weekly with anchor inside window includes anchor', occurrencesBetween(gym, '2026-06-08', '2026-06-22'), ['2026-06-08', '2026-06-15', '2026-06-22']);

const insurance = { type: 'expense', description: 'Insurance', amountCents: 90000, frequency: 'yearly', anchorDate: '2025-08-15' };
check('yearly hits the same month/day', occurrencesBetween(insurance, '2026-06-11', '2026-09-10'), ['2026-08-15']);
check('no occurrences before the anchor', occurrencesBetween(rent, '2025-11-01', '2025-12-31'), []);
check('nextOccurrence finds the next date', nextOccurrence(rent, '2026-06-11'), '2026-07-01');

// --- current balance ---
const txs = [
  { type: 'income', description: 'Paycheck', amountCents: 100000, date: '2026-06-01' },
  { type: 'expense', description: 'Groceries', amountCents: 5000, date: '2026-06-09' },
  { type: 'expense', description: 'Rent', amountCents: 145000, date: '2026-06-12' }, // future
];
check('computed balance ignores future-dated entries', currentBalanceCents(txs, null, '2026-06-10'), 95000);
check(
  'anchored balance = stated balance + activity after the anchor date',
  currentBalanceCents(txs, { startingBalanceCents: 340000, startingBalanceDate: '2026-06-05' }, '2026-06-10'),
  335000,
);

// --- variable spend estimate ---
const history = [
  { type: 'expense', description: 'Rent', amountCents: 145000, date: '2026-06-01' },
  { type: 'expense', description: 'Groceries', amountCents: 9000, date: '2026-06-02' },
  { type: 'expense', description: 'Coffee', amountCents: 1000, date: '2026-06-06' },
  { type: 'income', description: 'Paycheck', amountCents: 200000, date: '2026-06-01' },
];
check(
  'variable estimate excludes recurring descriptions and income, divides by covered days',
  estimateDailyVariableSpendCents(history, [rent], '2026-06-10'),
  1000, // (9000 + 1000) / 10 days of history
);
check('variable estimate is 0 with no history', estimateDailyVariableSpendCents([], [rent], '2026-06-10'), 0);
check(
  'variable estimate explains its inputs',
  estimateDailyVariableSpend(history, [rent], '2026-06-10'),
  { dailyCents: 1000, totalCents: 10000, count: 2, days: 10 },
);

// --- full projection ---
const proj = buildProjection({
  startBalanceCents: 100000,
  fromISO: '2026-06-10',
  toISO: '2026-07-10',
  recurringItems: [rent, paycheck],
  transactions: [],
  dailyVariableCents: 1000,
  includeVariable: true,
});
// paychecks 6/19 and 7/3 (+200000), rent 7/1 (-145000), variable 30 * -1000
check('projection end balance', proj.endBalanceCents, 100000 + 200000 - 145000 - 30000);
check('projection has a point per day', proj.points.length, 30);
check('projection totals: recurring income', proj.totals.recurringIncome, 200000);
check('projection totals: recurring bills', proj.totals.recurringBills, 145000);

const noVar = buildProjection({
  startBalanceCents: 100000,
  fromISO: '2026-06-10',
  toISO: '2026-07-10',
  recurringItems: [rent, paycheck],
  transactions: [],
  dailyVariableCents: 1000,
  includeVariable: false,
});
check('toggle off skips variable spending', noVar.endBalanceCents, 100000 + 200000 - 145000);

// already-entered future transaction suppresses the matching occurrence
const withEntered = buildProjection({
  startBalanceCents: 0,
  fromISO: '2026-06-10',
  toISO: '2026-07-05',
  recurringItems: [rent],
  transactions: [{ type: 'expense', description: 'rent', amountCents: 145000, date: '2026-06-30' }],
  dailyVariableCents: 0,
  includeVariable: true,
});
check('future-entered bill is not double counted with its occurrence', withEntered.endBalanceCents, -145000);

// dip detection
const dip = buildProjection({
  startBalanceCents: 50000,
  fromISO: '2026-06-10',
  toISO: '2026-07-10',
  recurringItems: [rent, paycheck],
  transactions: [],
  dailyVariableCents: 0,
  includeVariable: true,
});
// +100000 on 6/19, +100000 on 7/3, -145000 on 7/1 -> low right after rent: 50000+200000-145000=105000? no:
// 6/19 +100000 => 150000; 7/1 -145000 => 5000; 7/3 +100000 => 105000. min = 5000 on 7/1
check('lowest dip is found', dip.minPoint, { date: '2026-07-01', balanceCents: 5000 });

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll projection checks passed.');
