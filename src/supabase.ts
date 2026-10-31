import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { nativeStorage } from './native';

// supabase-js keeps the session (tokens only, never the password) in
// localStorage and refreshes it. Nothing else is stored. Inside the Android
// app the session lives in the app's private storage instead, shared with
// its widget.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    ...(nativeStorage ? { storage: nativeStorage } : {}),
  },
});
