export const EXPENSE_CATEGORIES = [
  { id: 'housing', label: 'Housing', emoji: '🏠', color: '#6c8cff' },
  { id: 'utilities', label: 'Utilities', emoji: '💡', color: '#f59e0b' },
  { id: 'groceries', label: 'Groceries', emoji: '🛒', color: '#10b981' },
  { id: 'dining', label: 'Dining Out', emoji: '🍜', color: '#fb7185' },
  { id: 'transport', label: 'Transport', emoji: '🚗', color: '#38bdf8' },
  { id: 'subscriptions', label: 'Subscriptions', emoji: '📺', color: '#a78bfa' },
  { id: 'health', label: 'Health', emoji: '🩺', color: '#2dd4bf' },
  { id: 'entertainment', label: 'Entertainment', emoji: '🎬', color: '#f472b6' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️', color: '#fbbf24' },
  { id: 'personal', label: 'Personal Care', emoji: '🧖', color: '#fb923c' },
  { id: 'savings', label: 'Savings & Investing', emoji: '🌱', color: '#84cc16' },
  { id: 'other', label: 'Other', emoji: '📦', color: '#94a3b8' },
];

export const INCOME_CATEGORIES = [
  { id: 'salary', label: 'Salary', emoji: '💼', color: '#34d399' },
  { id: 'freelance', label: 'Freelance & Side Gigs', emoji: '🧾', color: '#a3e635' },
  { id: 'gifts', label: 'Gifts', emoji: '🎁', color: '#f472b6' },
  { id: 'other-income', label: 'Other Income', emoji: '💵', color: '#86efac' },
];

const byId = new Map(
  [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => [c.id, c]),
);

export function getCategory(id) {
  return byId.get(id) ?? { id, label: 'Other', emoji: '🏷️', color: '#94a3b8' };
}

export function categoriesFor(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}
