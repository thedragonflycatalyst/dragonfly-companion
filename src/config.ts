// Both values are public by design (the desktop app ships the same ones).
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY override them, e.g. for staging.
const env = import.meta.env;
const pick = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

export const SUPABASE_URL = pick(env.VITE_SUPABASE_URL, 'https://fkksaivdznqbfsfsagsj.supabase.co');
export const SUPABASE_ANON_KEY = pick(
  env.VITE_SUPABASE_ANON_KEY,
  'sb_publishable_ME6Xg1mtUBA4994aC0n6Uw_LKsJDTXu',
);
