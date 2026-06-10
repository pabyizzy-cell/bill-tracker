import { currentMonthKey, monthLabel, shiftMonth } from '../lib/dates.js';

export default function MonthPicker({ month, onChange }) {
  const isCurrent = month === currentMonthKey();
  return (
    <div className="month-picker">
      <button
        type="button"
        className="btn icon"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
      >
        ‹
      </button>
      <div className="month-label">
        <span>{monthLabel(month)}</span>
        {!isCurrent && (
          <button type="button" className="btn link" onClick={() => onChange(currentMonthKey())}>
            back to this month
          </button>
        )}
      </div>
      <button
        type="button"
        className="btn icon"
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
