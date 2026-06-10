import { formatCents } from '../lib/money.js';

export default function SummaryCards({ totals, balanceAnchored = false }) {
  const net = totals.net;
  return (
    <div className="summary-grid">
      <Card label="Income this month" value={formatCents(totals.income)} tone="green" />
      <Card label="Spending this month" value={formatCents(totals.spending)} tone="rose" />
      <Card
        label="Net this month"
        value={`${net < 0 ? '−' : '+'}${formatCents(Math.abs(net))}`}
        tone={net < 0 ? 'rose' : 'green'}
        hint={net < 0 ? 'You spent more than you brought in' : 'You came out ahead'}
      />
      <Card
        label="Balance today"
        value={formatCents(totals.balance)}
        tone="accent"
        hint={
          balanceAnchored
            ? 'From the starting balance you set, plus activity since'
            : 'Income minus spending recorded so far'
        }
      />
    </div>
  );
}

function Card({ label, value, tone, hint }) {
  return (
    <div className={`card summary-card tone-${tone}`}>
      <span className="summary-label">{label}</span>
      <span className="summary-value">{value}</span>
      {hint ? <span className="summary-hint">{hint}</span> : null}
    </div>
  );
}
