import { useState } from 'react';
import { getCategory } from '../data/categories.js';
import { formatDate, todayISO } from '../lib/dates.js';
import { formatCents, parseAmountToCents } from '../lib/money.js';
import { FREQUENCY_LABELS, nextOccurrence } from '../lib/projection.js';

// The recurring bills/deposits behind the projections. Amount, frequency,
// and schedule date are editable in place; description/category come from
// the original transaction (delete and re-mark if those are wrong).
export default function RecurringList({ items, available, canWrite, onUpdate, onRemove }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');

  if (!available) return null; // ProjectionCard already shows the migration hint.

  const sorted = [...items].sort((a, b) =>
    a.type === b.type ? b.amountCents - a.amountCents : a.type === 'income' ? -1 : 1,
  );

  function startEdit(item) {
    setEditingId(item.id);
    setDraft({
      amount: (item.amountCents / 100).toFixed(2),
      frequency: item.frequency,
      anchorDate: item.anchorDate,
    });
    setError('');
  }

  async function saveEdit(item) {
    const amountCents = parseAmountToCents(draft.amount);
    if (amountCents === null) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.anchorDate)) {
      setError('Pick a valid date.');
      return;
    }
    const ok = await onUpdate(item.id, {
      amountCents,
      frequency: draft.frequency,
      anchorDate: draft.anchorDate,
    });
    if (ok) {
      setEditingId(null);
      setDraft(null);
      setError('');
    }
  }

  async function remove(item) {
    if (!window.confirm(`Stop projecting "${item.description}"? Past transactions are kept.`)) return;
    await onRemove(item.id);
  }

  return (
    <section className="card">
      <div className="list-header">
        <h2>Recurring bills & deposits</h2>
        <span className="list-count">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="empty-note slim">
          Nothing recurring yet. Use the “Repeats” option when adding a transaction, or the
          dropdowns on the bank CSV review screen.
        </p>
      ) : (
        <ul className="recurring-list">
          {sorted.map((item) => {
            const cat = getCategory(item.category);
            const isIncome = item.type === 'income';
            const next = nextOccurrence(item, todayISO());
            const editing = editingId === item.id;
            return (
              <li key={item.id} className={editing ? 'editing' : ''}>
                <span
                  className="tx-emoji"
                  style={{ background: `${cat.color}22`, borderColor: `${cat.color}55` }}
                >
                  {cat.emoji}
                </span>
                <div className="tx-info">
                  <span className="tx-desc">{item.description}</span>
                  {editing ? (
                    <div className="recurring-edit">
                      <input
                        value={draft.amount}
                        onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                        inputMode="decimal"
                        aria-label="Amount"
                      />
                      <select
                        value={draft.frequency}
                        onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}
                        aria-label="Frequency"
                      >
                        {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={draft.anchorDate}
                        onChange={(e) => setDraft({ ...draft, anchorDate: e.target.value })}
                        aria-label="Schedule date"
                      />
                    </div>
                  ) : (
                    <span className="tx-meta">
                      {FREQUENCY_LABELS[item.frequency]}
                      {next ? ` · next ${formatDate(next)}` : ''}
                    </span>
                  )}
                </div>
                <span className={`tx-amount ${isIncome ? 'income' : 'expense'}`}>
                  {isIncome ? '+' : '−'}
                  {formatCents(item.amountCents)}
                </span>
                {canWrite ? (
                  <div className="tx-actions">
                    {editing ? (
                      <>
                        <button type="button" className="btn ghost" onClick={() => saveEdit(item)}>
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            setEditingId(null);
                            setError('');
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn icon"
                          onClick={() => startEdit(item)}
                          aria-label={`Edit ${item.description}`}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn icon"
                          onClick={() => remove(item)}
                          aria-label={`Delete ${item.description}`}
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}
