-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 2: restringir de verdad quién ve qué en creator_metrics
-- Ejecutar en Supabase → SQL Editor
--
-- Hoy "metrics_select" deja leer TODAS las filas de creator_metrics a
-- cualquier usuario autenticado (admin, manager o creador). Esto la
-- reemplaza por 3 reglas:
--   - admin:    ve todo (sin cambios de comportamiento para admin)
--   - manager:  solo las filas de los creadores que tiene asignados
--               (vía creator_assignments)
--   - creador:  solo su propia fila (ya existía como "creators_read_own_metrics",
--               no se toca — hasta ahora era letra muerta porque
--               "metrics_select" la volvía irrelevante)
--
-- "metrics_admin_write" (solo admin escribe) NO se toca.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "metrics_select" ON public.creator_metrics;

CREATE POLICY "metrics_select_admin" ON public.creator_metrics
    FOR SELECT USING (public.is_admin());

CREATE POLICY "metrics_select_manager" ON public.creator_metrics
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.creator_assignments ca
            WHERE ca.manager_id = auth.uid()
              AND lower(ca.username::text) = lower(creator_metrics.username::text)
        )
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- Efecto colateral que esto arregla: la comisión de "incremento de ingresos"
-- de un manager (Mis Ganancias) necesita saber el TOTAL de diamantes de toda
-- la agencia — antes lo sumaba directamente sobre creator_metrics porque veía
-- todas las filas. Ahora que un manager ya no puede leer filas ajenas, esa
-- suma le daría solo su propio equipo. Esta función devuelve el total sin
-- exponer ninguna fila individual de otro creador.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agency_total_diamonds(p_period_id uuid, p_agency text DEFAULT 'latam')
RETURNS numeric
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT COALESCE(SUM(diamonds), 0)
    FROM public.creator_metrics
    WHERE period_id = p_period_id AND COALESCE(agency, 'latam') = p_agency;
$$;

GRANT EXECUTE ON FUNCTION public.agency_total_diamonds(uuid, text) TO authenticated;
