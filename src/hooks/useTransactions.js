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

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

// Single source of truth for transactions. When Supabase is configured and a
// user is signed in, reads/writes go to the cloud; otherwise localStorage.
//
// `context` says whose dataset is open: { ownerId, ownerEmail, role } where
// role is 'owner', 'editor', or 'viewer'. Every cloud query is scoped to
// that owner's rows — row-level security enforces the same boundary
// server-side, this just keeps the app honest and fast.
export function useTransactions(session, context) {
  const [local, setLocal] = useLocalStorage(STORAGE_KEY, []);
  const [cloud, setCloud] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cloudMode = Boolean(supabase && session);
  const ownerId = context?.ownerId ?? session?.user?.id;
  const canWrite = !cloudMode || !context || context.role !== 'viewer';

  useEffect(() => {
    if (!cloudMode || !ownerId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', ownerId)
      .order('date', { ascending: false })
      .order('inserted_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(`Couldn't load this data: ${err.message}`);
        else setCloud((data ?? []).map(fromRow));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cloudMode, ownerId]);

  const add = useCallback(
    async (tx) => {
      if (!cloudMode) {
        setLocal((prev) => [{ ...tx, id: crypto.randomUUID() }, ...prev]);
        return true;
      }
      const { data, error: err } = await supabase
        .from('transactions')
        .insert({ ...toRow(tx), user_id: ownerId })
        .select()
        .single();
      if (err) {
        setError(`Couldn't save: ${err.message}`);
        return false;
      }
      setCloud((prev) => [fromRow(data), ...prev]);
      return true;
    },
    [cloudMode, ownerId, setLocal],
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

  const removeMany = useCallback(
    async (ids) => {
      if (ids.length === 0) return true;
      if (!cloudMode) {
        const gone = new Set(ids);
        setLocal((prev) => prev.filter((t) => !gone.has(t.id)));
        return true;
      }
      // Chunked: ids travel in the URL, so keep each request modest.
      for (let i = 0; i < ids.length; i += 100) {
        const { error: err } = await supabase
          .from('transactions')
          .delete()
          .in('id', ids.slice(i, i + 100));
        if (err) {
          setError(`Couldn't delete: ${err.message}`);
          const gone = new Set(ids.slice(0, i));
          setCloud((prev) => prev.filter((t) => !gone.has(t.id)));
          return false;
        }
      }
      const gone = new Set(ids);
      setCloud((prev) => prev.filter((t) => !gone.has(t.id)));
      return true;
    },
    [cloudMode, setLocal],
  );

  // Applies the same field changes (e.g. a new category) to several rows.
  const updateMany = useCallback(
    async (ids, fields) => {
      if (ids.length === 0) return true;
      if (!cloudMode) {
        const hit = new Set(ids);
        setLocal((prev) => prev.map((t) => (hit.has(t.id) ? { ...t, ...fields } : t)));
        return true;
      }
      const patch = {};
      if (fields.category !== undefined) patch.category = fields.category;
      for (let i = 0; i < ids.length; i += 100) {
        const { error: err } = await supabase
          .from('transactions')
          .update(patch)
          .in('id', ids.slice(i, i + 100));
        if (err) {
          setError(`Couldn't save: ${err.message}`);
          return false;
        }
      }
      const hit = new Set(ids);
      setCloud((prev) => prev.map((t) => (hit.has(t.id) ? { ...t, ...fields } : t)));
      return true;
    },
    [cloudMode, setLocal],
  );

  // Bulk append — used by the bank CSV importer. Unlike replaceAll, this
  // never deletes anything.
  const addMany = useCallback(
    async (list) => {
      if (list.length === 0) return true;
      if (!cloudMode) {
        setLocal((prev) => [
          ...list.map((t) => ({ ...t, id: crypto.randomUUID() })),
          ...prev,
        ]);
        return true;
      }
      setLoading(true);
      const inserted = [];
      for (let i = 0; i < list.length; i += INSERT_CHUNK) {
        const chunk = list.slice(i, i + INSERT_CHUNK).map((t) => ({ ...toRow(t), user_id: ownerId }));
        const { data, error: insErr } = await supabase.from('transactions').insert(chunk).select();
        if (insErr) {
          setLoading(false);
          setError(`Import stopped partway: ${insErr.message}`);
          if (inserted.length) {
            setCloud((prev) => [...inserted.map(fromRow), ...prev].sort(byDateDesc));
          }
          return false;
        }
        inserted.push(...data);
      }
      setCloud((prev) => [...inserted.map(fromRow), ...prev].sort(byDateDesc));
      setLoading(false);
      return true;
    },
    [cloudMode, ownerId, setLocal],
  );

  // Wholesale replacement — used by Restore, sample data, and Clear ([]).
  // Only ever offered on the user's own dataset.
  const replaceAll = useCallback(
    async (list) => {
      if (!cloudMode) {
        setLocal(list.map((t) => ({ ...t, id: t.id ?? crypto.randomUUID() })));
        return true;
      }
      setLoading(true);
      const { error: delErr } = await supabase
        .from('transactions')
        .delete()
        .eq('user_id', ownerId);
      if (delErr) {
        setLoading(false);
        setError(`Couldn't replace data: ${delErr.message}`);
        return false;
      }
      const inserted = [];
      for (let i = 0; i < list.length; i += INSERT_CHUNK) {
        const chunk = list.slice(i, i + INSERT_CHUNK).map((t) => ({ ...toRow(t), user_id: ownerId }));
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
      setCloud(inserted.map(fromRow).sort(byDateDesc));
      setLoading(false);
      return true;
    },
    [cloudMode, ownerId, setLocal],
  );

  // Copies this browser's local entries into the signed-in user's own
  // dataset, then clears the local copy so they aren't imported twice.
  const importLocal = useCallback(async () => {
    if (!cloudMode || local.length === 0) return false;
    const ownId = session.user.id;
    setLoading(true);
    const inserted = [];
    for (let i = 0; i < local.length; i += INSERT_CHUNK) {
      const chunk = local.slice(i, i + INSERT_CHUNK).map((t) => ({ ...toRow(t), user_id: ownId }));
      const { data, error: insErr } = await supabase.from('transactions').insert(chunk).select();
      if (insErr) {
        setLoading(false);
        setError(`Import stopped partway: ${insErr.message}`);
        return false;
      }
      inserted.push(...data);
    }
    setCloud((prev) => [...inserted.map(fromRow), ...prev].sort(byDateDesc));
    setLocal([]);
    setLoading(false);
    return true;
  }, [cloudMode, local, session, setLocal]);

  const dismissError = useCallback(() => setError(''), []);

  return {
    transactions: cloudMode ? cloud : local,
    cloudMode,
    canWrite,
    localCount: local.length,
    loading,
    error,
    dismissError,
    add,
    addMany,
    update,
    remove,
    removeMany,
    updateMany,
    replaceAll,
    importLocal,
  };
}
