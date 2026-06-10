import { useMemo, useRef, useState } from 'react';
import AuthPanel from './components/AuthPanel.jsx';
import CategoryDonut from './components/CategoryDonut.jsx';
import MonthPicker from './components/MonthPicker.jsx';
import SharingPanel from './components/SharingPanel.jsx';
import SummaryCards from './components/SummaryCards.jsx';
import TransactionForm from './components/TransactionForm.jsx';
import TransactionList from './components/TransactionList.jsx';
import TrendChart from './components/TrendChart.jsx';
import { getCategory } from './data/categories.js';
import { generateSampleData } from './data/sampleData.js';
import { useAuth } from './hooks/useAuth.js';
import { useShares } from './hooks/useShares.js';
import { useTransactions } from './hooks/useTransactions.js';
import { currentMonthKey, lastNMonths, monthKeyOf } from './lib/dates.js';
import { formatCents } from './lib/money.js';

const CONTEXT_KEY = 'bill-tracker:context:v1';

export default function App() {
  const { session } = useAuth();
  const shares = useShares(session);
  const [pickedOwnerId, setPickedOwnerId] = useState(() => {
    try {
      return window.localStorage.getItem(CONTEXT_KEY) ?? '';
    } catch {
      return '';
    }
  });

  // Whose dataset is open. Falls back to the user's own data whenever the
  // picked context no longer exists (e.g. access was revoked).
  const contexts = useMemo(() => {
    if (!session) return [];
    return [
      { ownerId: session.user.id, ownerEmail: session.user.email, role: 'owner' },
      ...shares.sharedWithMe.map((s) => ({
        ownerId: s.owner_id,
        ownerEmail: s.owner_email,
        role: s.role,
      })),
    ];
  }, [session, shares.sharedWithMe]);

  const context = useMemo(() => {
    if (!session) return null;
    return contexts.find((c) => c.ownerId === pickedOwnerId) ?? contexts[0];
  }, [session, contexts, pickedOwnerId]);

  function switchContext(ownerId) {
    setPickedOwnerId(ownerId);
    try {
      window.localStorage.setItem(CONTEXT_KEY, ownerId);
    } catch {
      // Best effort — losing the preference is harmless.
    }
  }

  const store = useTransactions(session, context);
  const { transactions } = store;
  const [month, setMonth] = useState(currentMonthKey());
  const [editingId, setEditingId] = useState(null);
  const formRef = useRef(null);
  const importRef = useRef(null);

  const ownData = !store.cloudMode || !context || context.role === 'owner';
  const readOnly = store.cloudMode && !store.canWrite;

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

  async function addTransaction(tx) {
    const ok = await store.add(tx);
    if (ok) setMonth(monthKeyOf(tx.date));
    return ok;
  }

  async function saveEdit(tx) {
    const ok = await store.update(editingId, tx);
    if (ok) {
      setEditingId(null);
      setMonth(monthKeyOf(tx.date));
    }
    return ok;
  }

  function startEdit(id) {
    setEditingId(id);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function deleteTransaction(id) {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    if (!window.confirm(`Delete "${tx.description}" (${formatCents(tx.amountCents)})?`)) return;
    if (editingId === id) setEditingId(null);
    await store.remove(id);
  }

  async function loadSampleData() {
    if (transactions.length > 0 && !window.confirm('Replace your current data with sample data?')) {
      return;
    }
    const ok = await store.replaceAll(generateSampleData());
    if (ok) {
      setMonth(currentMonthKey());
      setEditingId(null);
    }
  }

  async function clearAll() {
    if (!window.confirm('Delete ALL transactions? Export a backup first if you want to keep them.')) {
      return;
    }
    const ok = await store.replaceAll([]);
    if (ok) setEditingId(null);
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
    reader.onload = async () => {
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
        const ok = await store.replaceAll(cleaned);
        if (ok) setEditingId(null);
      } catch (err) {
        window.alert(`Couldn't import that file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  const editingTx = transactions.find((t) => t.id === editingId) ?? null;
  const showImportBanner =
    store.cloudMode && ownData && !store.loading && transactions.length === 0 && store.localCount > 0;

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
          {ownData ? (
            <>
              <button type="button" className="btn ghost" onClick={() => importRef.current?.click()}>
                Restore
              </button>
              <button
                type="button"
                className="btn ghost danger"
                onClick={clearAll}
                disabled={!transactions.length}
              >
                Clear
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={importJson}
              />
            </>
          ) : null}
        </div>
      </header>

      <AuthPanel
        session={session}
        contexts={contexts}
        activeOwnerId={context?.ownerId ?? ''}
        onSwitch={switchContext}
      />

      {store.error ? (
        <div className="alert error">
          <span>{store.error}</span>
          <button type="button" className="btn link" onClick={store.dismissError}>
            dismiss
          </button>
        </div>
      ) : null}

      {store.loading ? <div className="alert info">Syncing…</div> : null}

      {!ownData ? (
        <div className="alert info">
          You're viewing <strong>{context.ownerEmail}</strong>'s data
          {readOnly ? ' with view-only access.' : ' with full access.'}
        </div>
      ) : null}

      {showImportBanner ? (
        <div className="alert banner">
          <span>
            This browser has <strong>{store.localCount}</strong>{' '}
            {store.localCount === 1 ? 'entry' : 'entries'} saved from before you signed in. Move
            {store.localCount === 1 ? ' it' : ' them'} into your account?
          </span>
          <button type="button" className="btn primary" onClick={store.importLocal}>
            Import into my account
          </button>
        </div>
      ) : null}

      <SummaryCards totals={totals} />

      <div className="charts-grid">
        <CategoryDonut data={byCategory} totalCents={totals.spending} />
        <TrendChart data={trend} />
      </div>

      {readOnly ? null : (
        <section className="card" ref={formRef}>
          <h2>{editingTx ? 'Edit transaction' : 'Add a transaction'}</h2>
          <TransactionForm
            key={editingId ?? 'new'}
            editingTx={editingTx}
            onSubmit={editingTx ? saveEdit : addTransaction}
            onCancel={editingTx ? () => setEditingId(null) : null}
          />
        </section>
      )}

      <TransactionList
        transactions={monthTransactions}
        month={month}
        editingId={editingId}
        onEdit={startEdit}
        onDelete={deleteTransaction}
        onLoadSample={ownData && transactions.length === 0 ? loadSampleData : null}
        canEdit={!readOnly}
      />

      {store.cloudMode && ownData ? (
        <SharingPanel
          available={shares.available}
          shares={shares.myShares}
          onAdd={shares.addShare}
          onUpdate={shares.updateShare}
          onRemove={shares.removeShare}
        />
      ) : null}

      <footer className="app-footer">
        {store.cloudMode
          ? 'Synced to your account — your data follows you to any device you sign in on.'
          : 'Your data stays in this browser (localStorage) — nothing is uploaded anywhere. Use Backup / Restore to move it between devices.'}
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
