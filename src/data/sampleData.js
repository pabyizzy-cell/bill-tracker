import { currentMonthKey, daysInMonth, shiftMonth, todayISO } from '../lib/dates.js';

// Small seeded PRNG so the sample data looks varied but is stable between loads.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSampleData() {
  const rand = mulberry32(987654321);
  const between = (min, max) => Math.round(min + (max - min) * rand());
  const pick = (list) => list[Math.floor(rand() * list.length)];

  const end = currentMonthKey();
  const todayDay = Number(todayISO().slice(8, 10));
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(end, -i));

  const txs = [];
  for (const mk of months) {
    const isCurrent = mk === end;
    const maxDay = daysInMonth(mk);
    const add = (day, type, category, description, amountCents) => {
      // Don't generate future-dated entries in the current month.
      if (isCurrent && day > todayDay) return;
      const d = Math.min(day, maxDay);
      txs.push({
        id: crypto.randomUUID(),
        type,
        category,
        description,
        amountCents,
        date: `${mk}-${String(d).padStart(2, '0')}`,
      });
    };

    add(1, 'income', 'salary', 'Paycheck', 265000);
    add(15, 'income', 'salary', 'Paycheck', 265000);
    if (rand() < 0.5) {
      add(between(8, 24), 'income', 'freelance', 'Photo shoot booking', between(15000, 45000));
    }

    add(1, 'expense', 'housing', 'Rent', 145000);
    add(5, 'expense', 'utilities', 'Electric & water', between(9000, 16000));
    add(9, 'expense', 'utilities', 'Internet', 6500);
    add(3, 'expense', 'subscriptions', 'Streaming bundle', 2400);
    add(11, 'expense', 'subscriptions', 'Cloud photo storage', 1100);
    add(17, 'expense', 'subscriptions', 'Gym membership', 4200);
    add(25, 'expense', 'savings', 'Transfer to savings', 30000);

    for (const d of [2, 9, 16, 23, 28]) {
      add(d + between(0, 2), 'expense', 'groceries', 'Groceries', between(6000, 14000));
    }

    const diningSpots = ['Tacos with friends', 'Coffee run', 'Pizza night', 'Brunch', 'Thai takeout', 'Burgers'];
    for (let i = 0, n = between(3, 6); i < n; i++) {
      add(between(1, 28), 'expense', 'dining', pick(diningSpots), between(1200, 5500));
    }

    for (let i = 0, n = between(2, 4); i < n; i++) {
      add(between(2, 27), 'expense', 'transport', rand() < 0.7 ? 'Gas' : 'Rideshare', between(2500, 6000));
    }

    if (rand() < 0.8) add(between(5, 26), 'expense', 'shopping', rand() < 0.5 ? 'Clothes' : 'Home goods', between(3000, 12000));
    if (rand() < 0.6) add(between(6, 27), 'expense', 'entertainment', rand() < 0.5 ? 'Movie night' : 'Concert tickets', between(1500, 9000));
    if (rand() < 0.6) add(between(4, 25), 'expense', 'health', 'Pharmacy', between(1500, 6000));
    if (rand() < 0.5) add(between(4, 25), 'expense', 'personal', 'Haircut', between(2500, 5000));
  }

  return txs;
}
