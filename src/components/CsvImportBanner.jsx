import { useState } from 'react';
import { getCategory } from '../data/categories.js';
import { formatDate } from '../lib/dates.js';
import { formatCents } from '../lib/money.js';

const RECURRENCE_OPTIONS = [
  ['once', 'One-time'],
  ['weekly', 'Every week'],
  ['biweekly', 'Every 2 weeks'],
  ['monthly', 'Every month'],
  ['yearly', 'Every year'],
];

// Review step for a parsed bank CSV. Every row gets a dropdown to mark it as
// a one-time transaction or a recurring bill/deposit — individually, or in
// bulk by ticking rows and applying a choice to all of them at once.
// Nothing is saved until the user confirms.
export default function CsvImportBanner({ pending, busy, onConfirm, onCancel }) {
  const { format, toAdd, duplicates, skippedTransfers, skippedUnreadable } = pending;
  const [choices, setChoices] = useState(() => toAdd.map(() => 'once'));
  const [checked, setChecked] = useState(() => toAdd.map(() => false));

  const expenses = toAdd.filter((t) => t.type === 'expense').length;
  const income = toAdd.length - expenses;
  const dates = toAdd.map((t) => t.date).sort();
  const recurringCount = choices.filter((c) => c !== 'once').length;
  const checkedCount = checked.filter(Boolean).length;
  const allChecked = checkedCount === toAdd.length;

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

  function applyToChecked(value) {
    setChoices((prev) => prev.map((c, i) => (checked[i] ? value : c)));
    setChecked(toAdd.map(() => false));
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
        balance projections. Tick several rows to set them all at once.
      </p>

      <div className="bulk-bar">
        <label className="bulk-check">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => setChecked(toAdd.map(() => e.target.checked))}
            aria-label="Select all rows"
          />
          {checkedCount > 0 ? `${checkedCount} selected` : 'Select all'}
        </label>
        {checkedCount > 0 ? (
          <label className="bulk-apply">
            set {checkedCount === 1 ? 'it' : 'them'} to
            <select
              value=""
              onChange={(e) => e.target.value && applyToChecked(e.target.value)}
              aria-label="Set recurrence for selected rows"
            >
              <option value="" disabled>
                choose…
              </option>
              {RECURRENCE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <ul className="import-preview scrollable">
        {toAdd.map((t, i) => {
          const cat = getCategory(t.category);
          return (
            // Index keys are safe: the list never reorders while visible.
            <li key={i}>
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={(e) =>
                  setChecked((prev) => prev.map((c, j) => (j === i ? e.target.checked : c)))
                }
                aria-label={`Select ${t.description}`}
              />
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
                {RECURRENCE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
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
