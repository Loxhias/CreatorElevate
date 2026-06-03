-- ═══════════════════════════════════════════════════════════════════════════
-- CreatorElevate: Pre-registro y control de acceso por planilla
-- Ejecutar en: Supabase > SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════


-- 1. Tabla de whitelist de creadores pre-registrados
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_whitelist (
    tiktok_username TEXT        PRIMARY KEY,
    tiktok_id       TEXT,
    status          TEXT        NOT NULL DEFAULT '',   -- '' = activo | 'Abandonó' = bloqueado
    join_date       TIMESTAMPTZ,
    agency          TEXT        NOT NULL DEFAULT 'latam',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE creator_whitelist ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden escribir
CREATE POLICY "admins_write_whitelist" ON creator_whitelist
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- Lectura pública (necesario para verificar al registrarse)
CREATE POLICY "public_read_whitelist" ON creator_whitelist
    FOR SELECT USING (true);


-- 2. RPC: verificar si un username puede registrarse
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_creator_whitelisted(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec creator_whitelist%ROWTYPE;
BEGIN
    SELECT * INTO rec
    FROM creator_whitelist
    WHERE tiktok_username = lower(trim(p_username))
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
    END IF;

    IF rec.status = 'Abandonó' THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'abandoned', 'agency', rec.agency);
    END IF;

    RETURN jsonb_build_object('allowed', true, 'reason', 'ok', 'agency', rec.agency);
END;
$$;

-- Permitir llamada anónima (es pública por diseño — solo lee la whitelist)
GRANT EXECUTE ON FUNCTION is_creator_whitelisted(TEXT) TO anon, authenticated;


-- 3. RPC: sincronizar whitelist desde Excel y desactivar "Abandonó" (solo admin)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_sync_whitelist(p_rows JSONB, p_agency TEXT DEFAULT 'latam')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    row_data    JSONB;
    v_username  TEXT;
    v_tiktok_id TEXT;
    v_status    TEXT;
    v_join_date TIMESTAMPTZ;
    v_count     INTEGER := 0;
BEGIN
    -- Solo admins pueden llamar esta función
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    FOR row_data IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
        v_username  := lower(trim(row_data->>'username'));
        v_tiktok_id := nullif(trim(COALESCE(row_data->>'tiktok_id', '')), '');
        v_status    := COALESCE(trim(row_data->>'status'), '');

        -- Parsear "2025-08-07 08:29:45 (UTC+0)" → TIMESTAMPTZ
        BEGIN
            v_join_date := (regexp_replace(COALESCE(row_data->>'join_date', ''), '\s*\(.*\)$', ''))::TIMESTAMPTZ;
        EXCEPTION WHEN OTHERS THEN
            v_join_date := NULL;
        END;

        IF v_username = '' THEN CONTINUE; END IF;

        -- Upsert en whitelist
        INSERT INTO creator_whitelist (tiktok_username, tiktok_id, status, join_date, agency, updated_at)
        VALUES (v_username, v_tiktok_id, v_status, v_join_date, p_agency, NOW())
        ON CONFLICT (tiktok_username) DO UPDATE SET
            tiktok_id  = COALESCE(EXCLUDED.tiktok_id, creator_whitelist.tiktok_id),
            status     = EXCLUDED.status,
            join_date  = COALESCE(EXCLUDED.join_date, creator_whitelist.join_date),
            agency     = EXCLUDED.agency,
            updated_at = NOW();

        -- Desactivar cuenta si el creador abandonó
        IF v_status = 'Abandonó' THEN
            UPDATE profiles
            SET active = false
            WHERE lower(tiktok_username) = v_username
               OR (v_tiktok_id IS NOT NULL AND tiktok_id = v_tiktok_id);
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_sync_whitelist(JSONB, TEXT) TO authenticated;
