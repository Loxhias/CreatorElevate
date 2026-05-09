/**
 * Supabase client — cargado vía CDN ESM.
 * Si la app no está configurada, expone un cliente "stub" que falla suavemente
 * para que el modo DEMO siga funcionando con preloadedData.
 */
import { env, isSupabaseConfigured } from './env.js';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4?bundle';

let supabase = null;

if (isSupabaseConfigured) {
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storage: window.localStorage,
            storageKey: 'ce.auth',
        },
    });
}


export { supabase, isSupabaseConfigured };
