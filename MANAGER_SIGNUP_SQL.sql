-- ─────────────────────────────────────────────────────────────────────────────
-- ALTA DE MANAGERS (whitelist propia) + FIX DE SEGURIDAD CRÍTICO en el trigger
-- de registro. Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Qué arregla (URGENTE — ya estaba en producción):
--   El trigger handle_new_user() confiaba ciegamente en el campo "role" que
--   manda el propio cliente al registrarse (raw_user_meta_data->>'role').
--   Cualquiera que supiera la URL + anon key de Supabase (públicas, están en
--   el JS del sitio) podía llamar directo a supabase.auth.signUp() con
--   role: 'admin' en los metadatos y crearse una cuenta de administrador sin
--   ningún control. Además, el trigger tragaba cualquier error
--   silenciosamente ("exception when others then return new"), dejando
--   usuarios de Auth "fantasma" sin perfil si algo fallaba.
--
-- Qué agrega:
--   1. manager_whitelist — tabla de emails habilitados por un admin para
--      auto-registrarse como manager (mismo patrón que creator_whitelist,
--      pero por email en vez de usuario de TikTok, porque un manager no
--      necesariamente es creador de contenido).
--   2. is_manager_whitelisted(email) — RPC pública de solo lectura (para el
--      chequeo amigable del lado del cliente, igual que is_creator_whitelisted).
--   3. admin_add_manager_whitelist(email, agency) — RPC solo-admin para
--      habilitar un email desde el panel.
--   4. handle_new_user() reescrito: el rol SIEMPRE se recalcula server-side
--      contra creator_whitelist o manager_whitelist según corresponda.
--      'admin' (o cualquier otro valor) nunca se auto-asigna por signup
--      público — ya no importa qué mande el cliente en los metadatos.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) manager_whitelist
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.manager_whitelist (
    email      CITEXT PRIMARY KEY,
    agency     TEXT NOT NULL DEFAULT 'latam',
    added_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at    TIMESTAMPTZ
);

ALTER TABLE public.manager_whitelist ENABLE ROW LEVEL SECURITY;
-- Sin políticas de SELECT/INSERT directas: el chequeo lo hacen las RPCs de
-- abajo (SECURITY DEFINER, bypasean RLS). Los admins gestionan la tabla
-- únicamente a través de admin_add_manager_whitelist.


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) RPC pública — chequeo amigable del lado del cliente antes de intentar
--    el signUp real (la validación que de verdad importa vive en el trigger).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_manager_whitelisted(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec public.manager_whitelist%ROWTYPE;
BEGIN
    SELECT * INTO rec FROM public.manager_whitelist WHERE email = lower(trim(p_email))::citext LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'not_found');
    END IF;

    IF rec.used_at IS NOT NULL THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'already_used');
    END IF;

    RETURN jsonb_build_object('allowed', true, 'reason', 'ok', 'agency', rec.agency);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_manager_whitelisted(TEXT) TO anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) RPC solo-admin — habilitar un email para registrarse como manager
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_add_manager_whitelist(p_email TEXT, p_agency TEXT DEFAULT 'latam')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email CITEXT := lower(trim(p_email))::citext;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;

    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Email inválido.';
    END IF;

    INSERT INTO public.manager_whitelist (email, agency, added_by, added_at, used_at)
    VALUES (v_email, COALESCE(p_agency, 'latam'), auth.uid(), now(), NULL)
    ON CONFLICT (email) DO UPDATE SET
        agency   = EXCLUDED.agency,
        added_by = EXCLUDED.added_by,
        added_at = now(),
        used_at  = NULL; -- re-habilitar si ya se había usado o se quiere reintentar

    RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_manager_whitelist(TEXT, TEXT) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4) handle_new_user() — reescrito, seguro. El rol se recalcula SIEMPRE
--    server-side; nunca se confía en el valor que manda el cliente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tiktok         CITEXT := nullif(trim(new.raw_user_meta_data->>'tiktok_username'), '');
    v_requested_role TEXT   := coalesce(new.raw_user_meta_data->>'role', 'creator');
    v_display_name   TEXT;
    v_role           TEXT;
    v_agency         TEXT   := 'latam';
    v_creator_wl     public.creator_whitelist%ROWTYPE;
    v_manager_wl     public.manager_whitelist%ROWTYPE;
    v_has_metrics    BOOLEAN;
BEGIN
    IF v_requested_role = 'creator' THEN
        IF v_tiktok IS NULL OR length(v_tiktok) = 0 THEN
            RAISE EXCEPTION 'El usuario de TikTok es obligatorio para creadores.';
        END IF;

        SELECT * INTO v_creator_wl FROM public.creator_whitelist WHERE tiktok_username = v_tiktok;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Tu usuario de TikTok no está registrado en la agencia.';
        END IF;
        IF v_creator_wl.status = 'Abandonó' THEN
            RAISE EXCEPTION 'Tu cuenta no está activa. Contactá al administrador de la agencia.';
        END IF;

        v_role   := 'creator';
        v_agency := v_creator_wl.agency;

    ELSIF v_requested_role = 'manager' THEN
        SELECT * INTO v_manager_wl FROM public.manager_whitelist WHERE email = new.email::citext;
        IF NOT FOUND OR v_manager_wl.used_at IS NOT NULL THEN
            RAISE EXCEPTION 'Tu email no está habilitado para registrarte como manager. Pedile a un admin que te habilite desde "Gestión de Managers".';
        END IF;

        v_role   := 'manager';
        v_agency := coalesce(v_manager_wl.agency, 'latam');

        UPDATE public.manager_whitelist SET used_at = now() WHERE email = new.email::citext;

    ELSE
        -- 'admin' o cualquier otro valor: JAMÁS se auto-asigna vía signup público.
        RAISE EXCEPTION 'Rol no permitido para auto-registro.';
    END IF;

    v_display_name := coalesce(new.raw_user_meta_data->>'display_name', v_tiktok::text, split_part(new.email, '@', 1));

    IF v_role = 'creator' THEN
        SELECT exists(SELECT 1 FROM public.creator_metrics WHERE username = v_tiktok) INTO v_has_metrics;
    ELSE
        v_has_metrics := false;
    END IF;

    INSERT INTO public.profiles (id, tiktok_username, email, role, is_admin, is_manager, is_creator, display_name, agency)
    VALUES (
        new.id,
        v_tiktok,
        new.email::citext,
        v_role,
        false,
        (v_role = 'manager'),
        coalesce(v_has_metrics, false),
        v_display_name,
        v_agency
    );

    RETURN new;
END;
$$;

-- El trigger ya existe (on_auth_user_created en auth.users) — solo se
-- reemplaza la función, no hace falta recrear el trigger.

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN — para habilitar a un manager nuevo: Panel Admin → "Gestión de
-- Managers" → sección "Habilitar registro de manager" → cargar su email.
-- Después puede entrar a "Crear cuenta" → pestaña "Soy manager" y registrarse
-- con ese mismo email.
-- ─────────────────────────────────────────────────────────────────────────────
