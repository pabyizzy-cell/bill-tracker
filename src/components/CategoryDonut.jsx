import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCents } from '../lib/money.js';

export default function CategoryDonut({ data, totalCents }) {
  return (
    <section className="card chart-card">
      <h2>Where your money went</h2>
      {data.length === 0 ? (
        <p className="empty-note">
          No spending recorded this month yet. Add an expense and the breakdown will show up here.
        </p>
      ) : (
        <div className="donut-layout">
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="95%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <span className="donut-total">{formatCents(totalCents)}</span>
              <span className="donut-sub">total spent</span>
            </div>
          </div>
          <ul className="category-list">
            {data.map((c) => (
              <li key={c.id}>
                <span className="cat-dot" style={{ background: c.color }} />
                <span className="cat-name">
                  {c.emoji} {c.name}
                </span>
                <span className="cat-pct">{Math.round(c.pct * 100)}%</span>
                <span className="cat-amount">{formatCents(c.value)}</span>
                <span className="cat-bar">
                  <span style={{ width: `${Math.max(c.pct * 100, 2)}%`, background: c.color }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>
        {item.emoji} {item.name}
      </strong>
      <div>
        {formatCents(item.value)} · {Math.round(item.pct * 100)}% of spending
      </div>
    </div>
  );
}
