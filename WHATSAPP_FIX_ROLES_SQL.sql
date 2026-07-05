-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: permitir que cualquier rol autenticado (no solo creadores) conecte
-- WhatsApp y hable con el asistente. El check-in de progreso semanal sigue
-- siendo solo para creadores (eso lo filtra whatsapp_checkin_candidates,
-- que no se toca acá).
-- Ejecutar en Supabase → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.whatsapp_generate_link_code()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_code      TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado.';
    END IF;

    DELETE FROM public.whatsapp_link_codes WHERE profile_id = v_caller_id AND used_at IS NULL;

    LOOP
        v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
        BEGIN
            INSERT INTO public.whatsapp_link_codes (code, profile_id, expires_at)
            VALUES (v_code, v_caller_id, now() + interval '30 minutes');
            EXIT;
        EXCEPTION WHEN unique_violation THEN
        END;
    END LOOP;

    RETURN jsonb_build_object('code', v_code, 'expires_in_minutes', 30);
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_generate_link_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_generate_link_code() TO authenticated;
