import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { addDaysISO, formatDate, monthShortLabel, todayISO } from '../lib/dates.js';
import { formatCents, formatCentsCompact, parseAmountToCents } from '../lib/money.js';
import { buildProjection } from '../lib/projection.js';

// Always-visible 3-month balance projection, plus a date lookup for
// arbitrary horizons. Pure display — all inputs come from App.
export default function ProjectionCard({
  available,
  balanceCents,
  hasStartingBalance,
  onSaveStartingBalance,
  canWrite,
  recurringItems,
  transactions,
  variableEstimate,
  includeVariable,
  onToggleVariable,
}) {
  const dailyVariableCents = variableEstimate.dailyCents;
  const today = todayISO();
  const horizon = addDaysISO(today, 92);
  const [lookupDate, setLookupDate] = useState(addDaysISO(today, 30));
  const [balanceDraft, setBalanceDraft] = useState('');
  const [balanceError, setBalanceError] = useState('');

  const projection = useMemo(
    () =>
      buildProjection({
        startBalanceCents: balanceCents,
        fromISO: today,
        toISO: horizon,
        recurringItems,
        transactions,
        dailyVariableCents,
        includeVariable,
      }),
    [balanceCents, today, horizon, recurringItems, transactions, dailyVariableCents, includeVariable],
  );

  const lookup = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lookupDate) || lookupDate <= today) return null;
    return buildProjection({
      startBalanceCents: balanceCents,
      fromISO: today,
      toISO: lookupDate,
      recurringItems,
      transactions,
      dailyVariableCents,
      includeVariable,
    });
  }, [balanceCents, today, lookupDate, recurringItems, transactions, dailyVariableCents, includeVariable]);

  if (!available) {
    return (
      <section className="card">
        <h2>Balance projection</h2>
        <p className="empty-note">
          Projections need a database update: run{' '}
          <code>supabase/migrations/0003_projections.sql</code> in the Supabase SQL Editor, then
          reload this page.
        </p>
      </section>
    );
  }

  const chartData = projection.points.map((p) => ({
    ...p,
    balance: p.balanceCents / 100,
  }));
  const monthTicks = projection.points
    .filter((p) => p.date.endsWith('-01'))
    .map((p) => p.date);

  async function saveBalance(e) {
    e.preventDefault();
    let raw = balanceDraft.trim();
    let negative = false;
    if (raw.startsWith('-')) {
      negative = true;
      raw = raw.slice(1);
    }
    const cents = parseAmountToCents(raw);
    if (cents === null) {
      setBalanceError('Enter your balance, like 3400 or 3400.50');
      return;
    }
    setBalanceError('');
    const ok = await onSaveStartingBalance(negative ? -cents : cents);
    if (ok) setBalanceDraft('');
  }

  return (
    <section className="card projection-card">
      <div className="projection-header">
        <h2>Projected balance · next 3 months</h2>
        <label className="variable-toggle">
          <input type="checkbox" checked={includeVariable} onChange={(e) => onToggleVariable(e.target.checked)} />
          include everyday spending{dailyVariableCents > 0 ? ` (~${formatCents(dailyVariableCents)}/day)` : ''}
        </label>
      </div>

      <div className="projection-stats">
        <span>
          Today: <strong>{formatCents(balanceCents)}</strong>
        </span>
        <span>
          In 3 months:{' '}
          <strong className={projection.endBalanceCents < 0 ? 'neg' : 'pos'}>
            {formatCents(projection.endBalanceCents)}
          </strong>
        </span>
        <span>
          Lowest dip:{' '}
          <strong className={projection.minPoint.balanceCents < 0 ? 'neg' : ''}>
            {formatCents(projection.minPoint.balanceCents)}
          </strong>{' '}
          on {formatDate(projection.minPoint.date)}
        </span>
      </div>

      {!hasStartingBalance && canWrite ? (
        <form className="balance-setup" onSubmit={saveBalance}>
          <span>
            For real numbers, set your actual bank balance — right now this projects from recorded
            income minus spending only.
          </span>
          <div className="balance-setup-row">
            <input
              value={balanceDraft}
              onChange={(e) => setBalanceDraft(e.target.value)}
              inputMode="decimal"
              placeholder="Balance today, e.g. 3400.00"
            />
            <button type="submit" className="btn primary">
              Set balance
            </button>
          </div>
          {balanceError ? <p className="form-error">{balanceError}</p> : null}
        </form>
      ) : null}

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6c8cff" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#6c8cff" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#22304a" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={monthTicks}
            tickFormatter={(d) => monthShortLabel(d.slice(0, 7))}
            tick={{ fill: '#8b97ab', fontSize: 12 }}
            axisLine={{ stroke: '#22304a' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => formatCentsCompact(Math.round(v * 100))}
            tick={{ fill: '#8b97ab', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={60}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<ProjectionTooltip includeVariable={includeVariable} dailyVariableCents={dailyVariableCents} />} />
          {projection.minPoint.balanceCents < 0 ? (
            <ReferenceLine y={0} stroke="#fb7185" strokeDasharray="4 4" />
          ) : null}
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#6c8cff"
            strokeWidth={2}
            fill="url(#balanceFill)"
            isAnimationActive={false}
          />
          <ReferenceDot
            x={projection.minPoint.date}
            y={projection.minPoint.balanceCents / 100}
            r={4}
            fill="#fb7185"
            stroke="#0b1120"
          />
        </AreaChart>
      </ResponsiveContainer>

      {dailyVariableCents > 0 ? (
        <p className="projection-hint">
          Everyday spending is your own average: {formatCents(variableEstimate.totalCents)} of
          spending not marked recurring ({variableEstimate.count} transaction
          {variableEstimate.count === 1 ? '' : 's'}) over the last {variableEstimate.days} days ≈{' '}
          {formatCents(dailyVariableCents)}/day. Mark regular bills as recurring to keep this number
          honest, or use the checkbox above to leave it out.
        </p>
      ) : null}

      {recurringItems.length === 0 ? (
        <p className="projection-hint">
          No recurring bills or deposits yet — mark transactions as repeating (in the add form, when
          editing one, or when importing a bank CSV) and the projection will map out your paydays
          and bills.
        </p>
      ) : null}

      <div className="lookup-row">
        <label>
          Balance on
          <input
            type="date"
            value={lookupDate}
            min={addDaysISO(today, 1)}
            max={addDaysISO(today, 730)}
            onChange={(e) => setLookupDate(e.target.value)}
          />
        </label>
        {lookup ? (
          <div className="lookup-result">
            <strong className={lookup.endBalanceCents < 0 ? 'neg' : 'pos'}>
              {formatCents(lookup.endBalanceCents)}
            </strong>
            <span className="lookup-breakdown">
              {formatCents(balanceCents)} today + {formatCents(lookup.totals.recurringIncome)}{' '}
              income − {formatCents(lookup.totals.recurringBills)} bills
              {lookup.totals.enteredNet !== 0
                ? ` ${lookup.totals.enteredNet > 0 ? '+' : '−'} ${formatCents(Math.abs(lookup.totals.enteredNet))} already entered`
                : ''}
              {includeVariable && lookup.totals.variable > 0
                ? ` − ${formatCents(lookup.totals.variable)} everyday spending`
                : ''}
            </span>
          </div>
        ) : (
          <span className="lookup-breakdown">Pick a future date.</span>
        )}
      </div>
    </section>
  );
}

function ProjectionTooltip({ active, payload, includeVariable, dailyVariableCents }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{formatDate(p.date)}</strong>
      <div>{formatCents(p.balanceCents)}</div>
      {p.events.map((e, i) => (
        <div key={i} className="tooltip-event">
          {e.cents > 0 ? '+' : '−'}
          {formatCents(Math.abs(e.cents))} {e.label}
        </div>
      ))}
      {includeVariable && dailyVariableCents > 0 ? (
        <div className="tooltip-event muted">
          −{formatCents(dailyVariableCents)} everyday (est.)
        </div>
      ) : null}
    </div>
  );
}
