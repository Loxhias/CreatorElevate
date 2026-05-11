/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║                  CREATOR ELEVATE · ENV CONFIG                    ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Reemplaza estos placeholders con los valores de tu proyecto.    ║
 * ║  Mientras estén con "REEMPLAZA_…" la app funciona en MODO DEMO  ║
 * ║  (datos hardcodeados de data.js, sin Supabase).                 ║
 * ║                                                                  ║
 * ║  Dónde obtenerlos:                                               ║
 * ║   1. Crea un proyecto en https://supabase.com/dashboard          ║
 * ║   2. Settings → API:                                             ║
 * ║      • Project URL  → SUPABASE_URL                               ║
 * ║      • anon public  → SUPABASE_ANON_KEY                          ║
 * ║   3. (opcional) Genera VAPID keys para Web Push:                 ║
 * ║         npx web-push generate-vapid-keys                         ║
 * ║      • Public key   → VAPID_PUBLIC_KEY                           ║
 * ║                                                                  ║
 * ║  ⚠ La anon key es PÚBLICA por diseño (RLS la protege).          ║
 * ║  ⚠ NUNCA pongas aquí la service_role key.                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

export const env = {
    SUPABASE_URL: 'https://kvrkrlvjfrdwxfolcbon.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cmtybHZqZnJkd3hmb2xjYm9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTI4MTUsImV4cCI6MjA5Mzg2ODgxNX0.RSCrNDYVa45cMNA4n2zOypG1Jo3by6Wi3piLXM6EmPo',
    VAPID_PUBLIC_KEY: 'BCs0Kjc2k6b5HKsSCZP5tD8kR7Fjo6TK5MPtEaZ8YP1jP2aUdsSidnLLCGunM3Y3QvlhX7wIdJ_UhksbH_rPVUk',

    // Dominio sintético usado cuando el usuario inicia sesión con su tiktok_username
    // (sirve como "fallback" si en el futuro decides loguear sin email).
    EMAIL_DOMAIN: 'creatorelevate.app',
};

export const isSupabaseConfigured =
    !env.SUPABASE_URL.startsWith('REEMPLAZA_') &&
    !env.SUPABASE_ANON_KEY.startsWith('REEMPLAZA_');

export const isPushConfigured =
    !env.VAPID_PUBLIC_KEY.startsWith('REEMPLAZA_');
