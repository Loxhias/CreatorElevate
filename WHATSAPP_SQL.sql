-- ─────────────────────────────────────────────────────────────────────────────
-- SEGUIMIENTO AUTOMÁTICO POR WHATSAPP + ASISTENTE HÍBRIDO
-- Ejecutar en Supabase → SQL Editor
-- Idempotente: seguro de re-ejecutar (CREATE ... IF NOT EXISTS / CREATE OR REPLACE).
--
-- Qué agrega:
--   1. profiles.whatsapp_number / whatsapp_linked_at — número VERIFICADO (solo lo
--      llena el webhook de WhatsApp al vincular, nunca un formulario). No toca
--      profiles.phone, que sigue siendo el campo libre existente.
--   2. whatsapp_link_codes — códigos de un solo uso para el flujo "click para
--      chatear": el creador pide un código en la app, lo manda por WhatsApp, y
--      el webhook vincula el número real que lo envió.
--   3. whatsapp_messages_log — auditoría append-only de cada mensaje (entrante
--      y saliente), y fuente del cooldown del check-in programado.
--   4. whatsapp_faq — preguntas frecuentes editables por el admin (respuestas
--      predefinidas, sin costo de IA).
--   5. whatsapp_checkin_candidates — vista de solo lectura para el job
--      programado (creadores con WhatsApp vinculado + sus métricas vigentes).
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) profiles — número de WhatsApp verificado
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS whatsapp_number CITEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS whatsapp_linked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_whatsapp_number_idx ON public.profiles(whatsapp_number);

COMMENT ON COLUMN public.profiles.whatsapp_number IS
    'Número de WhatsApp verificado (poblado únicamente por el webhook al confirmar un código de vinculación). Distinto de profiles.phone, que es un campo libre no verificado.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) whatsapp_link_codes — códigos de vinculación de un solo uso
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whatsapp_link_codes (
    code       TEXT PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS whatsapp_link_codes_profile_idx ON public.whatsapp_link_codes(profile_id);

ALTER TABLE public.whatsapp_link_codes ENABLE ROW LEVEL SECURITY;
-- Sin políticas: el RPC de abajo es SECURITY DEFINER (escribe sin pasar por RLS)
-- y el webhook consume los códigos con la service_role key (bypassea RLS).


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) whatsapp_messages_log — auditoría append-only
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whatsapp_messages_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id   UUID REFERENCES public.profiles(id),
    direction    TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type TEXT NOT NULL CHECK (message_type IN (
        'link_prompt', 'link_confirmation', 'faq_predefined', 'faq_ai',
        'progress_checkin', 'unrecognized'
    )),
    body         TEXT,
    twilio_sid   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_log_profile_idx
    ON public.whatsapp_messages_log(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_log_type_idx
    ON public.whatsapp_messages_log(message_type, created_at DESC);

ALTER TABLE public.whatsapp_messages_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_messages_log_admin_select" ON public.whatsapp_messages_log;
CREATE POLICY "whatsapp_messages_log_admin_select" ON public.whatsapp_messages_log
    FOR SELECT USING (public.is_admin());
-- Sin política de escritura: solo el webhook/script con service_role escriben acá.


-- ═══════════════════════════════════════════════════════════════════════════
-- 4) whatsapp_faq — preguntas frecuentes editables por el admin
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whatsapp_faq (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keywords      TEXT[] NOT NULL DEFAULT '{}',
    question_label TEXT NOT NULL,
    answer        TEXT NOT NULL,
    active        BOOLEAN NOT NULL DEFAULT true,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS whatsapp_faq_set_updated_at ON public.whatsapp_faq;
CREATE TRIGGER whatsapp_faq_set_updated_at
    BEFORE UPDATE ON public.whatsapp_faq
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.whatsapp_faq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_faq_select" ON public.whatsapp_faq;
CREATE POLICY "whatsapp_faq_select" ON public.whatsapp_faq
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "whatsapp_faq_admin_write" ON public.whatsapp_faq;
CREATE POLICY "whatsapp_faq_admin_write" ON public.whatsapp_faq
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ═══════════════════════════════════════════════════════════════════════════
-- 5) RPC — el creador pide un código de vinculación
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.whatsapp_generate_link_code()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_role      TEXT;
    v_code      TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado.';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_caller_id;
    IF v_role IS DISTINCT FROM 'creator' THEN
        RAISE EXCEPTION 'Solo los creadores pueden conectar WhatsApp.';
    END IF;

    -- Invalidar códigos previos no usados de este perfil (siempre queda uno vigente)
    DELETE FROM public.whatsapp_link_codes WHERE profile_id = v_caller_id AND used_at IS NULL;

    LOOP
        v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
        BEGIN
            INSERT INTO public.whatsapp_link_codes (code, profile_id, expires_at)
            VALUES (v_code, v_caller_id, now() + interval '30 minutes');
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            -- colisión improbable (espacio de 16^8) — reintentar con otro código
        END;
    END LOOP;

    RETURN jsonb_build_object('code', v_code, 'expires_in_minutes', 30);
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_generate_link_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_generate_link_code() TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Vista — candidatos al check-in programado
--    Solo accesible en la práctica vía service_role (script de GitHub Actions),
--    no se otorga a authenticated/anon.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.whatsapp_checkin_candidates AS
SELECT
    p.id AS profile_id,
    p.tiktok_username AS username,
    p.display_name,
    p.whatsapp_number,
    COALESCE(p.agency, 'latam') AS agency,
    lm.diamonds,
    lm.diamonds_last_month,
    lm.valid_days,
    lm.live_seconds,
    lm.battles
FROM public.profiles p
JOIN public.latest_metrics lm ON lower(lm.username) = lower(p.tiktok_username)
WHERE p.whatsapp_number IS NOT NULL
  AND p.role = 'creator'
  AND COALESCE(p.active, true) = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN — recordá: para probar el flujo de punta a punta hace falta una cuenta
-- de Twilio (Sandbox de WhatsApp alcanza para desarrollo) y, para el envío
-- programado real, un Message Template aprobado por Meta. Ver el plan para el
-- detalle de fases.
-- ─────────────────────────────────────────────────────────────────────────────
