-- ─────────────────────────────────────────────────────────────────────────────
-- INTEGRACIÓN CON MAGIC BY LOXHIAS: activación/mantenimiento de suscripción
-- por desempeño (mes de prueba gratis + subió/mantuvo/bajó de nivel mensual)
-- Ejecutar en Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- magic_status: null hasta que el creador pide la prueba. 'trialing' apenas
-- la pide, 'active' una vez que pasó al menos una evaluación mensual
-- manteniendo/subiendo de nivel, 'revoked' si bajó de nivel y la perdió.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS magic_status TEXT
  CHECK (magic_status IS NULL OR magic_status IN ('trialing', 'active', 'revoked'));

-- Cuándo pidió la prueba — usado por functions/api/magic-sync-subscriptions.js
-- para NO evaluar a un creador durante el mismo período (mes) en que recién
-- se activó (protege su primer mes gratis incondicional).
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS magic_activated_at TIMESTAMPTZ;
