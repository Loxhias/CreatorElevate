-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN V3 — SOPORTE DE FECHA DE INGRESO Y PERÍODOS DE MÈTRICAS PERSONALIZADOS
-- Ejecutar en Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Añadir la columna joining_date a la tabla profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS joining_date DATE;

-- 2. Eliminar la versión anterior de la función de carga de métricas (para evitar sobrecargas de firma)
DROP FUNCTION IF EXISTS public.creator_submit_metrics(INTEGER, NUMERIC, BIGINT);

-- 3. Crear la nueva versión de creator_submit_metrics con parámetro p_period_date
CREATE OR REPLACE FUNCTION public.creator_submit_metrics(
    p_valid_days  INTEGER,
    p_live_hours  NUMERIC,
    p_diamonds    BIGINT,
    p_period_date DATE DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_username     TEXT;
    v_agency       TEXT;
    v_period_id    UUID;
    v_period_date  DATE;
    v_period_label TEXT;
    v_live_secs    INTEGER;
    v_live_dur     TEXT;
BEGIN
    -- Obtener datos de perfil y agencia
    SELECT tiktok_username, COALESCE(agency, 'latam')
    INTO   v_username, v_agency
    FROM   public.profiles
    WHERE  id = auth.uid();

    IF v_username IS NULL OR trim(v_username) = '' THEN
        RAISE EXCEPTION 'Configurá tu usuario de TikTok en el perfil antes de cargar métricas.';
    END IF;

    -- Validar rangos
    IF p_valid_days < 0 OR p_valid_days > 31 THEN
        RAISE EXCEPTION 'Días válidos debe estar entre 0 y 31.';
    END IF;
    IF p_live_hours < 0 OR p_live_hours > 744 THEN
        RAISE EXCEPTION 'Horas de live fuera de rango.';
    END IF;
    IF p_diamonds < 0 THEN
        RAISE EXCEPTION 'Los diamantes no pueden ser negativos.';
    END IF;

    -- Convertir horas a segundos y generar string formativo
    v_live_secs := ROUND(p_live_hours * 3600)::INTEGER;
    v_live_dur  := CONCAT(
        FLOOR(p_live_hours)::INTEGER::TEXT, 'h ',
        ROUND((p_live_hours - FLOOR(p_live_hours)) * 60)::INTEGER::TEXT, 'min'
    );

    -- Determinar fecha y label del período en base al argumento
    IF p_period_date IS NOT NULL THEN
        v_period_date  := date_trunc('month', p_period_date)::DATE;
        v_period_label := initcap(to_char(p_period_date, 'TMMonth YYYY'));
    ELSE
        v_period_date  := date_trunc('month', CURRENT_DATE)::DATE;
        v_period_label := initcap(to_char(CURRENT_DATE, 'TMMonth YYYY'));
    END IF;

    -- Crear período de reporte si no existe
    INSERT INTO report_periods (period, label)
    VALUES (v_period_date, v_period_label)
    ON CONFLICT (period) DO NOTHING;

    SELECT id INTO v_period_id
    FROM report_periods
    WHERE period = v_period_date;

    -- Upsert de métricas de creador
    INSERT INTO creator_metrics
        (period_id, username, valid_days, live_seconds, live_duration, diamonds, agency)
    VALUES
        (v_period_id, v_username, p_valid_days, v_live_secs, v_live_dur, p_diamonds, v_agency)
    ON CONFLICT (period_id, username) DO UPDATE SET
        valid_days    = EXCLUDED.valid_days,
        live_seconds  = EXCLUDED.live_seconds,
        live_duration = EXCLUDED.live_duration,
        diamonds      = EXCLUDED.diamonds,
        agency        = EXCLUDED.agency;

    RETURN jsonb_build_object(
        'ok',           true,
        'period',       v_period_date,
        'period_label', v_period_label,
        'username',     v_username,
        'agency',       v_agency
    );
END;
$$;

-- Otorgar permisos de ejecución de la nueva firma
GRANT EXECUTE ON FUNCTION public.creator_submit_metrics(INTEGER, NUMERIC, BIGINT, DATE) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS DE CÁLCULO Y SINCRONIZACIÓN AUTOMÁTICA DE "DAYS_SINCE_JOINING"
-- ─────────────────────────────────────────────────────────────────────────────

-- 4. Trigger BEFORE INSERT OR UPDATE en creator_metrics
CREATE OR REPLACE FUNCTION public.set_creator_metrics_days_since_joining()
RETURNS TRIGGER AS $$
DECLARE
    v_joining_date DATE;
    v_period_date DATE;
BEGIN
    SELECT joining_date INTO v_joining_date
    FROM public.profiles
    WHERE lower(tiktok_username) = lower(NEW.username);

    IF v_joining_date IS NOT NULL THEN
        SELECT period INTO v_period_date
        FROM public.report_periods
        WHERE id = NEW.period_id;

        IF v_period_date IS NOT NULL THEN
            NEW.days_since_joining := (v_period_date - v_joining_date);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_creator_metrics_days_since_joining_trigger ON public.creator_metrics;
CREATE TRIGGER set_creator_metrics_days_since_joining_trigger
    BEFORE INSERT OR UPDATE ON public.creator_metrics
    FOR EACH ROW EXECUTE FUNCTION public.set_creator_metrics_days_since_joining();


-- 5. Trigger AFTER UPDATE de profiles (joining_date o tiktok_username) para sincronización retroactiva
CREATE OR REPLACE FUNCTION public.sync_creator_metrics_days_since_joining()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND (
            OLD.joining_date IS DISTINCT FROM NEW.joining_date OR
            OLD.tiktok_username IS DISTINCT FROM NEW.tiktok_username
       )) OR (TG_OP = 'INSERT' AND NEW.joining_date IS NOT NULL) THEN
        
        IF NEW.tiktok_username IS NOT NULL AND NEW.tiktok_username <> '' THEN
            UPDATE public.creator_metrics m
            SET days_since_joining = (p.period - NEW.joining_date)
            FROM public.report_periods p
            WHERE lower(m.username) = lower(NEW.tiktok_username)
              AND m.period_id = p.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_creator_metrics_days_since_joining_trigger ON public.profiles;
CREATE TRIGGER sync_creator_metrics_days_since_joining_trigger
    AFTER INSERT OR UPDATE OF joining_date, tiktok_username ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.sync_creator_metrics_days_since_joining();
