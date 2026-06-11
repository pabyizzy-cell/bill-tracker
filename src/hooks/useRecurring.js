import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLocalStorage } from './useLocalStorage.js';

const STORAGE_KEY = 'bill-tracker:recurring:v1';

const toRow = (r) => ({
  type: r.type,
  description: r.description,
  amount_cents: r.amountCents,
  category: r.category,
  frequency: r.frequency,
  anchor_date: r.anchorDate,
});

const fromRow = (r) => ({
  id: r.id,
  type: r.type,
  description: r.description,
  amountCents: r.amount_cents,
  category: r.category,
  frequency: r.frequency,
  anchorDate: r.anchor_date,
});

// Recurring bills/deposits, same dual-mode pattern as useTransactions:
// localStorage when signed out, the recurring_items table (scoped to the
// active dataset's owner) when signed in. `available` turns false when the
// table doesn't exist yet (0003 migration not run).
export function useRecurring(session, context) {
  const [local, setLocal] = useLocalStorage(STORAGE_KEY, []);
  const [cloud, setCloud] = useState([]);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState('');

  const cloudMode = Boolean(supabase && session);
  const ownerId = context?.ownerId ?? session?.user?.id;

  useEffect(() => {
    if (!cloudMode || !ownerId) return undefined;
    let cancelled = false;
    supabase
      .from('recurring_items')
      .select('*')
      .eq('user_id', ownerId)
      .order('inserted_at', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setAvailable(false);
          setCloud([]);
        } else {
          setAvailable(true);
          setCloud((data ?? []).map(fromRow));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cloudMode, ownerId]);

  const addMany = useCallback(
    async (list) => {
      if (list.length === 0) return true;
      if (!cloudMode) {
        setLocal((prev) => [...prev, ...list.map((r) => ({ ...r, id: crypto.randomUUID() }))]);
        return true;
      }
      const rows = list.map((r) => ({ ...toRow(r), user_id: ownerId }));
      const { data, error: err } = await supabase.from('recurring_items').insert(rows).select();
      if (err) {
        setError(`Couldn't save recurring items: ${err.message}`);
        return false;
      }
      setCloud((prev) => [...prev, ...data.map(fromRow)]);
      return true;
    },
    [cloudMode, ownerId, setLocal],
  );

  const update = useCallback(
    async (id, fields) => {
      if (!cloudMode) {
        setLocal((prev) => prev.map((r) => (r.id === id ? { ...r, ...fields } : r)));
        return true;
      }
      const patch = {};
      if (fields.amountCents !== undefined) patch.amount_cents = fields.amountCents;
      if (fields.frequency !== undefined) patch.frequency = fields.frequency;
      if (fields.anchorDate !== undefined) patch.anchor_date = fields.anchorDate;
      if (fields.category !== undefined) patch.category = fields.category;
      const { data, error: err } = await supabase
        .from('recurring_items')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (err) {
        setError(`Couldn't save: ${err.message}`);
        return false;
      }
      setCloud((prev) => prev.map((r) => (r.id === id ? fromRow(data) : r)));
      return true;
    },
    [cloudMode, setLocal],
  );

  const remove = useCallback(
    async (id) => {
      if (!cloudMode) {
        setLocal((prev) => prev.filter((r) => r.id !== id));
        return true;
      }
      const { error: err } = await supabase.from('recurring_items').delete().eq('id', id);
      if (err) {
        setError(`Couldn't delete: ${err.message}`);
        return false;
      }
      setCloud((prev) => prev.filter((r) => r.id !== id));
      return true;
    },
    [cloudMode, setLocal],
  );

  const removeMany = useCallback(
    async (ids) => {
      if (ids.length === 0) return true;
      if (!cloudMode) {
        const gone = new Set(ids);
        setLocal((prev) => prev.filter((r) => !gone.has(r.id)));
        return true;
      }
      for (let i = 0; i < ids.length; i += 100) {
        const { error: err } = await supabase
          .from('recurring_items')
          .delete()
          .in('id', ids.slice(i, i + 100));
        if (err) {
          setError(`Couldn't delete: ${err.message}`);
          const gone = new Set(ids.slice(0, i));
          setCloud((prev) => prev.filter((r) => !gone.has(r.id)));
          return false;
        }
      }
      const gone = new Set(ids);
      setCloud((prev) => prev.filter((r) => !gone.has(r.id)));
      return true;
    },
    [cloudMode, setLocal],
  );

  // Used by sample data / Clear. Owner-only paths in the app.
  const replaceAll = useCallback(
    async (list) => {
      if (!cloudMode) {
        setLocal(list.map((r) => ({ ...r, id: r.id ?? crypto.randomUUID() })));
        return true;
      }
      const { error: delErr } = await supabase
        .from('recurring_items')
        .delete()
        .eq('user_id', ownerId);
      if (delErr) {
        setError(`Couldn't replace recurring items: ${delErr.message}`);
        return false;
      }
      setCloud([]);
      if (list.length === 0) return true;
      return addMany(list);
    },
    [cloudMode, ownerId, setLocal, addMany],
  );

  const dismissError = useCallback(() => setError(''), []);

  return {
    items: cloudMode ? cloud : local,
    available: cloudMode ? available : true,
    error,
    dismissError,
    addMany,
    update,
    remove,
    removeMany,
    replaceAll,
  };
}
