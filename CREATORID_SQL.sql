-- ─────────────────────────────────────────────────────────────────────────────
-- SOPORTE ID DEL CREADOR (tiktok_id estable)
-- Ejecutar en Supabase → SQL Editor
-- Idempotente: IF NOT EXISTS en todas las instrucciones.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columna tiktok_id en profiles (identificador estable de TikTok)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tiktok_id TEXT;

-- 2. Columna tiktok_id en creator_metrics
ALTER TABLE public.creator_metrics
ADD COLUMN IF NOT EXISTS tiktok_id TEXT;

-- 3. Índice para búsqueda rápida por tiktok_id en métricas
CREATE INDEX IF NOT EXISTS idx_creator_metrics_tiktok_id
ON public.creator_metrics(tiktok_id)
WHERE tiktok_id IS NOT NULL;

-- 4. Índice en profiles
CREATE INDEX IF NOT EXISTS idx_profiles_tiktok_id
ON public.profiles(tiktok_id)
WHERE tiktok_id IS NOT NULL;
