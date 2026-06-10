import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useLocalStorage } from './useLocalStorage.js';

const STORAGE_KEY = 'bill-tracker:transactions:v1';
const INSERT_CHUNK = 500;

// App shape (camelCase) <-> database row shape (snake_case)
const toRow = (t) => ({
  type: t.type,
  description: t.description,
  amount_cents: t.amountCents,
  category: t.category,
  date: t.date,
});

const fromRow = (r) => ({
  id: r.id,
  type: r.type,
  description: r.description,
  amountCents: r.amount_cents,
  category: r.category,
  date: r.date,
});

// Single source of truth for transactions. When Supabase is configured and a
// user is signed in, reads/writes go to the cloud; otherwise localStorage.
// All mutators return true on success so callers can keep their flow simple.
export function useTransactions(session) {
  const [local, setLocal] = useLocalStorage(STORAGE_KEY, []);
  const [cloud, setCloud] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cloudMode = Boolean(supabase && session);
  const userId = session?.user?.id;

  useEffect(() => {
    if (!cloudMode) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .order('inserted_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(`Couldn't load your data: ${err.message}`);
        else setCloud((data ?? []).map(fromRow));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cloudMode, userId]);

  const add = useCallback(
    async (tx) => {
      if (!cloudMode) {
        setLocal((prev) => [{ ...tx, id: crypto.randomUUID() }, ...prev]);
        return true;
      }
      const { data, error: err } = await supabase
        .from('transactions')
        .insert(toRow(tx))
        .select()
        .single();
      if (err) {
        setError(`Couldn't save: ${err.message}`);
        return false;
      }
      setCloud((prev) => [fromRow(data), ...prev]);
      return true;
    },
    [cloudMode, setLocal],
  );

  const update = useCallback(
    async (id, tx) => {
      if (!cloudMode) {
        setLocal((prev) => prev.map((t) => (t.id === id ? { ...t, ...tx } : t)));
        return true;
      }
      const { data, error: err } = await supabase
        .from('transactions')
        .update(toRow(tx))
        .eq('id', id)
        .select()
        .single();
      if (err) {
        setError(`Couldn't save: ${err.message}`);
        return false;
      }
      setCloud((prev) => prev.map((t) => (t.id === id ? fromRow(data) : t)));
      return true;
    },
    [cloudMode, setLocal],
  );

  const remove = useCallback(
    async (id) => {
      if (!cloudMode) {
        setLocal((prev) => prev.filter((t) => t.id !== id));
        return true;
      }
      const { error: err } = await supabase.from('transactions').delete().eq('id', id);
      if (err) {
        setError(`Couldn't delete: ${err.message}`);
        return false;
      }
      setCloud((prev) => prev.filter((t) => t.id !== id));
      return true;
    },
    [cloudMode, setLocal],
  );

  // Wholesale replacement — used by Restore, sample data, and Clear ([]).
  const replaceAll = useCallback(
    async (list) => {
      if (!cloudMode) {
        setLocal(list.map((t) => ({ ...t, id: t.id ?? crypto.randomUUID() })));
        return true;
      }
      setLoading(true);
      // RLS limits this to the signed-in user's rows; the filter is just
      // PostgREST's required "no unscoped deletes" guard.
      const { error: delErr } = await supabase
        .from('transactions')
        .delete()
        .not('id', 'is', null);
      if (delErr) {
        setLoading(false);
        setError(`Couldn't replace data: ${delErr.message}`);
        return false;
      }
      const inserted = [];
      for (let i = 0; i < list.length; i += INSERT_CHUNK) {
        const chunk = list.slice(i, i + INSERT_CHUNK).map(toRow);
        const { data, error: insErr } = await supabase
          .from('transactions')
          .insert(chunk)
          .select();
        if (insErr) {
          setLoading(false);
          setError(`Import stopped partway: ${insErr.message}`);
          setCloud(inserted.map(fromRow));
          return false;
        }
        inserted.push(...data);
      }
      setCloud(
        inserted
          .map(fromRow)
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
      );
      setLoading(false);
      return true;
    },
    [cloudMode, setLocal],
  );

  // Copies this browser's local entries into the signed-in account, then
  // clears the local copy so they aren't imported twice.
  const importLocal = useCallback(async () => {
    if (!cloudMode || local.length === 0) return false;
    setLoading(true);
    const inserted = [];
    for (let i = 0; i < local.length; i += INSERT_CHUNK) {
      const chunk = local.slice(i, i + INSERT_CHUNK).map(toRow);
      const { data, error: insErr } = await supabase.from('transactions').insert(chunk).select();
      if (insErr) {
        setLoading(false);
        setError(`Import stopped partway: ${insErr.message}`);
        return false;
      }
      inserted.push(...data);
    }
    setCloud((prev) =>
      [...inserted.map(fromRow), ...prev].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      ),
    );
    setLocal([]);
    setLoading(false);
    return true;
  }, [cloudMode, local, setLocal]);

  const dismissError = useCallback(() => setError(''), []);

  return {
    transactions: cloudMode ? cloud : local,
    cloudMode,
    localCount: local.length,
    loading,
    error,
    dismissError,
    add,
    update,
    remove,
    replaceAll,
    importLocal,
  };
}
