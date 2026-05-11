/**
 * Supabase client — cargado vía CDN ESM.
 * Si la app no está configurada, expone un cliente "stub" que falla suavemente
 * para que el modo DEMO siga funcionando con preloadedData.
 */
import { env, isSupabaseConfigured } from './env.js';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4?bundle';

let supabase = null;

// Toda llamada a Supabase aborta automáticamente si supera 10 segundos
const fetchWithTimeout = (url, opts = {}) => {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 10000);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(tid));
};

if (isSupabaseConfigured) {
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        global: { fetch: fetchWithTimeout },
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
