import { useState } from 'react';
import { categoriesFor } from '../data/categories.js';
import { todayISO } from '../lib/dates.js';
import { parseAmountToCents } from '../lib/money.js';

export default function TransactionForm({ editingTx, onSubmit, onCancel }) {
  const [type, setType] = useState(editingTx?.type ?? 'expense');
  const [description, setDescription] = useState(editingTx?.description ?? '');
  const [amount, setAmount] = useState(
    editingTx ? (editingTx.amountCents / 100).toFixed(2) : '',
  );
  const [category, setCategory] = useState(editingTx?.category ?? 'groceries');
  const [date, setDate] = useState(editingTx?.date ?? todayISO());
  const [error, setError] = useState('');

  const categories = categoriesFor(type);

  function switchType(next) {
    setType(next);
    const list = categoriesFor(next);
    if (!list.some((c) => c.id === category)) setCategory(list[0].id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const amountCents = parseAmountToCents(amount);
    if (!description.trim()) return setError('Give it a short description.');
    if (amountCents === null) return setError('Enter an amount greater than zero, like 12.50.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Pick a date.');
    setError('');
    const ok = await onSubmit({ type, description: description.trim(), amountCents, category, date });
    if (ok && !editingTx) {
      // Keep type, category, and date so several similar entries can be added quickly.
      setDescription('');
      setAmount('');
    }
  }

  return (
    <form className="tx-form" onSubmit={handleSubmit}>
      <div className="type-toggle" role="radiogroup" aria-label="Transaction type">
        <button
          type="button"
          className={type === 'expense' ? 'active expense' : ''}
          onClick={() => switchType('expense')}
        >
          − Expense
        </button>
        <button
          type="button"
          className={type === 'income' ? 'active income' : ''}
          onClick={() => switchType('income')}
        >
          + Income
        </button>
      </div>

      <div className="form-grid">
        <label>
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === 'expense' ? 'e.g. Electric bill' : 'e.g. Paycheck'}
          />
        </label>
        <label>
          Amount
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="form-actions">
        <button type="submit" className="btn primary">
          {editingTx ? 'Save changes' : 'Add transaction'}
        </button>
        {onCancel ? (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
