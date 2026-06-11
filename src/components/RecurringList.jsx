import { useEffect, useState } from 'react';
import { categoriesFor, getCategory } from '../data/categories.js';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { addDaysISO, formatDate, todayISO } from '../lib/dates.js';
import { formatCents, parseAmountToCents } from '../lib/money.js';
import { FREQUENCY_LABELS, occurrencesBetween } from '../lib/projection.js';

const OCCURRENCES_PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, yearly: 1 };

// The recurring bills/deposits behind the projections. Amount, frequency,
// and schedule date are editable in place; description/category come from
// the original transaction (delete and re-mark if those are wrong).
export default function RecurringList({
  items,
  available,
  canWrite,
  onUpdate,
  onRemove,
  onBulkRemove,
  revealSignal = 0,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [collapsed, setCollapsed] = useLocalStorage('bill-tracker:recurring-collapsed:v1', true);

  // When something new is marked recurring, open the section so the result
  // is visible — an action that lands in a closed box reads as a failure.
  useEffect(() => {
    if (revealSignal > 0) setCollapsed(false);
  }, [revealSignal, setCollapsed]);

  if (!available) return null; // ProjectionCard already shows the migration hint.

  const sorted = [...items].sort((a, b) =>
    a.type === b.type ? b.amountCents - a.amountCents : a.type === 'income' ? -1 : 1,
  );

  // What lands in the next 7 days, in order — the "what's due this week"
  // glance that bill apps are loved for.
  const today = todayISO();
  const upcoming = items
    .flatMap((item) =>
      occurrencesBetween(item, addDaysISO(today, 1), addDaysISO(today, 7)).map((date) => ({
        date,
        item,
      })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  function startEdit(item) {
    setEditingId(item.id);
    setDraft({
      amount: (item.amountCents / 100).toFixed(2),
      frequency: item.frequency,
      anchorDate: item.anchorDate,
      category: item.category,
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
      category: draft.category,
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

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  async function bulkDelete() {
    const ids = [...selected];
    if (
      !window.confirm(
        `Stop projecting ${ids.length} selected item${ids.length === 1 ? '' : 's'}? Past transactions are kept.`,
      )
    ) {
      return;
    }
    const ok = await onBulkRemove(ids);
    if (ok) setSelected(new Set());
  }

  return (
    <section className="card">
      <div className="list-header">
        <button
          type="button"
          className="collapse-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
        >
          <span className="collapse-chevron">{collapsed ? '▸' : '▾'}</span>
          <h2>Recurring bills & deposits</h2>
        </button>
        <span className="list-count">
          {items.length} {items.length === 1 ? 'schedule' : 'schedules'}
          {collapsed && upcoming.length > 0
            ? ` · next: ${upcoming[0].item.description} ${formatDate(upcoming[0].date)}`
            : ''}
        </span>
      </div>

      {collapsed ? null : (
        <>
          <p className="section-sub">
            Each row here is a repeating schedule — “rent, every month” — used to project your
            future balance. It isn't your spending history: real payments still land in
            Transactions when they happen, and the forecast won't count a bill twice.
          </p>

          {canWrite && items.length > 0 ? (
        <div className="bulk-bar">
          <label className="bulk-check">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(items.map((r) => r.id)))
              }
              aria-label="Select all recurring items"
            />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </label>
          {selected.size > 0 ? (
            <button type="button" className="btn ghost danger" onClick={bulkDelete}>
              Delete selected
            </button>
          ) : (
            <span className="bulk-hint">tick items to delete several at once</span>
          )}
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <div className="upcoming-strip">
          <span className="upcoming-label">Next 7 days</span>
          <div className="upcoming-chips">
            {upcoming.map(({ date, item }, i) => (
              <span key={`${item.id}-${date}-${i}`} className="upcoming-chip" title={item.description}>
                <span className="chip-emoji">{getCategory(item.category).emoji}</span>
                <span className="chip-desc">{item.description}</span>
                <strong className={item.type === 'income' ? 'income' : 'expense'}>
                  {item.type === 'income' ? '+' : '−'}
                  {formatCents(item.amountCents)}
                </strong>
                <span className="chip-date">{formatDate(date)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

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
            // Unroll the schedule a little so "every week" visibly reads as
            // a string of dates, not a single entry.
            const nextFew = occurrencesBetween(
              item,
              addDaysISO(today, 1),
              addDaysISO(today, 366),
            ).slice(0, 3);
            const monthlyEquivalent =
              item.frequency === 'monthly'
                ? null
                : Math.round((item.amountCents * OCCURRENCES_PER_YEAR[item.frequency]) / 12);
            const editing = editingId === item.id;
            return (
              <li key={item.id} className={editing ? 'editing' : ''}>
                {canWrite ? (
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    aria-label={`Select recurring ${item.description}`}
                  />
                ) : null}
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
                      <select
                        value={draft.category}
                        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                        aria-label="Category"
                      >
                        {categoriesFor(item.type).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.emoji} {c.label}
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
                      {monthlyEquivalent !== null ? ` (≈ ${formatCents(monthlyEquivalent)}/mo)` : ''}
                      {nextFew.length > 0
                        ? ` · next ${nextFew.map((d) => formatDate(d)).join(', ')}${nextFew.length === 3 ? ', …' : ''}`
                        : ''}
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
        </>
      )}
    </section>
  );
}
