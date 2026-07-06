-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPIEZA DE RENDIMIENTO RLS + ÍNDICE DUPLICADO
-- Ejecutar en Supabase → SQL Editor. Idempotente (DROP POLICY IF EXISTS antes
-- de cada CREATE), seguro de re-ejecutar.
--
-- Qué hace:
--   1. Reemplaza `auth.uid()` suelto por `(select auth.uid())` en cada política
--      RLS que lo usa — evita que Postgres lo re-evalúe fila por fila (el
--      "initplan" pasa a calcularse una sola vez por consulta). No cambia a
--      quién le permite ver o escribir qué, solo cómo lo calcula.
--   2. Elimina políticas duplicadas reales dejadas de versiones anteriores:
--      agency_content (2 de escritura admin + 1 de lectura redundante) y
--      notifications (3 copias de la misma política de insertar + 3 copias
--      de la misma de leer).
--   3. Borra el índice `idx_cm_tiktok_id`, idéntico a `idx_creator_metrics_tiktok_id`.
--
-- Qué NO toca (a propósito):
--   - profiles.manager_id: sigue en uso por la política profiles_select_manager,
--     no es limpieza segura todavía (ver nota en el chat).
--   - El acceso amplio de creator_metrics (metrics_select) — decisión de
--     producto pendiente, no una política a "optimizar" sin más.
--   - Las políticas que ya usan is_admin()/current_user_role()/
--     current_user_manager_id() — esas funciones ya tienen su propio
--     search_path fijo y no las marca el linter de rendimiento.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Índice duplicado
-- ═══════════════════════════════════════════════════════════════════════════
drop index if exists public.idx_cm_tiktok_id;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) agency_content — 2 políticas de escritura admin duplicadas ("admin write"
--    vieja vs. content_admin_write nueva) + lectura redundante (content_select
--    exige estar logueado, pero "public read" ya deja pasar a cualquiera con
--    qual=true, así que content_select nunca aporta nada)
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists "admin write" on public.agency_content;
drop policy if exists "content_select" on public.agency_content;
-- Quedan: content_admin_write (is_admin()) y "public read" (true) — sin cambios.


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) notifications — 3 copias de la misma política de INSERT y 3 de SELECT
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists "Admins y managers envían notificaciones" on public.notifications;
drop policy if exists "Admins y managers pueden enviar notificaciones" on public.notifications;
drop policy if exists "notif_insert" on public.notifications;
create policy "notif_insert" on public.notifications
    for insert
    with check (current_user_role() = any (array['admin','manager']));

drop policy if exists "Usuarios autenticados leen notificaciones" on public.notifications;
drop policy if exists "Usuarios autenticados pueden leer notificaciones" on public.notifications;
drop policy if exists "notif_select" on public.notifications;
create policy "notif_select" on public.notifications
    for select
    using ((select auth.uid()) is not null);
-- notif_admin_delete / notif_admin_mutate usan is_admin(), sin cambios.


-- ═══════════════════════════════════════════════════════════════════════════
-- 4) creator_assignment_events — 2 políticas de SELECT (admin ve todo / manager
--    ve lo propio) se consolidan en una sola (mismo resultado, una sola pasada)
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists "assignment_events_admin_select" on public.creator_assignment_events;
drop policy if exists "assignment_events_own_select" on public.creator_assignment_events;
create policy "assignment_events_select" on public.creator_assignment_events
    for select
    using (
        is_admin()
        or new_manager_id = (select auth.uid())
        or old_manager_id = (select auth.uid())
    );


-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Resto: mismo comportamiento, solo se envuelve auth.uid() en (select ...)
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "creator_assignments_select" on public.creator_assignments;
create policy "creator_assignments_select" on public.creator_assignments
    for select using ((select auth.uid()) is not null);

drop policy if exists "metrics_select" on public.creator_metrics;
create policy "metrics_select" on public.creator_metrics
    for select using ((select auth.uid()) is not null);

drop policy if exists "creators_read_own_metrics" on public.creator_metrics;
create policy "creators_read_own_metrics" on public.creator_metrics
    for select to authenticated
    using (
        lower(username::text) = lower((
            select tiktok_username from public.profiles where id = (select auth.uid())
        )::text)
    );

drop policy if exists "admins_write_whitelist" on public.creator_whitelist;
create policy "admins_write_whitelist" on public.creator_whitelist
    for all
    using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true))
    with check (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true));

drop policy if exists "Admins gestionan eventos" on public.events;
create policy "Admins gestionan eventos" on public.events
    for all to authenticated
    using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true))
    with check (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true));

drop policy if exists "completions_rw" on public.mission_completions;
create policy "completions_rw" on public.mission_completions
    for all
    using (
        creator_id = (select auth.uid())
        or exists (
            select 1 from public.profiles
             where id = (select auth.uid()) and role = any (array['admin','manager'])
        )
    );

drop policy if exists "missions_admin_write" on public.missions;
create policy "missions_admin_write" on public.missions
    for all
    using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

drop policy if exists "pts_admin_all" on public.points_redemptions;
create policy "pts_admin_all" on public.points_redemptions
    for all
    using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

drop policy if exists "pts_creator_insert" on public.points_redemptions;
create policy "pts_creator_insert" on public.points_redemptions
    for insert with check ((select auth.uid()) = user_id);

drop policy if exists "pts_creator_select" on public.points_redemptions;
create policy "pts_creator_select" on public.points_redemptions
    for select using ((select auth.uid()) = user_id);

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
    for select using (id = (select auth.uid()));

drop policy if exists "profiles_select_manager" on public.profiles;
create policy "profiles_select_manager" on public.profiles
    for select using (current_user_role() = 'manager' and manager_id = (select auth.uid()));

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
    for update
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()) and role = current_user_role());

drop policy if exists "push_self_select" on public.push_subscriptions;
create policy "push_self_select" on public.push_subscriptions
    for select using (user_id = (select auth.uid()) or is_admin());

drop policy if exists "push_self_write" on public.push_subscriptions;
create policy "push_self_write" on public.push_subscriptions
    for insert with check (user_id = (select auth.uid()));

drop policy if exists "push_self_delete" on public.push_subscriptions;
create policy "push_self_delete" on public.push_subscriptions
    for delete using (user_id = (select auth.uid()) or is_admin());

drop policy if exists "periods_select" on public.report_periods;
create policy "periods_select" on public.report_periods
    for select using ((select auth.uid()) is not null);

drop policy if exists "Admins gestionan capacitaciones" on public.trainings;
create policy "Admins gestionan capacitaciones" on public.trainings
    for all to authenticated
    using (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true))
    with check (exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true));

drop policy if exists "whatsapp_faq_select" on public.whatsapp_faq;
create policy "whatsapp_faq_select" on public.whatsapp_faq
    for select using ((select auth.uid()) is not null);

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN. Después de correr esto, quedan pendientes (aparte, no automatizados acá):
--   - Decidir el punto 1 (acceso amplio a creator_metrics / ranking).
--   - stefanoxkiller07: asignación huérfana a resolver a mano.
--   - Activar "Leaked password protection" en el dashboard de Auth.
--   - search_path mutable en 5 funciones (set_updated_at, admin_update_joining_data,
--     creator_submit_metrics, set/sync_creator_metrics_days_since_joining) — bajo
--     impacto, queda para otra pasada si querés.
-- ─────────────────────────────────────────────────────────────────────────────
