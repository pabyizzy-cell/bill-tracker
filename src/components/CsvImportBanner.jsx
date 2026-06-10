import { getCategory } from '../data/categories.js';
import { formatDate } from '../lib/dates.js';
import { formatCents } from '../lib/money.js';

const PREVIEW_COUNT = 6;

// Review step for a parsed bank CSV: shows what will be added and what's
// being skipped, and waits for explicit confirmation before saving anything.
export default function CsvImportBanner({ pending, busy, onConfirm, onCancel }) {
  const { format, toAdd, duplicates, skippedTransfers, skippedUnreadable } = pending;
  const expenses = toAdd.filter((t) => t.type === 'expense').length;
  const income = toAdd.length - expenses;
  const dates = toAdd.map((t) => t.date).sort();

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

      <ul className="import-preview">
        {toAdd.slice(0, PREVIEW_COUNT).map((t, i) => {
          const cat = getCategory(t.category);
          return (
            // Index keys are fine here: the list is static until confirmed/cancelled.
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
            </li>
          );
        })}
      </ul>
      {toAdd.length > PREVIEW_COUNT ? (
        <p className="import-more">…and {toAdd.length - PREVIEW_COUNT} more.</p>
      ) : null}

      <div className="form-actions">
        <button type="button" className="btn primary" onClick={onConfirm} disabled={busy}>
          {busy ? 'Importing…' : `Add ${toAdd.length} transaction${toAdd.length === 1 ? '' : 's'}`}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </section>
  );
}
