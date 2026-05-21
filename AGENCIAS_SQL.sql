-- ─────────────────────────────────────────────────────────────────────────────
-- SOPORTE MULTI-AGENCIA: LATAM / USA
-- Ejecutar en Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columna agency en profiles (asigna a qué agencia pertenece cada usuario)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS agency TEXT DEFAULT 'latam';

-- 2. Columna agency en creator_metrics (se copia automáticamente del perfil)
ALTER TABLE public.creator_metrics
ADD COLUMN IF NOT EXISTS agency TEXT DEFAULT 'latam';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Actualización de creator_submit_metrics:
--    Lee la agencia del perfil del creador y la guarda en la métrica.
CREATE OR REPLACE FUNCTION creator_submit_metrics(
    p_valid_days  INTEGER,
    p_live_hours  NUMERIC,
    p_diamonds    BIGINT
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
    SELECT tiktok_username, COALESCE(agency, 'latam')
    INTO   v_username, v_agency
    FROM   public.profiles
    WHERE  id = auth.uid();

    IF v_username IS NULL OR trim(v_username) = '' THEN
        RAISE EXCEPTION 'Configurá tu usuario de TikTok en el perfil antes de cargar métricas.';
    END IF;

    IF p_valid_days < 0 OR p_valid_days > 31 THEN
        RAISE EXCEPTION 'Días válidos debe estar entre 0 y 31.';
    END IF;
    IF p_live_hours < 0 OR p_live_hours > 744 THEN
        RAISE EXCEPTION 'Horas de live fuera de rango.';
    END IF;
    IF p_diamonds < 0 THEN
        RAISE EXCEPTION 'Los diamantes no pueden ser negativos.';
    END IF;

    v_live_secs := ROUND(p_live_hours * 3600)::INTEGER;
    v_live_dur  := CONCAT(
        FLOOR(p_live_hours)::INTEGER::TEXT, 'h ',
        ROUND((p_live_hours - FLOOR(p_live_hours)) * 60)::INTEGER::TEXT, 'min'
    );

    v_period_date  := date_trunc('month', CURRENT_DATE)::DATE;
    v_period_label := initcap(to_char(CURRENT_DATE, 'TMMonth YYYY'));

    INSERT INTO report_periods (period, label)
    VALUES (v_period_date, v_period_label)
    ON CONFLICT (period) DO NOTHING;

    SELECT id INTO v_period_id
    FROM report_periods
    WHERE period = v_period_date;

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

GRANT EXECUTE ON FUNCTION creator_submit_metrics(INTEGER, NUMERIC, BIGINT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Actualización de admin_update_joining_data:
--    Acepta p_agency para etiquetar las filas correctamente.
CREATE OR REPLACE FUNCTION admin_update_joining_data(
    p_period_date  DATE,
    p_period_label TEXT,
    p_rows         JSONB,
    p_agency       TEXT DEFAULT 'latam'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_caller_role TEXT;
    v_period_id   UUID;
    v_inserted    INTEGER := 0;
    v_updated     INTEGER := 0;
    r             JSONB;
    v_username    TEXT;
    v_days        INTEGER;
    v_battles     INTEGER;
    v_existed     BOOLEAN;
BEGIN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role NOT IN ('admin') THEN
        RAISE EXCEPTION 'Solo los administradores pueden ejecutar esta acción.';
    END IF;

    INSERT INTO report_periods (period, label)
    VALUES (p_period_date, p_period_label)
    ON CONFLICT (period) DO UPDATE SET label = EXCLUDED.label;

    SELECT id INTO v_period_id
    FROM report_periods
    WHERE period = p_period_date;

    FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
        v_username := trim(both from (r->>'username'));
        v_days     := COALESCE((r->>'days_since_joining')::INTEGER, 0);
        v_battles  := COALESCE((r->>'battles')::INTEGER, 0);

        IF v_username = '' OR v_username IS NULL THEN CONTINUE; END IF;

        SELECT EXISTS (
            SELECT 1 FROM creator_metrics
            WHERE period_id = v_period_id
              AND lower(username) = lower(v_username)
        ) INTO v_existed;

        IF v_existed THEN
            UPDATE creator_metrics
            SET days_since_joining = v_days,
                battles            = v_battles,
                agency             = p_agency
            WHERE period_id = v_period_id
              AND lower(username) = lower(v_username);
            v_updated := v_updated + 1;
        ELSE
            INSERT INTO creator_metrics
                (period_id, username, days_since_joining, battles, agency)
            VALUES
                (v_period_id, v_username, v_days, v_battles, p_agency);
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'ok',       true,
        'inserted', v_inserted,
        'updated',  v_updated,
        'period_id', v_period_id,
        'agency',   p_agency
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_joining_data(DATE, TEXT, JSONB, TEXT) TO authenticated;
