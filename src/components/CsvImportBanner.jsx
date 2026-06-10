import { useState } from 'react';
import { getCategory } from '../data/categories.js';
import { formatDate } from '../lib/dates.js';
import { formatCents } from '../lib/money.js';

// Review step for a parsed bank CSV. Every row gets a dropdown to mark it as
// a one-time transaction or a recurring bill/deposit; nothing is saved until
// the user confirms. onConfirm receives the recurrence choice per row.
export default function CsvImportBanner({ pending, busy, onConfirm, onCancel }) {
  const { format, toAdd, duplicates, skippedTransfers, skippedUnreadable } = pending;
  const [choices, setChoices] = useState(() => toAdd.map(() => 'once'));

  const expenses = toAdd.filter((t) => t.type === 'expense').length;
  const income = toAdd.length - expenses;
  const dates = toAdd.map((t) => t.date).sort();
  const recurringCount = choices.filter((c) => c !== 'once').length;

  const skippedBits = [];
  if (skippedTransfers > 0) {
    skippedBits.push(
      `${skippedTransfers} card payment${skippedTransfers === 1 ? '' : 's'} (money moving between your own accounts)`,
    );
  }
  if (duplicates > 0) skippedBits.push(`${duplicates} already in your data`);
  if (skippedUnreadable > 0) {
    skippedBits.push(`${skippedUnreadable} unreadable row${skippedUnreadable === 1 ? '' : 's'}`);
  }

  function setChoice(index, value) {
    setChoices((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  return (
    <section className="card import-card">
      <h2>Review import · {format}</h2>
      <p className="import-summary">
        Found <strong>{toAdd.length}</strong> new transaction{toAdd.length === 1 ? '' : 's'} from{' '}
        {formatDate(dates[0])} to {formatDate(dates[dates.length - 1])}: {expenses} expense
        {expenses === 1 ? '' : 's'}, {income} income.
      </p>
      {skippedBits.length > 0 ? (
        <p className="import-skips">Not importing: {skippedBits.join(' · ')}.</p>
      ) : null}
      <p className="import-skips">
        Mark anything that repeats — rent, paychecks, subscriptions — and it will also power your
        balance projections.
      </p>

      <ul className="import-preview scrollable">
        {toAdd.map((t, i) => {
          const cat = getCategory(t.category);
          return (
            // Index keys are safe: the list never reorders while visible.
            <li key={i}>
              <span className="import-date">{formatDate(t.date)}</span>
              <span className="import-desc">{t.description}</span>
              <span className="import-cat">
                {cat.emoji} {cat.label}
              </span>
              <span className={`tx-amount ${t.type === 'income' ? 'income' : 'expense'}`}>
                {t.type === 'income' ? '+' : '−'}
                {formatCents(t.amountCents)}
              </span>
              <select
                className="import-repeat"
                value={choices[i]}
                onChange={(e) => setChoice(i, e.target.value)}
                aria-label={`Recurrence for ${t.description}`}
              >
                <option value="once">One-time</option>
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Every month</option>
                <option value="yearly">Every year</option>
              </select>
            </li>
          );
        })}
      </ul>

      <div className="form-actions">
        <button type="button" className="btn primary" onClick={() => onConfirm(choices)} disabled={busy}>
          {busy
            ? 'Importing…'
            : `Add ${toAdd.length} transaction${toAdd.length === 1 ? '' : 's'}${
                recurringCount > 0
                  ? ` + ${recurringCount} recurring item${recurringCount === 1 ? '' : 's'}`
                  : ''
              }`}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </section>
  );
}
