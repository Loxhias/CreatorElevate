-- ─────────────────────────────────────────────────────────────────────────────
-- ASIGNACIONES DE CREADORES — FUENTE ÚNICA DE VERDAD + AUTO-SOLICITUD DE MANAGER
-- Ejecutar en Supabase → SQL Editor
-- Idempotente: seguro de re-ejecutar (CREATE ... IF NOT EXISTS / CREATE OR REPLACE).
--
-- Reemplaza los dos mecanismos viejos e inconsistentes de asignación
-- manager↔creador:
--   • profiles.manager_id + admin_assign_manager()  → validado pero sin UI real.
--   • creator_metrics.manager_id (drift, sin migración) → el que usa hoy el admin,
--     escrito con UPDATE directo sin validación ni RPC.
--
-- Este script:
--   1. Crea creator_assignments (estado actual) + creator_assignment_events
--      (auditoría append-only, poblada solo por trigger).
--   2. Crea los RPCs de asignación (admin siempre gana; manager puede
--      auto-asignarse un creador libre al instante, bloqueado si ya está tomado).
--   3. Activa RLS: toda escritura pasa exclusivamente por los RPCs.
--   4. Migra (backfill) las asignaciones existentes desde ambos mecanismos
--      viejos, dejando en evidencia — sin resolver a ciegas — cualquier
--      conflicto o referencia huérfana para revisión manual del admin.
--
-- IMPORTANTE — este script NO toca profiles.manager_id ni creator_metrics.manager_id
-- (se mantienen intactos como red de seguridad durante la transición). Su
-- eliminación se hace en un script de limpieza posterior y separado, una vez
-- verificado que todo funciona correctamente con la tabla nueva.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) TABLAS
-- ═══════════════════════════════════════════════════════════════════════════

-- 1.1) creator_assignments — una fila por creador actualmente asignado.
--      Clave por username (citext), no por profiles.id: la mayoría de los
--      creadores cargados desde el Excel mensual no tienen cuenta registrada,
--      y la asignación debe seguir funcionando igual para ellos.
CREATE TABLE IF NOT EXISTS public.creator_assignments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username     CITEXT NOT NULL UNIQUE,
    manager_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    assigned_by  UUID REFERENCES public.profiles(id),
    assigned_via TEXT NOT NULL CHECK (assigned_via IN ('admin', 'self_request')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.creator_assignments IS
    'Fuente única de verdad de a qué manager pertenece cada creador (por username). Solo se escribe vía RPC — ver sección 2 de ASIGNACIONES_SQL.sql.';

CREATE INDEX IF NOT EXISTS creator_assignments_manager_idx ON public.creator_assignments(manager_id);

DROP TRIGGER IF EXISTS creator_assignments_set_updated_at ON public.creator_assignments;
CREATE TRIGGER creator_assignments_set_updated_at
    BEFORE UPDATE ON public.creator_assignments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 1.2) creator_assignment_events — auditoría append-only, poblada solo por trigger.
CREATE TABLE IF NOT EXISTS public.creator_assignment_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username       CITEXT NOT NULL,
    event_type     TEXT NOT NULL CHECK (event_type IN ('assigned', 'reassigned', 'unassigned', 'backfill_conflict')),
    old_manager_id UUID REFERENCES public.profiles(id),
    new_manager_id UUID REFERENCES public.profiles(id),
    actor_id       UUID REFERENCES public.profiles(id),
    actor_role     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.creator_assignment_events IS
    'Historial append-only de cambios de asignación. Se escribe únicamente vía trigger (log_creator_assignment_change) — nunca a mano.';

CREATE INDEX IF NOT EXISTS creator_assignment_events_username_idx
    ON public.creator_assignment_events(username, created_at DESC);
CREATE INDEX IF NOT EXISTS creator_assignment_events_manager_idx
    ON public.creator_assignment_events(new_manager_id, created_at DESC);

-- 1.3) Trigger de auditoría — cualquier INSERT/UPDATE/DELETE en creator_assignments
--      queda registrado automáticamente, sin necesidad de logging manual en los RPCs.
CREATE OR REPLACE FUNCTION public.log_creator_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_role TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_actor_role := CASE WHEN NEW.assigned_via = 'self_request' THEN 'self_request' ELSE 'admin' END;
        INSERT INTO public.creator_assignment_events
            (username, event_type, old_manager_id, new_manager_id, actor_id, actor_role)
        VALUES
            (NEW.username, 'assigned', NULL, NEW.manager_id, auth.uid(), v_actor_role);
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.manager_id IS DISTINCT FROM NEW.manager_id THEN
            v_actor_role := CASE WHEN NEW.assigned_via = 'self_request' THEN 'self_request' ELSE 'admin' END;
            INSERT INTO public.creator_assignment_events
                (username, event_type, old_manager_id, new_manager_id, actor_id, actor_role)
            VALUES
                (NEW.username, 'reassigned', OLD.manager_id, NEW.manager_id, auth.uid(), v_actor_role);
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.creator_assignment_events
            (username, event_type, old_manager_id, new_manager_id, actor_id, actor_role)
        VALUES
            (OLD.username, 'unassigned', OLD.manager_id, NULL, auth.uid(), 'admin');
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS creator_assignments_log_change ON public.creator_assignments;
CREATE TRIGGER creator_assignments_log_change
    AFTER INSERT OR UPDATE OR DELETE ON public.creator_assignments
    FOR EACH ROW EXECUTE FUNCTION public.log_creator_assignment_change();


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) RPCs — todas las escrituras pasan por acá (SECURITY DEFINER)
-- ═══════════════════════════════════════════════════════════════════════════

-- 2.1) admin_assign_creator — el admin asigna o reasigna; siempre gana,
--      sin bloqueo aunque el creador ya tenga otro manager.
CREATE OR REPLACE FUNCTION public.admin_assign_creator(
    p_username   TEXT,
    p_manager_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_username TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Solo el admin puede asignar creadores.';
    END IF;

    v_username := btrim(p_username);
    IF v_username LIKE '@%' THEN
        v_username := substring(v_username FROM 2);
    END IF;
    IF v_username IS NULL OR v_username = '' THEN
        RAISE EXCEPTION 'El nombre de usuario no puede estar vacío.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_manager_id AND role = 'manager'
    ) THEN
        RAISE EXCEPTION 'El usuario destino no es un manager.';
    END IF;

    INSERT INTO public.creator_assignments (username, manager_id, assigned_by, assigned_via)
    VALUES (v_username::CITEXT, p_manager_id, auth.uid(), 'admin')
    ON CONFLICT (username) DO UPDATE
       SET manager_id   = EXCLUDED.manager_id,
           assigned_by  = EXCLUDED.assigned_by,
           assigned_via = 'admin',
           updated_at   = now();

    -- Sincronización best-effort: si el creador tiene cuenta registrada, se
    -- mantiene profiles.manager_id al día como columna de conveniencia (no
    -- autoritativa) para no romper consumidores que aún la leen.
    UPDATE public.profiles
       SET manager_id = p_manager_id, updated_at = now()
     WHERE tiktok_username = v_username::CITEXT AND role = 'creator';

    RETURN jsonb_build_object('username', v_username, 'manager_id', p_manager_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_creator(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_creator(TEXT, UUID) TO authenticated;


-- 2.2) admin_unassign_creator — el admin libera un creador. Idempotente.
CREATE OR REPLACE FUNCTION public.admin_unassign_creator(p_username TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_username TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Solo el admin puede desvincular creadores.';
    END IF;

    v_username := btrim(p_username);
    IF v_username LIKE '@%' THEN
        v_username := substring(v_username FROM 2);
    END IF;

    DELETE FROM public.creator_assignments WHERE username = v_username::CITEXT;

    UPDATE public.profiles
       SET manager_id = NULL, updated_at = now()
     WHERE tiktok_username = v_username::CITEXT AND role = 'creator';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unassign_creator(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unassign_creator(TEXT) TO authenticated;


-- 2.3) manager_lookup_creator — previsualización de solo lectura, sin efectos
--      secundarios. La usa el manager antes de confirmar su solicitud.
CREATE OR REPLACE FUNCTION public.manager_lookup_creator(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_username         TEXT;
    v_exists_metrics   BOOLEAN;
    v_exists_profile   BOOLEAN;
    v_exists_whitelist BOOLEAN;
    v_diamonds         NUMERIC;
    v_valid_days       INTEGER;
    v_manager_id       UUID;
    v_manager_name     TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autenticado.';
    END IF;

    v_username := btrim(p_username);
    IF v_username LIKE '@%' THEN
        v_username := substring(v_username FROM 2);
    END IF;
    IF v_username IS NULL OR v_username = '' THEN
        RAISE EXCEPTION 'El nombre de usuario no puede estar vacío.';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.creator_metrics WHERE username = v_username::CITEXT)
      INTO v_exists_metrics;
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE tiktok_username = v_username::CITEXT AND role = 'creator')
      INTO v_exists_profile;
    SELECT EXISTS (SELECT 1 FROM public.creator_whitelist WHERE tiktok_username = lower(v_username))
      INTO v_exists_whitelist;

    SELECT cm.diamonds, cm.valid_days
      INTO v_diamonds, v_valid_days
      FROM public.creator_metrics cm
      JOIN public.latest_period lp ON lp.id = cm.period_id
     WHERE cm.username = v_username::CITEXT
     LIMIT 1;

    SELECT ca.manager_id, COALESCE(p.display_name, p.email)
      INTO v_manager_id, v_manager_name
      FROM public.creator_assignments ca
      LEFT JOIN public.profiles p ON p.id = ca.manager_id
     WHERE ca.username = v_username::CITEXT;

    RETURN jsonb_build_object(
        'username',             v_username,
        'exists_in_system',     (v_exists_metrics OR v_exists_profile OR v_exists_whitelist),
        'latest_diamonds',      v_diamonds,
        'latest_valid_days',    v_valid_days,
        'current_manager_id',   v_manager_id,
        'current_manager_name', v_manager_name,
        'already_assigned',     (v_manager_id IS NOT NULL)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.manager_lookup_creator(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_lookup_creator(TEXT) TO authenticated;


-- 2.4) manager_self_assign_creator — LA CAPACIDAD NUEVA: el manager escribe un
--      username y queda asignado al instante, sin intervención del admin.
--      Bloqueado de inmediato (nunca cola de aprobación) si ya tiene otro manager.
--      Sin límite de creadores por manager.
CREATE OR REPLACE FUNCTION public.manager_self_assign_creator(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id   UUID := auth.uid();
    v_caller_role TEXT;
    v_username    TEXT;
    v_exists      BOOLEAN;
    v_owner_id    UUID;
    v_inserted_id UUID;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role IS DISTINCT FROM 'manager' THEN
        RAISE EXCEPTION 'Solo los managers pueden auto-asignarse creadores.';
    END IF;

    v_username := btrim(p_username);
    IF v_username LIKE '@%' THEN
        v_username := substring(v_username FROM 2);
    END IF;
    IF v_username IS NULL OR v_username = '' THEN
        RAISE EXCEPTION 'El nombre de usuario no puede estar vacío.';
    END IF;

    -- Validación de existencia en el SERVIDOR (no solo en la previsualización de
    -- la UI) — evita que se "reserven" usernames inventados o mal escritos.
    SELECT EXISTS (
        SELECT 1 FROM public.creator_metrics WHERE username = v_username::CITEXT
        UNION ALL
        SELECT 1 FROM public.profiles WHERE tiktok_username = v_username::CITEXT AND role = 'creator'
        UNION ALL
        SELECT 1 FROM public.creator_whitelist WHERE tiktok_username = lower(v_username)
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Ese creador no existe en el sistema. Verificá el nombre de usuario.';
    END IF;

    -- INSERT ... ON CONFLICT DO NOTHING en vez de "SELECT y después INSERT":
    -- evita una condición de carrera si dos managers piden el mismo username
    -- al mismo tiempo.
    INSERT INTO public.creator_assignments (username, manager_id, assigned_by, assigned_via)
    VALUES (v_username::CITEXT, v_caller_id, v_caller_id, 'self_request')
    ON CONFLICT (username) DO NOTHING
    RETURNING manager_id INTO v_inserted_id;

    IF v_inserted_id IS NOT NULL THEN
        UPDATE public.profiles
           SET manager_id = v_caller_id, updated_at = now()
         WHERE tiktok_username = v_username::CITEXT AND role = 'creator';

        RETURN jsonb_build_object('ok', true, 'username', v_username, 'already_owned', false);
    END IF;

    -- Ya existía una fila: ver de quién es.
    SELECT manager_id INTO v_owner_id
      FROM public.creator_assignments
     WHERE username = v_username::CITEXT;

    IF v_owner_id = v_caller_id THEN
        -- Ya era suyo: éxito idempotente, no error (ej. doble clic).
        RETURN jsonb_build_object('ok', true, 'username', v_username, 'already_owned', true);
    END IF;

    RAISE EXCEPTION 'Ese creador ya tiene un manager asignado. Contactá al admin si creés que es un error.';
END;
$$;

REVOKE ALL ON FUNCTION public.manager_self_assign_creator(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_self_assign_creator(TEXT) TO authenticated;


-- 2.5) admin_demote_manager_cleanup — limpieza en cascada cuando se le quita el
--      rol de manager a alguien (antes esto dejaba asignaciones huérfanas).
CREATE OR REPLACE FUNCTION public.admin_demote_manager_cleanup(p_manager_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Solo el admin puede ejecutar esta limpieza.';
    END IF;

    SELECT count(*) INTO v_count FROM public.creator_assignments WHERE manager_id = p_manager_id;

    DELETE FROM public.creator_assignments WHERE manager_id = p_manager_id;

    UPDATE public.profiles
       SET manager_id = NULL, updated_at = now()
     WHERE manager_id = p_manager_id;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_demote_manager_cleanup(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_demote_manager_cleanup(UUID) TO authenticated;


-- 2.6) admin_list_assignment_history — historial/auditoría. El admin ve todo;
--      un manager solo puede pedir su propio historial (p_manager_id = su id).
CREATE OR REPLACE FUNCTION public.admin_list_assignment_history(
    p_username   TEXT DEFAULT NULL,
    p_manager_id UUID DEFAULT NULL,
    p_limit      INTEGER DEFAULT 100
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        IF p_manager_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'No autorizado.';
        END IF;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result FROM (
        SELECT
            e.id, e.username, e.event_type,
            e.old_manager_id, COALESCE(op.display_name, op.email) AS old_manager_name,
            e.new_manager_id, COALESCE(np.display_name, np.email) AS new_manager_name,
            e.actor_id, COALESCE(ap.display_name, ap.email) AS actor_name,
            e.actor_role, e.created_at
        FROM public.creator_assignment_events e
        LEFT JOIN public.profiles op ON op.id = e.old_manager_id
        LEFT JOIN public.profiles np ON np.id = e.new_manager_id
        LEFT JOIN public.profiles ap ON ap.id = e.actor_id
        WHERE (p_username IS NULL OR e.username = p_username::CITEXT)
          AND (p_manager_id IS NULL OR e.new_manager_id = p_manager_id OR e.old_manager_id = p_manager_id)
        ORDER BY e.created_at DESC
        LIMIT p_limit
    ) t;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_assignment_history(TEXT, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_assignment_history(TEXT, UUID, INTEGER) TO authenticated;


-- 2.7) manager_list_my_creators — reemplaza el merge cliente-side de los dos
--      mecanismos viejos. Corrige el bug de mensajería (creadores asignados
--      solo por el mecanismo viejo "B" eran invisibles para el broadcast).
CREATE OR REPLACE FUNCTION public.manager_list_my_creators(p_manager_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_manager_id UUID := COALESCE(p_manager_id, auth.uid());
    v_result     JSONB;
BEGIN
    IF v_manager_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result FROM (
        SELECT
            ca.username,
            p.id AS profile_id,
            p.display_name,
            p.email
        FROM public.creator_assignments ca
        LEFT JOIN public.profiles p ON p.tiktok_username = ca.username AND p.role = 'creator'
        WHERE ca.manager_id = v_manager_id
        ORDER BY ca.username
    ) t;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.manager_list_my_creators(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_list_my_creators(UUID) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) RLS — toda escritura pasa exclusivamente por los RPCs de arriba
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.creator_assignments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_assignment_events   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_assignments_select" ON public.creator_assignments;
CREATE POLICY "creator_assignments_select" ON public.creator_assignments
    FOR SELECT USING (auth.uid() IS NOT NULL);
-- Sin políticas de INSERT/UPDATE/DELETE a propósito: la única forma de escribir
-- esta tabla es a través de los RPCs SECURITY DEFINER de la sección 2.

DROP POLICY IF EXISTS "assignment_events_admin_select" ON public.creator_assignment_events;
CREATE POLICY "assignment_events_admin_select" ON public.creator_assignment_events
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "assignment_events_own_select" ON public.creator_assignment_events;
CREATE POLICY "assignment_events_own_select" ON public.creator_assignment_events
    FOR SELECT USING (new_manager_id = auth.uid() OR old_manager_id = auth.uid());
-- Sin política de escritura: esta tabla solo se llena vía trigger.


-- ═══════════════════════════════════════════════════════════════════════════
-- 4) BACKFILL — migrar asignaciones existentes desde los dos mecanismos viejos
-- ═══════════════════════════════════════════════════════════════════════════

-- Working set temporal (se descarta al final de este script).
CREATE TEMP TABLE _backfill_assignments AS
WITH mech_a AS (
    -- Mecanismo A: profiles.manager_id (solo creadores con cuenta)
    SELECT tiktok_username AS username, manager_id
      FROM public.profiles
     WHERE role = 'creator' AND manager_id IS NOT NULL AND tiktok_username IS NOT NULL
),
mech_b AS (
    -- Mecanismo B: creator_metrics.manager_id (el que usa hoy la UI del admin);
    -- se toma el valor más reciente por updated_at para cada username.
    SELECT DISTINCT ON (username) username, manager_id
      FROM public.creator_metrics
     WHERE manager_id IS NOT NULL
     ORDER BY username, updated_at DESC
),
all_usernames AS (
    SELECT username FROM mech_a
    UNION
    SELECT username FROM mech_b
)
SELECT
    u.username,
    a.manager_id AS manager_a,
    b.manager_id AS manager_b
FROM all_usernames u
LEFT JOIN mech_a a ON a.username = u.username
LEFT JOIN mech_b b ON b.username = u.username;

-- 4.1) Casos resolubles: coinciden, o solo un mecanismo tiene valor, y ese
--      manager sigue teniendo el rol 'manager' hoy.
INSERT INTO public.creator_assignments (username, manager_id, assigned_by, assigned_via)
SELECT bf.username, COALESCE(bf.manager_a, bf.manager_b), NULL, 'admin'
  FROM _backfill_assignments bf
  JOIN public.profiles pr ON pr.id = COALESCE(bf.manager_a, bf.manager_b) AND pr.role = 'manager'
 WHERE (bf.manager_a IS NULL OR bf.manager_b IS NULL OR bf.manager_a = bf.manager_b)
ON CONFLICT (username) DO NOTHING;

-- 4.2) Conflictos: los dos mecanismos discrepan → NO se elige uno a ciegas,
--      queda sin asignar y se deja registrado para revisión manual del admin.
--      Guardado contra re-ejecución: no duplica el evento si ya se registró antes.
INSERT INTO public.creator_assignment_events
    (username, event_type, old_manager_id, new_manager_id, actor_id, actor_role)
SELECT bf.username, 'backfill_conflict', bf.manager_a, bf.manager_b, NULL, 'system_backfill'
  FROM _backfill_assignments bf
 WHERE bf.manager_a IS NOT NULL AND bf.manager_b IS NOT NULL AND bf.manager_a <> bf.manager_b
   AND NOT EXISTS (
       SELECT 1 FROM public.creator_assignment_events ev
        WHERE ev.username = bf.username AND ev.event_type = 'backfill_conflict'
   );

-- 4.3) Referencias huérfanas: el manager resuelto ya no tiene rol 'manager'
--      (ej. fue degradado y el sistema viejo nunca limpió la referencia) →
--      tampoco se asigna, queda registrado para revisión manual.
--      Mismo guardado contra re-ejecución que 4.2.
INSERT INTO public.creator_assignment_events
    (username, event_type, old_manager_id, new_manager_id, actor_id, actor_role)
SELECT bf.username, 'backfill_conflict', COALESCE(bf.manager_a, bf.manager_b), NULL, NULL, 'system_backfill'
  FROM _backfill_assignments bf
 WHERE (bf.manager_a IS NULL OR bf.manager_b IS NULL OR bf.manager_a = bf.manager_b)
   AND NOT EXISTS (
       SELECT 1 FROM public.profiles pr
        WHERE pr.id = COALESCE(bf.manager_a, bf.manager_b) AND pr.role = 'manager'
   )
   AND NOT EXISTS (
       SELECT 1 FROM public.creator_assignment_events ev
        WHERE ev.username = bf.username AND ev.event_type = 'backfill_conflict'
   );

DROP TABLE _backfill_assignments;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5) ÚLTIMO PASO — revisar manualmente los conflictos/huérfanos del backfill.
--    Esto es lo último que imprime el SQL Editor al correr el script.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
    e.username,
    e.event_type,
    e.old_manager_id,
    COALESCE(op.display_name, op.email) AS manager_segun_perfiles,
    e.new_manager_id,
    COALESCE(np.display_name, np.email) AS manager_segun_metricas,
    e.created_at
FROM public.creator_assignment_events e
LEFT JOIN public.profiles op ON op.id = e.old_manager_id
LEFT JOIN public.profiles np ON np.id = e.new_manager_id
WHERE e.event_type = 'backfill_conflict'
ORDER BY e.username;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN — profiles.manager_id y creator_metrics.manager_id quedan intactos.
-- No ejecutar ninguna limpieza de esas columnas hasta verificar en producción
-- que este sistema nuevo funciona correctamente (ver plan de rollout).
-- ─────────────────────────────────────────────────────────────────────────────
