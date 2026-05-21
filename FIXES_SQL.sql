-- ─────────────────────────────────────────────────────────────────────────────
-- FIXES — Ejecutar en Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Eliminar la versión vieja de admin_update_joining_data (3 parámetros, sin agency).
--    La versión correcta con 4 parámetros (p_agency) ya existe desde AGENCIAS_SQL.sql.
DROP FUNCTION IF EXISTS public.admin_update_joining_data(DATE, TEXT, JSONB);


-- 2. Actualizar el CHECK constraint de notifications.target_type.
--    El esquema original solo permitía 'all','manager_group','user'.
--    El código usa además 'role' (broadcast por rol) y 'users' (mensaje de manager a su grupo).

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_target_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_target_type_check
    CHECK (target_type IN ('all', 'role', 'user', 'users', 'manager_group'));
