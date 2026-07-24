-- ─────────────────────────────────────────────────────────────────────────────
-- EQUIPO POR ADMIN: cada admin tiene sus propios managers asignados
-- Ejecutar en Supabase → SQL Editor
--
-- Fase 1 (solo esto): agrega profiles.admin_id (mismo patrón que la columna
-- profiles.manager_id ya en producción) + una función nueva, aditiva, que el
-- excel mensual usa para poblar creator_assignments (creador → manager) y
-- profiles.admin_id (manager → admin) por email.
--
-- No modifica admin_upsert_metrics, admin_update_joining_data ni
-- admin_assign_creator — quedan exactamente como están hoy. No cambia
-- ninguna política de RLS existente.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columna nueva: admin dueño de un manager
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES public.profiles(id);

-- 2. RPC nueva — recibe las mismas filas que ya arma el excel (con dos
--    campos nuevos: managerEmail, adminEmail) y por cada una:
--      1. resuelve el manager por email, upsert en creator_assignments
--         (mismo shape que admin_assign_creator, pero en bulk)
--      2. si vino adminEmail, resuelve el admin por email y actualiza
--         profiles.admin_id de ESE manager
--    No aborta toda la carga si una fila no resuelve — cuenta cuántas
--    quedaron sin asignar y las devuelve, para mostrarlas en el toast.
CREATE OR REPLACE FUNCTION public.admin_bulk_assign_from_excel(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    r JSONB;
    v_username TEXT;
    v_manager_email TEXT;
    v_admin_email TEXT;
    v_manager_id UUID;
    v_admin_id UUID;
    v_assigned INTEGER := 0;
    v_admin_linked INTEGER := 0;
    v_manager_not_found INTEGER := 0;
    v_admin_not_found INTEGER := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Solo el admin puede asignar equipos desde el excel.';
    END IF;

    FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
        v_username := btrim(coalesce(r->>'username', ''));
        v_manager_email := lower(btrim(coalesce(r->>'managerEmail', '')));
        v_admin_email := lower(btrim(coalesce(r->>'adminEmail', '')));

        IF v_username = '' OR v_manager_email = '' THEN CONTINUE; END IF;

        SELECT id INTO v_manager_id FROM public.profiles
         WHERE lower(email::text) = v_manager_email AND role = 'manager';

        IF v_manager_id IS NULL THEN
            v_manager_not_found := v_manager_not_found + 1;
            CONTINUE;
        END IF;

        INSERT INTO public.creator_assignments (username, manager_id, assigned_by, assigned_via)
        VALUES (v_username::CITEXT, v_manager_id, auth.uid(), 'admin')
        ON CONFLICT (username) DO UPDATE
           SET manager_id = EXCLUDED.manager_id, assigned_by = EXCLUDED.assigned_by,
               assigned_via = 'admin', updated_at = now();

        UPDATE public.profiles SET manager_id = v_manager_id, updated_at = now()
         WHERE tiktok_username = v_username::CITEXT AND role = 'creator';

        v_assigned := v_assigned + 1;

        IF v_admin_email <> '' THEN
            SELECT id INTO v_admin_id FROM public.profiles
             WHERE lower(email::text) = v_admin_email AND role = 'admin';

            IF v_admin_id IS NULL THEN
                v_admin_not_found := v_admin_not_found + 1;
            ELSE
                UPDATE public.profiles SET admin_id = v_admin_id, updated_at = now()
                 WHERE id = v_manager_id AND (admin_id IS DISTINCT FROM v_admin_id);
                v_admin_linked := v_admin_linked + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'assigned', v_assigned, 'admin_linked', v_admin_linked,
        'manager_not_found', v_manager_not_found, 'admin_not_found', v_admin_not_found
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_assign_from_excel(JSONB) TO authenticated;
