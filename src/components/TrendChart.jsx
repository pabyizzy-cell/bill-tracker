import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { monthLabel, monthShortLabel } from '../lib/dates.js';
import { formatCents, formatCentsCompact } from '../lib/money.js';

export default function TrendChart({ data }) {
  const chartData = data.map((d) => ({
    ...d,
    label: monthShortLabel(d.key),
    full: monthLabel(d.key),
  }));
  return (
    <section className="card chart-card">
      <h2>Income vs. spending</h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#22304a" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#8b97ab', fontSize: 12 }}
            axisLine={{ stroke: '#22304a' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatCentsCompact}
            tick={{ fill: '#8b97ab', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(140, 160, 200, 0.08)' }} />
          <Legend
            iconType="circle"
            iconSize={9}
            formatter={(value) => (
              <span className="legend-label">{value === 'income' ? 'Income' : 'Spending'}</span>
            )}
          />
          <Bar dataKey="income" fill="#34d399" radius={[5, 5, 0, 0]} maxBarSize={26} />
          <Bar dataKey="spending" fill="#fb7185" radius={[5, 5, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{payload[0].payload.full}</strong>
      {payload.map((p) => (
        <div key={p.dataKey}>
          {p.dataKey === 'income' ? 'Income' : 'Spending'}: {formatCents(p.value)}
        </div>
      ))}
    </div>
  );
}
