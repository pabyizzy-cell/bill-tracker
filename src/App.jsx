import { useMemo, useRef, useState } from 'react';
import AuthPanel from './components/AuthPanel.jsx';
import CategoryDonut from './components/CategoryDonut.jsx';
import CsvImportBanner from './components/CsvImportBanner.jsx';
import MonthPicker from './components/MonthPicker.jsx';
import ProjectionCard from './components/ProjectionCard.jsx';
import RecurringList from './components/RecurringList.jsx';
import SharingPanel from './components/SharingPanel.jsx';
import SummaryCards from './components/SummaryCards.jsx';
import TransactionForm from './components/TransactionForm.jsx';
import TransactionList from './components/TransactionList.jsx';
import TrendChart from './components/TrendChart.jsx';
import { getCategory } from './data/categories.js';
import {
  SAMPLE_STARTING_BALANCE_CENTS,
  generateSampleData,
  generateSampleRecurring,
} from './data/sampleData.js';
import { useAuth } from './hooks/useAuth.js';
import { useLocalStorage } from './hooks/useLocalStorage.js';
import { useRecurring } from './hooks/useRecurring.js';
import { useSettings } from './hooks/useSettings.js';
import { useShares } from './hooks/useShares.js';
import { useTransactions } from './hooks/useTransactions.js';
import { mapBankCsv } from './lib/bankImport.js';
import { currentMonthKey, lastNMonths, monthKeyOf, todayISO } from './lib/dates.js';
import { formatCents } from './lib/money.js';
import {
  FREQUENCY_LABELS,
  currentBalanceCents,
  estimateDailyVariableSpend,
} from './lib/projection.js';

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
  const recurring = useRecurring(session, context);
  const { settings, available: settingsAvailable, saveStartingBalance, clear: clearSettings } =
    useSettings(session, context);
  const [includeVariable, setIncludeVariable] = useLocalStorage(
    'bill-tracker:projection-variable:v1',
    true,
  );
  const { transactions } = store;
  const [month, setMonth] = useState(currentMonthKey());
  const [editingId, setEditingId] = useState(null);
  const [pendingCsv, setPendingCsv] = useState(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const formRef = useRef(null);
  const importRef = useRef(null);
  const csvRef = useRef(null);

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
    const balance = currentBalanceCents(transactions, settings, todayISO());
    return { income, spending, net: income - spending, balance };
  }, [transactions, monthTransactions, settings]);

  const variableEstimate = useMemo(
    () => estimateDailyVariableSpend(transactions, recurring.items, todayISO()),
    [transactions, recurring.items],
  );

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
    const { repeat, ...fields } = tx;
    const ok = await store.add(fields);
    if (ok) {
      setMonth(monthKeyOf(tx.date));
      if (repeat && repeat !== 'once') await markRecurring(fields, repeat);
    }
    return ok;
  }

  // Creates or refreshes recurring items. When the description is already
  // tracked, the existing item takes on the new amount/frequency/schedule —
  // never silently dropped.
  async function upsertRecurring(candidates) {
    const byDesc = new Map(
      recurring.items.map((r) => [r.description.trim().toLowerCase(), r]),
    );
    const toAdd = [];
    let updated = 0;
    for (const c of candidates) {
      const existing = byDesc.get(c.description.trim().toLowerCase());
      if (existing) {
        const ok = await recurring.update(existing.id, {
          amountCents: c.amountCents,
          frequency: c.frequency,
          anchorDate: c.anchorDate,
        });
        if (ok) updated++;
      } else {
        toAdd.push(c);
      }
    }
    const added = toAdd.length > 0 && (await recurring.addMany(toAdd)) ? toAdd.length : 0;
    return { added, updated };
  }

  // Single transaction marked as repeating (from the add or edit form).
  async function markRecurring(tx, frequency) {
    const { added, updated } = await upsertRecurring([
      {
        type: tx.type,
        description: tx.description,
        amountCents: tx.amountCents,
        category: tx.category,
        frequency,
        anchorDate: tx.date,
      },
    ]);
    const freqLabel = FREQUENCY_LABELS[frequency].toLowerCase();
    if (added > 0) {
      setImportNotice(
        `“${tx.description}” is now recurring (${freqLabel}) — see “Recurring bills & deposits” below.`,
      );
    } else if (updated > 0) {
      setImportNotice(
        `“${tx.description}” was already recurring — updated it to ${freqLabel}, ${formatCents(tx.amountCents)}, scheduled from ${tx.date}.`,
      );
    }
  }

  async function saveEdit(payload) {
    const { repeat, ...tx } = payload;
    const ok = await store.update(editingId, tx);
    if (ok) {
      // Editing is also how an existing entry (e.g. from an earlier CSV
      // import) gets promoted to a recurring bill/deposit.
      if (repeat && repeat !== 'once') await markRecurring(tx, repeat);
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
      await recurring.replaceAll(generateSampleRecurring());
      await saveStartingBalance(SAMPLE_STARTING_BALANCE_CENTS);
      setMonth(currentMonthKey());
      setEditingId(null);
    }
  }

  async function clearAll() {
    if (
      !window.confirm(
        'Delete ALL transactions, recurring items, and your starting balance? Export a backup first if you want to keep them.',
      )
    ) {
      return;
    }
    const ok = await store.replaceAll([]);
    if (ok) {
      await recurring.replaceAll([]);
      await clearSettings();
      setEditingId(null);
    }
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

  function importCsvFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = mapBankCsv(reader.result);
        const existing = new Set(transactions.map(txKey));
        const toAdd = [];
        let duplicates = 0;
        for (const t of result.transactions) {
          if (existing.has(txKey(t))) duplicates++;
          else toAdd.push(t);
        }
        if (toAdd.length === 0) {
          window.alert(
            duplicates > 0
              ? `Nothing new to import — all ${duplicates} transactions are already in this data.`
              : 'No importable transactions found in that file.',
          );
          return;
        }
        setImportNotice('');
        setPendingCsv({ ...result, toAdd, duplicates });
      } catch (err) {
        window.alert(`Couldn't read that file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  async function confirmCsvImport(recurrenceChoices) {
    if (!pendingCsv) return;
    setCsvBusy(true);
    const ok = await store.addMany(pendingCsv.toAdd);
    if (!ok) {
      setCsvBusy(false);
      return;
    }

    // Rows marked as repeating become recurring items. When the same bill
    // is marked in several months, keep the most recent one as the schedule.
    const byDescription = new Map();
    pendingCsv.toAdd.forEach((t, i) => {
      const freq = recurrenceChoices[i];
      if (!freq || freq === 'once') return;
      const key = t.description.trim().toLowerCase();
      const prev = byDescription.get(key);
      if (!prev || t.date > prev.anchorDate) {
        byDescription.set(key, {
          type: t.type,
          description: t.description,
          amountCents: t.amountCents,
          category: t.category,
          frequency: freq,
          anchorDate: t.date,
        });
      }
    });
    const { added, updated } = await upsertRecurring([...byDescription.values()]);
    setCsvBusy(false);

    const latest = pendingCsv.toAdd.reduce((max, t) => (t.date > max ? t.date : max), '');
    if (latest) setMonth(monthKeyOf(latest));
    const recurringBits = [];
    if (added > 0) recurringBits.push(`set up ${added} recurring item${added === 1 ? '' : 's'}`);
    if (updated > 0) recurringBits.push(`updated ${updated} existing one${updated === 1 ? '' : 's'}`);
    setImportNotice(
      `Imported ${pendingCsv.toAdd.length} transaction${pendingCsv.toAdd.length === 1 ? '' : 's'} from your bank file` +
        (recurringBits.length > 0 ? ` and ${recurringBits.join(' and ')}.` : '.'),
    );
    setPendingCsv(null);
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
              <button type="button" className="btn ghost" onClick={() => csvRef.current?.click()}>
                Import bank CSV
              </button>
              <input
                ref={csvRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={importCsvFile}
              />
              <button type="button" className="btn ghost" onClick={() => importRef.current?.click()}>
                Restore
              </button>
              <button
                type="button"
                className="btn ghost danger"
                onClick={clearAll}
                disabled={!transactions.length && !recurring.items.length && !settings}
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

      {recurring.error ? (
        <div className="alert error">
          <span>{recurring.error}</span>
          <button type="button" className="btn link" onClick={recurring.dismissError}>
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

      {importNotice ? (
        <div className="alert info">
          <span>{importNotice}</span>
          <button type="button" className="btn link" onClick={() => setImportNotice('')}>
            dismiss
          </button>
        </div>
      ) : null}

      {pendingCsv ? (
        <CsvImportBanner
          pending={pendingCsv}
          busy={csvBusy}
          onConfirm={confirmCsvImport}
          onCancel={() => setPendingCsv(null)}
        />
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

      <SummaryCards totals={totals} balanceAnchored={Boolean(settings)} />

      <ProjectionCard
        available={!store.cloudMode || (recurring.available && settingsAvailable)}
        balanceCents={totals.balance}
        hasStartingBalance={Boolean(settings)}
        onSaveStartingBalance={saveStartingBalance}
        canWrite={!readOnly}
        recurringItems={recurring.items}
        transactions={transactions}
        variableEstimate={variableEstimate}
        includeVariable={includeVariable}
        onToggleVariable={setIncludeVariable}
      />

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
        totalCount={transactions.length}
        month={month}
        editingId={editingId}
        onEdit={startEdit}
        onDelete={deleteTransaction}
        onLoadSample={ownData && transactions.length === 0 ? loadSampleData : null}
        canEdit={!readOnly}
      />

      <RecurringList
        items={recurring.items}
        available={!store.cloudMode || recurring.available}
        canWrite={!readOnly}
        onUpdate={recurring.update}
        onRemove={recurring.remove}
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

// Fingerprint used to skip rows that already exist when re-importing an
// overlapping bank export.
function txKey(t) {
  return [t.date, t.type, t.amountCents, t.description.toLowerCase()].join('|');
}

function downloadFile(name, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
