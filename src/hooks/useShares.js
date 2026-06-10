import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Manages the sharing allowlist. One query returns every share row the user
// may see: rows they own (their allowlist) and rows addressed to their email
// (grants from other people). RLS enforces that split server-side.
export function useShares(session) {
  const [rows, setRows] = useState([]);
  // False when the shares table doesn't exist yet (migration not run).
  const [available, setAvailable] = useState(true);

  const userId = session?.user?.id;
  const userEmail = session?.user?.email?.toLowerCase() ?? '';

  useEffect(() => {
    if (!supabase || !userId) {
      setRows([]);
      return undefined;
    }
    let cancelled = false;
    supabase
      .from('shares')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setAvailable(false);
          setRows([]);
        } else {
          setAvailable(true);
          setRows(data ?? []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const myShares = useMemo(() => rows.filter((r) => r.owner_id === userId), [rows, userId]);

  const sharedWithMe = useMemo(
    () => rows.filter((r) => r.owner_id !== userId && r.grantee_email === userEmail),
    [rows, userId, userEmail],
  );

  const addShare = useCallback(
    async (emailRaw, role) => {
      const email = emailRaw.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: 'Enter a valid email address.' };
      if (email === userEmail) return { ok: false, message: "That's your own email." };
      if (myShares.some((s) => s.grantee_email === email)) {
        return { ok: false, message: 'That email is already on the list.' };
      }
      const { data, error } = await supabase
        .from('shares')
        .insert({
          owner_id: userId,
          owner_email: session.user.email,
          grantee_email: email,
          role,
        })
        .select()
        .single();
      if (error) return { ok: false, message: error.message };
      setRows((prev) => [...prev, data]);
      return { ok: true };
    },
    [userId, userEmail, myShares, session],
  );

  const updateShare = useCallback(
    async (granteeEmail, role) => {
      const { error } = await supabase
        .from('shares')
        .update({ role })
        .eq('owner_id', userId)
        .eq('grantee_email', granteeEmail);
      if (error) return { ok: false, message: error.message };
      setRows((prev) =>
        prev.map((r) =>
          r.owner_id === userId && r.grantee_email === granteeEmail ? { ...r, role } : r,
        ),
      );
      return { ok: true };
    },
    [userId],
  );

  const removeShare = useCallback(
    async (granteeEmail) => {
      const { error } = await supabase
        .from('shares')
        .delete()
        .eq('owner_id', userId)
        .eq('grantee_email', granteeEmail);
      if (error) return { ok: false, message: error.message };
      setRows((prev) => prev.filter((r) => !(r.owner_id === userId && r.grantee_email === granteeEmail)));
      return { ok: true };
    },
    [userId],
  );

  return { available, myShares, sharedWithMe, addShare, updateShare, removeShare };
}
