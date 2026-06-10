import { useMemo, useRef, useState } from 'react';
import CategoryDonut from './components/CategoryDonut.jsx';
import MonthPicker from './components/MonthPicker.jsx';
import SummaryCards from './components/SummaryCards.jsx';
import TransactionForm from './components/TransactionForm.jsx';
import TransactionList from './components/TransactionList.jsx';
import TrendChart from './components/TrendChart.jsx';
import { getCategory } from './data/categories.js';
import { generateSampleData } from './data/sampleData.js';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import { currentMonthKey, lastNMonths, monthKeyOf } from './lib/dates.js';
import { formatCents } from './lib/money.js';

const STORAGE_KEY = 'bill-tracker:transactions:v1';

export default function App() {
  const [transactions, setTransactions] = useLocalStorage(STORAGE_KEY, []);
  const [month, setMonth] = useState(currentMonthKey());
  const [editingId, setEditingId] = useState(null);
  const formRef = useRef(null);
  const importRef = useRef(null);

  const monthTransactions = useMemo(
    () =>
      transactions
        .filter((t) => monthKeyOf(t.date) === month)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [transactions, month],
  );

  const totals = useMemo(() => {
    let income = 0;
    let spending = 0;
    for (const t of monthTransactions) {
      if (t.type === 'income') income += t.amountCents;
      else spending += t.amountCents;
    }
    let balance = 0;
    for (const t of transactions) {
      balance += t.type === 'income' ? t.amountCents : -t.amountCents;
    }
    return { income, spending, net: income - spending, balance };
  }, [transactions, monthTransactions]);

  const byCategory = useMemo(() => {
    const sums = new Map();
    for (const t of monthTransactions) {
      if (t.type !== 'expense') continue;
      sums.set(t.category, (sums.get(t.category) ?? 0) + t.amountCents);
    }
    const total = [...sums.values()].reduce((a, b) => a + b, 0);
    return [...sums.entries()]
      .map(([id, value]) => {
        const cat = getCategory(id);
        return {
          id,
          name: cat.label,
          emoji: cat.emoji,
          color: cat.color,
          value,
          pct: total ? value / total : 0,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [monthTransactions]);

  const trend = useMemo(() => {
    const keys = lastNMonths(month, 6);
    const buckets = new Map(keys.map((k) => [k, { income: 0, spending: 0 }]));
    for (const t of transactions) {
      const bucket = buckets.get(monthKeyOf(t.date));
      if (!bucket) continue;
      if (t.type === 'income') bucket.income += t.amountCents;
      else bucket.spending += t.amountCents;
    }
    return keys.map((k) => ({ key: k, ...buckets.get(k) }));
  }, [transactions, month]);

  function addTransaction(tx) {
    setTransactions((prev) => [{ ...tx, id: crypto.randomUUID() }, ...prev]);
    setMonth(monthKeyOf(tx.date));
  }

  function saveEdit(tx) {
    setTransactions((prev) => prev.map((t) => (t.id === editingId ? { ...t, ...tx } : t)));
    setEditingId(null);
    setMonth(monthKeyOf(tx.date));
  }

  function startEdit(id) {
    setEditingId(id);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function deleteTransaction(id) {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    if (!window.confirm(`Delete "${tx.description}" (${formatCents(tx.amountCents)})?`)) return;
    if (editingId === id) setEditingId(null);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  function loadSampleData() {
    if (transactions.length > 0 && !window.confirm('Replace your current data with sample data?')) {
      return;
    }
    setTransactions(generateSampleData());
    setMonth(currentMonthKey());
    setEditingId(null);
  }

  function clearAll() {
    if (!window.confirm('Delete ALL transactions? Export a backup first if you want to keep them.')) {
      return;
    }
    setTransactions([]);
    setEditingId(null);
  }

  function exportCsv() {
    const header = 'date,type,category,description,amount';
    const lines = [...transactions]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((t) =>
        [
          t.date,
          t.type,
          getCategory(t.category).label,
          `"${t.description.replaceAll('"', '""')}"`,
          (t.amountCents / 100).toFixed(2),
        ].join(','),
      );
    downloadFile('bill-tracker.csv', 'text/csv', [header, ...lines].join('\n'));
  }

  function exportJson() {
    const payload = {
      app: 'bill-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions,
    };
    downloadFile('bill-tracker-backup.json', 'application/json', JSON.stringify(payload, null, 2));
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const list = Array.isArray(parsed) ? parsed : parsed?.transactions;
        if (!Array.isArray(list)) throw new Error('no transaction list found');
        const cleaned = list
          .filter(
            (t) =>
              t &&
              typeof t.description === 'string' &&
              Number.isFinite(t.amountCents) &&
              t.amountCents > 0 &&
              /^\d{4}-\d{2}-\d{2}$/.test(t.date ?? ''),
          )
          .map((t) => ({
            id: typeof t.id === 'string' ? t.id : crypto.randomUUID(),
            type: t.type === 'income' ? 'income' : 'expense',
            category: typeof t.category === 'string' ? t.category : 'other',
            description: t.description,
            amountCents: Math.round(t.amountCents),
            date: t.date,
          }));
        if (cleaned.length === 0) throw new Error('no valid transactions found');
        if (!window.confirm(`Replace your current data with ${cleaned.length} imported transactions?`)) {
          return;
        }
        setTransactions(cleaned);
        setEditingId(null);
      } catch (err) {
        window.alert(`Couldn't import that file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  const editingTx = transactions.find((t) => t.id === editingId) ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">💸</span>
          <div>
            <h1>Bill Tracker</h1>
            <p className="tagline">Know where your money goes</p>
          </div>
        </div>
        <MonthPicker month={month} onChange={setMonth} />
        <div className="data-actions">
          <button type="button" className="btn ghost" onClick={exportCsv} disabled={!transactions.length}>
            Export CSV
          </button>
          <button type="button" className="btn ghost" onClick={exportJson} disabled={!transactions.length}>
            Backup
          </button>
          <button type="button" className="btn ghost" onClick={() => importRef.current?.click()}>
            Restore
          </button>
          <button type="button" className="btn ghost danger" onClick={clearAll} disabled={!transactions.length}>
            Clear
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={importJson}
          />
        </div>
      </header>

      <SummaryCards totals={totals} />

      <div className="charts-grid">
        <CategoryDonut data={byCategory} totalCents={totals.spending} />
        <TrendChart data={trend} />
      </div>

      <section className="card" ref={formRef}>
        <h2>{editingTx ? 'Edit transaction' : 'Add a transaction'}</h2>
        <TransactionForm
          key={editingId ?? 'new'}
          editingTx={editingTx}
          onSubmit={editingTx ? saveEdit : addTransaction}
          onCancel={editingTx ? () => setEditingId(null) : null}
        />
      </section>

      <TransactionList
        transactions={monthTransactions}
        month={month}
        editingId={editingId}
        onEdit={startEdit}
        onDelete={deleteTransaction}
        onLoadSample={transactions.length === 0 ? loadSampleData : null}
      />

      <footer className="app-footer">
        Your data stays in this browser (localStorage) — nothing is uploaded anywhere. Use Backup /
        Restore to move it between devices.
      </footer>
    </div>
  );
}

function downloadFile(name, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
