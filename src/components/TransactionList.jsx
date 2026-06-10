import { getCategory } from '../data/categories.js';
import { formatDate, monthLabel } from '../lib/dates.js';
import { formatCents } from '../lib/money.js';

export default function TransactionList({
  transactions,
  month,
  editingId,
  onEdit,
  onDelete,
  onLoadSample,
  canEdit = true,
}) {
  return (
    <section className="card">
      <div className="list-header">
        <h2>Transactions · {monthLabel(month)}</h2>
        <span className="list-count">
          {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {transactions.length === 0 ? (
        <div className="empty-state">
          <p>Nothing recorded for {monthLabel(month)} yet.</p>
          {onLoadSample ? (
            <>
              <p className="empty-sub">
                New here? Load some sample data to see the charts in action — you can clear it
                anytime.
              </p>
              <button type="button" className="btn primary" onClick={onLoadSample}>
                Load sample data
              </button>
            </>
          ) : (
            <p className="empty-sub">
              {canEdit
                ? 'Use the form above to add a transaction for this month.'
                : 'Nothing has been recorded for this month.'}
            </p>
          )}
        </div>
      ) : (
        <ul className="tx-list">
          {transactions.map((t) => {
            const cat = getCategory(t.category);
            const isIncome = t.type === 'income';
            return (
              <li key={t.id} className={editingId === t.id ? 'editing' : ''}>
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
                {canEdit ? (
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
