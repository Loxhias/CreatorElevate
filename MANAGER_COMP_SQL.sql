-- ─────────────────────────────────────────────────────────────────────────────
-- COMPENSACIÓN DE MANAGERS: objetivo mensual y tasas de comisión, por agencia
-- Ejecutar en Supabase → SQL Editor
--
-- Reemplaza los valores hardcodeados de DEFAULT_COMP (Panel de Creadores /
-- shell.html) por una fila editable desde la app (Admin → Configuración de
-- comisiones), una por agencia (latam / usa). Las fórmulas en sí no cambian —
-- ver assets/js/managerComp.js, que las porta 1:1.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tabla
CREATE TABLE IF NOT EXISTS public.manager_comp_settings (
    agency                      TEXT PRIMARY KEY,

    objetivo_mensual            NUMERIC(14,0) NOT NULL DEFAULT 7660000,

    tier1_nuevos                INTEGER NOT NULL DEFAULT 25,
    tier1_monetizan             NUMERIC NOT NULL DEFAULT 10,
    tier1_graduados             INTEGER NOT NULL DEFAULT 4,
    tier1_pago                  NUMERIC NOT NULL DEFAULT 250,

    tier2_nuevos                INTEGER NOT NULL DEFAULT 20,
    tier2_monetizan             NUMERIC NOT NULL DEFAULT 5,
    tier2_graduados             INTEGER NOT NULL DEFAULT 1,
    tier2_pago                  NUMERIC NOT NULL DEFAULT 200,

    umbral_monetizan_completo   NUMERIC(14,0) NOT NULL DEFAULT 80000,
    umbral_monetizan_parcial    NUMERIC(14,0) NOT NULL DEFAULT 40000,
    peso_monetizan_parcial      NUMERIC NOT NULL DEFAULT 0.5,

    tasa_subir                  NUMERIC NOT NULL DEFAULT 4,
    tasa_mantener                NUMERIC NOT NULL DEFAULT 2,

    -- 5 valores, uno por tier de actividad (días/horas definidos en el código,
    -- ver ACTIVIDAD_TIERS en assets/js/managerComp.js)
    tasas_actividad              NUMERIC[] NOT NULL DEFAULT ARRAY[0.5,1,1.5,2,2.5],

    -- 2 valores, tasa de "incremento de ingresos" al alcanzar cada % del
    -- objetivo mensual (incremento_tiers_min = umbral en %, mismo orden)
    tasas_incremento             NUMERIC[] NOT NULL DEFAULT ARRAY[5.5,9],
    incremento_tiers_min         NUMERIC[] NOT NULL DEFAULT ARRAY[90,100],

    -- % del pool de comisión que se queda el manager (resto queda para la
    -- agencia) — valor interno, no se muestra en texto a los managers.
    pct_reparto_comisiones       NUMERIC NOT NULL DEFAULT 40,

    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by                   UUID REFERENCES public.profiles(id)
);

-- 2. RLS: cualquier usuario autenticado puede leer (managers y admin lo
--    necesitan), solo el admin puede escribir. Mismo patrón que
--    report_periods / creator_metrics en supabase/schema.sql.
ALTER TABLE public.manager_comp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comp_settings_select"      ON public.manager_comp_settings;
DROP POLICY IF EXISTS "comp_settings_admin_write" ON public.manager_comp_settings;

CREATE POLICY "comp_settings_select" ON public.manager_comp_settings
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "comp_settings_admin_write" ON public.manager_comp_settings
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. Seed — una fila por agencia con los valores actuales de DEFAULT_COMP.
--    No pisa filas existentes si ya se corrió esto antes.
INSERT INTO public.manager_comp_settings (agency)
VALUES ('latam'), ('usa')
ON CONFLICT (agency) DO NOTHING;
