// Supabase connection for cloud sync.
//
// These are the *publishable* client values — they are safe to ship in
// front-end code because every table is protected by Row Level Security:
// the anon key only lets a signed-in user touch their own rows.
// NEVER put the service_role / secret key in this file or anywhere in the app.
//
// Leave both blank to run the app in local-only mode (browser localStorage).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
