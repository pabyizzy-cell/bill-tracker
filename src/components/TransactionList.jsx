import { useEffect, useState } from 'react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategory } from '../data/categories.js';
import { formatDate, monthLabel } from '../lib/dates.js';
import { formatCents } from '../lib/money.js';
import { FREQUENCY_LABELS } from '../lib/projection.js';

// Shows one month of transactions — or, when a search query is active,
// matches from every month. Select mode adds checkboxes for bulk delete /
// bulk re-categorize.
export default function TransactionList({
  transactions,
  totalCount = 0,
  month,
  searchQuery = '',
  onSearchChange,
  searching = false,
  editingId,
  onEdit,
  onDelete,
  onBulkDelete,
  onBulkCategory,
  onBulkRecurring,
  onLoadSample,
  canEdit = true,
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  // Different month or query = different rows; stale selections would be
  // invisible and dangerous to act on.
  useEffect(() => {
    setSelected(new Set());
  }, [month, searchQuery]);

  const elsewhere = totalCount - transactions.length;
  const visibleSelected = transactions.filter((t) => selected.has(t.id));
  const allSelected = transactions.length > 0 && visibleSelected.length === transactions.length;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(transactions.map((t) => t.id)));
  }

  async function bulkDelete() {
    const ok = await onBulkDelete(visibleSelected.map((t) => t.id));
    if (ok) setSelected(new Set());
  }

  async function bulkCategory(category) {
    if (!category) return;
    const ok = await onBulkCategory(visibleSelected.map((t) => t.id), category);
    if (ok) setSelected(new Set());
  }

  async function bulkRecurring(frequency) {
    if (!frequency) return;
    const ok = await onBulkRecurring(visibleSelected.map((t) => t.id), frequency);
    if (ok) setSelected(new Set());
  }

  return (
    <section className="card">
      <div className="list-header">
        <h2>
          {searching
            ? `Search results`
            : `Transactions · ${monthLabel(month)}`}
        </h2>
        <span className="list-count">
          {searching
            ? `${transactions.length} match${transactions.length === 1 ? '' : 'es'} across all months`
            : `${transactions.length} ${transactions.length === 1 ? 'entry' : 'entries'}` +
              (elsewhere > 0 ? ` · ${totalCount} total across all months` : '')}
        </span>
      </div>

      {totalCount > 0 ? (
        <div className="list-tools">
          <input
            type="search"
            className="search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search all transactions…"
            aria-label="Search transactions"
          />
          {canEdit && transactions.length > 0 ? (
            <button
              type="button"
              className={`btn ghost ${selectMode ? 'active' : ''}`}
              onClick={() => {
                setSelectMode((v) => !v);
                setSelected(new Set());
              }}
            >
              {selectMode ? 'Done selecting' : 'Select'}
            </button>
          ) : null}
        </div>
      ) : null}

      {selectMode && transactions.length > 0 ? (
        <div className="bulk-bar">
          <label className="bulk-check">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all visible transactions"
            />
            {visibleSelected.length > 0 ? `${visibleSelected.length} selected` : 'Select all'}
          </label>
          {visibleSelected.length > 0 ? (
            <>
              <label className="bulk-apply">
                mark as repeating
                <select
                  value=""
                  onChange={(e) => bulkRecurring(e.target.value)}
                  aria-label="Mark selected transactions as repeating"
                >
                  <option value="" disabled>
                    choose…
                  </option>
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="bulk-apply">
                change category to
                <select
                  value=""
                  onChange={(e) => bulkCategory(e.target.value)}
                  aria-label="Change category for selected transactions"
                >
                  <option value="" disabled>
                    choose…
                  </option>
                  <optgroup label="Spending">
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Income">
                    {INCOME_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <button type="button" className="btn ghost danger" onClick={bulkDelete}>
                Delete selected
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {transactions.length === 0 ? (
        <div className="empty-state">
          {searching ? (
            <p>No transactions match “{searchQuery}”.</p>
          ) : (
            <p>
              Nothing recorded for {monthLabel(month)} yet.
              {elsewhere > 0
                ? ` (${elsewhere} ${elsewhere === 1 ? 'entry lives' : 'entries live'} in other months — use the ‹ › arrows up top.)`
                : ''}
            </p>
          )}
          {onLoadSample && !searching ? (
            <>
              <p className="empty-sub">
                New here? Load some sample data to see the charts in action — you can clear it
                anytime.
              </p>
              <button type="button" className="btn primary" onClick={onLoadSample}>
                Load sample data
              </button>
            </>
          ) : null}
          {!onLoadSample && !searching ? (
            <p className="empty-sub">
              {canEdit
                ? 'Use the form above to add a transaction for this month.'
                : 'Nothing has been recorded for this month.'}
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="tx-list">
          {transactions.map((t) => {
            const cat = getCategory(t.category);
            const isIncome = t.type === 'income';
            return (
              <li key={t.id} className={editingId === t.id ? 'editing' : ''}>
                {selectMode ? (
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    aria-label={`Select ${t.description}`}
                  />
                ) : null}
                <span
                  className="tx-emoji"
                  style={{ background: `${cat.color}22`, borderColor: `${cat.color}55` }}
                >
                  {cat.emoji}
                </span>
                <div className="tx-info">
                  <span className="tx-desc">{t.description}</span>
                  <span className="tx-meta">
                    {cat.label} · {formatDate(t.date)}
                  </span>
                </div>
                <span className={`tx-amount ${isIncome ? 'income' : 'expense'}`}>
                  {isIncome ? '+' : '−'}
                  {formatCents(t.amountCents)}
                </span>
                {canEdit && !selectMode ? (
                  <div className="tx-actions">
                    <button
                      type="button"
                      className="btn icon"
                      onClick={() => onEdit(t.id)}
                      aria-label={`Edit ${t.description}`}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="btn icon"
                      onClick={() => onDelete(t.id)}
                      aria-label={`Delete ${t.description}`}
                    >
                      🗑️
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
