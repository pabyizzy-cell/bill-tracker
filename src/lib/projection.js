import { addDaysISO, clampedDateInMonth, diffDaysISO } from './dates.js';

// Pure projection math. All amounts are integer cents; all dates ISO strings.
//
// A recurring item: { type, description, amountCents, category, frequency,
// anchorDate } where frequency is weekly | biweekly | monthly | yearly and
// anchorDate is a real date it occurred — the schedule is derived from it
// (day-of-month for monthly, weekday cadence for weekly/biweekly).

export const FREQUENCY_LABELS = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
  yearly: 'Every year',
};

// All occurrence dates of an item within [startISO, endISO], never earlier
// than the item's anchor date.
export function occurrencesBetween(item, startISO, endISO) {
  if (startISO > endISO) return [];
  const out = [];
  const anchor = item.anchorDate;

  if (item.frequency === 'weekly' || item.frequency === 'biweekly') {
    const period = item.frequency === 'weekly' ? 7 : 14;
    const diff = diffDaysISO(anchor, startISO);
    const k = Math.max(Math.ceil(diff / period), 0);
    let date = addDaysISO(anchor, k * period);
    while (date <= endISO) {
      if (date >= startISO) out.push(date);
      date = addDaysISO(date, period);
    }
  } else if (item.frequency === 'monthly') {
    const day = Number(anchor.slice(8, 10));
    let [y, m] = startISO.slice(0, 7).split('-').map(Number);
    for (;;) {
      const date = clampedDateInMonth(y, m, day);
      if (date > endISO) break;
      if (date >= startISO && date >= anchor) out.push(date);
      m++;
      if (m === 13) {
        m = 1;
        y++;
      }
    }
  } else {
    // yearly
    const day = Number(anchor.slice(8, 10));
    const month = Number(anchor.slice(5, 7));
    const firstYear = Number(startISO.slice(0, 4));
    const lastYear = Number(endISO.slice(0, 4));
    for (let y = firstYear; y <= lastYear; y++) {
      const date = clampedDateInMonth(y, month, day);
      if (date >= startISO && date <= endISO && date >= anchor) out.push(date);
    }
  }
  return out;
}

export function nextOccurrence(item, fromISO) {
  return occurrencesBetween(item, fromISO, addDaysISO(fromISO, 800))[0] ?? null;
}

// Current balance: the user's stated starting balance (balance at end of
// startingBalanceDate) plus recorded activity after that date, up to today.
// Without a starting balance, falls back to net of all recorded history.
export function currentBalanceCents(transactions, settings, todayISO) {
  const anchored =
    settings &&
    Number.isFinite(settings.startingBalanceCents) &&
    typeof settings.startingBalanceDate === 'string';
  let balance = anchored ? settings.startingBalanceCents : 0;
  const after = anchored ? settings.startingBalanceDate : '';
  for (const t of transactions) {
    if (t.date <= after || t.date > todayISO) continue;
    balance += t.type === 'income' ? t.amountCents : -t.amountCents;
  }
  return balance;
}

// Average daily "everyday" spending over the recent past: expenses that
// don't belong to a recurring item (matched by description), divided by the
// days of history actually available (up to lookbackDays). Returns the
// inputs too so the UI can show where the number comes from.
export function estimateDailyVariableSpend(
  transactions,
  recurringItems,
  todayISO,
  lookbackDays = 90,
) {
  const windowStart = addDaysISO(todayISO, -(lookbackDays - 1));
  const recurringDescs = new Set(
    recurringItems.map((r) => r.description.trim().toLowerCase()),
  );
  let totalCents = 0;
  let count = 0;
  let earliest = null;
  for (const t of transactions) {
    if (t.date > todayISO || t.date < windowStart) continue;
    if (earliest === null || t.date < earliest) earliest = t.date;
    if (t.type !== 'expense') continue;
    if (recurringDescs.has(t.description.trim().toLowerCase())) continue;
    totalCents += t.amountCents;
    count++;
  }
  if (earliest === null || totalCents <= 0) {
    return { dailyCents: 0, totalCents: 0, count: 0, days: 0 };
  }
  const days = Math.max(diffDaysISO(earliest, todayISO) + 1, 1);
  return { dailyCents: Math.round(totalCents / days), totalCents, count, days };
}

export function estimateDailyVariableSpendCents(transactions, recurringItems, todayISO, lookbackDays = 90) {
  return estimateDailyVariableSpend(transactions, recurringItems, todayISO, lookbackDays).dailyCents;
}

// Walks day by day from the day after fromISO through toISO.
// Already-entered future-dated transactions are applied on their dates, and
// a recurring occurrence is skipped when a future transaction within ±2
// days has the same description — so a bill that's already been entered
// isn't counted twice.
export function buildProjection({
  startBalanceCents,
  fromISO,
  toISO,
  recurringItems,
  transactions,
  dailyVariableCents = 0,
  includeVariable = true,
}) {
  const futureTx = transactions.filter((t) => t.date > fromISO && t.date <= toISO);
  const events = new Map(); // date -> [{ label, cents }]
  const pushEvent = (date, label, cents) => {
    if (!events.has(date)) events.set(date, []);
    events.get(date).push({ label, cents });
  };

  const totals = { recurringIncome: 0, recurringBills: 0, enteredNet: 0, variable: 0 };

  for (const item of recurringItems) {
    const signed = item.type === 'income' ? item.amountCents : -item.amountCents;
    const lowerDesc = item.description.trim().toLowerCase();
    for (const occ of occurrencesBetween(item, addDaysISO(fromISO, 1), toISO)) {
      const alreadyEntered = futureTx.some(
        (t) =>
          t.description.trim().toLowerCase() === lowerDesc &&
          Math.abs(diffDaysISO(t.date, occ)) <= 2,
      );
      if (alreadyEntered) continue;
      pushEvent(occ, item.description, signed);
      if (signed > 0) totals.recurringIncome += signed;
      else totals.recurringBills += -signed;
    }
  }

  for (const t of futureTx) {
    const signed = t.type === 'income' ? t.amountCents : -t.amountCents;
    pushEvent(t.date, t.description, signed);
    totals.enteredNet += signed;
  }

  const variablePerDay = includeVariable ? dailyVariableCents : 0;
  const points = [];
  let balance = startBalanceCents;
  let min = { date: fromISO, balanceCents: startBalanceCents };
  const totalDays = diffDaysISO(fromISO, toISO);

  for (let i = 1; i <= totalDays; i++) {
    const date = addDaysISO(fromISO, i);
    for (const e of events.get(date) ?? []) balance += e.cents;
    balance -= variablePerDay;
    totals.variable += variablePerDay;
    points.push({ date, balanceCents: balance, events: events.get(date) ?? [] });
    if (balance < min.balanceCents) min = { date, balanceCents: balance };
  }

  return {
    points,
    minPoint: min,
    endBalanceCents: points.length ? points[points.length - 1].balanceCents : startBalanceCents,
    totals,
  };
}
