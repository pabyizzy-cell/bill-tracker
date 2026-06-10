import { useCallback, useEffect, useState } from 'react';
import { todayISO } from '../lib/dates.js';
import { supabase } from '../lib/supabaseClient.js';
import { useLocalStorage } from './useLocalStorage.js';

const STORAGE_KEY = 'bill-tracker:settings:v1';

const fromRow = (r) => ({
  startingBalanceCents:
    r.starting_balance_cents === null ? null : Number(r.starting_balance_cents),
  startingBalanceDate: r.starting_balance_date,
});

// Per-user settings (currently just the stated starting balance). Same
// dual-mode pattern as the other stores.
export function useSettings(session, context) {
  const [local, setLocal] = useLocalStorage(STORAGE_KEY, null);
  const [cloud, setCloud] = useState(null);
  const [available, setAvailable] = useState(true);

  const cloudMode = Boolean(supabase && session);
  const ownerId = context?.ownerId ?? session?.user?.id;

  useEffect(() => {
    if (!cloudMode || !ownerId) return undefined;
    let cancelled = false;
    supabase
      .from('settings')
      .select('*')
      .eq('user_id', ownerId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setAvailable(false);
          setCloud(null);
        } else {
          setAvailable(true);
          setCloud(data ? fromRow(data) : null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cloudMode, ownerId]);

  // Stores "my balance is X as of today".
  const saveStartingBalance = useCallback(
    async (cents) => {
      const value = { startingBalanceCents: cents, startingBalanceDate: todayISO() };
      if (!cloudMode) {
        setLocal(value);
        return true;
      }
      const { data, error } = await supabase
        .from('settings')
        .upsert(
          {
            user_id: ownerId,
            starting_balance_cents: cents,
            starting_balance_date: value.startingBalanceDate,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        .select()
        .single();
      if (error) return false;
      setCloud(fromRow(data));
      return true;
    },
    [cloudMode, ownerId, setLocal],
  );

  const clear = useCallback(async () => {
    if (!cloudMode) {
      setLocal(null);
      return true;
    }
    const { error } = await supabase.from('settings').delete().eq('user_id', ownerId);
    if (error) return false;
    setCloud(null);
    return true;
  }, [cloudMode, ownerId, setLocal]);

  return {
    settings: cloudMode ? cloud : local,
    available: cloudMode ? available : true,
    saveStartingBalance,
    clear,
  };
}
