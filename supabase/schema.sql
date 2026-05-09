-- ============================================================================
--  CREATOR ELEVATE — SUPABASE SCHEMA  (versión 2)
--  Ejecutar UNA SOLA VEZ en el SQL Editor de Supabase tras crear el proyecto.
--
--  Modelo:
--   • Admin sube Excel mensual → upsert en creator_metrics por (period, username).
--   • Cada creador se registra UNA vez: tiktok_username (único) + email + pass.
--   • Login admite username o email.
--   • Datos del mes en curso se "pisan"; al cambiar de mes, los anteriores
--     quedan en histórico automáticamente (un period_id por mes).
--   • Admin asigna manager_id a cada creator desde el panel.
--   • Web Push: push_subscriptions guardadas para enviar notificaciones.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ─────────────────────────────────────────────────────────────────────────────
--  1) PROFILES — vinculados 1:1 con auth.users
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
    id                uuid primary key references auth.users(id) on delete cascade,
    tiktok_username   citext unique,            -- "heyprive" — null para admin/manager si aún no asigna
    email             citext unique,            -- replicado desde auth.users para queries
    role              text not null default 'creator' check (role in ('admin','manager','creator')),
    manager_id        uuid references public.profiles(id) on delete set null,  -- creators → su manager
    display_name      text,
    phone             text,                      -- contacto del manager (a llenar después)
    avatar_url        text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create index if not exists profiles_role_idx       on public.profiles(role);
create index if not exists profiles_manager_id_idx on public.profiles(manager_id);
create index if not exists profiles_tiktok_idx     on public.profiles(tiktok_username);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
--  2) REPORT_PERIODS — un registro por mes cargado
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.report_periods (
    id          uuid primary key default gen_random_uuid(),
    period      date not null unique,           -- siempre día 1 del mes (2026-05-01)
    label       text,                           -- "Mayo 2026"
    uploaded_at timestamptz not null default now(),
    uploaded_by uuid references public.profiles(id)
);

-- ─────────────────────────────────────────────────────────────────────────────
--  3) CREATOR_METRICS — métricas por creador y por período
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.creator_metrics (
    id                    uuid primary key default gen_random_uuid(),
    period_id             uuid not null references public.report_periods(id) on delete cascade,
    username              citext not null,
    
    -- Métricas principales
    diamonds              numeric(14,0) not null default 0,
    diamonds_last_month   numeric(14,0) not null default 0,
    live_duration         text,
    live_seconds          integer not null default 0,
    valid_days            integer not null default 0,
    new_followers         integer not null default 0,
    emisiones_live        integer not null default 0,
    
    -- Partidas y otros modos
    battles               integer not null default 0,
    battle_diamonds       numeric(14,0) not null default 0,
    multi_guest_diamonds  numeric(14,0) not null default 0,
    
    -- Estado y clasificaciones
    status_graduation     text,
    status_rank           text,
    status_active         text,
    group_name            text,
    manager_name_legacy   text,
    
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    unique (period_id, username)
);


create index if not exists creator_metrics_username_idx on public.creator_metrics(username);
create index if not exists creator_metrics_period_idx   on public.creator_metrics(period_id);

drop trigger if exists creator_metrics_set_updated_at on public.creator_metrics;
create trigger creator_metrics_set_updated_at
    before update on public.creator_metrics
    for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
--  4) PUSH SUBSCRIPTIONS — para Web Push (notificaciones)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles(id) on delete cascade,
    endpoint      text not null unique,
    p256dh        text not null,
    auth          text not null,
    user_agent    text,
    created_at    timestamptz not null default now()
);

create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  5) NOTIFICATIONS LOG — historial de notificaciones enviadas
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.notifications (
    id            uuid primary key default gen_random_uuid(),
    sent_by       uuid references public.profiles(id),
    title         text not null,
    body          text not null,
    url           text,
    target_type   text not null check (target_type in ('all','manager_group','user')),
    target_value  text,                           -- manager_id o user_id según target_type
    sent_at       timestamptz not null default now(),
    delivered     integer default 0,
    failed        integer default 0
);

-- ─────────────────────────────────────────────────────────────────────────────
--  6) HELPERS (security definer → bypasean RLS, evitan recursión en políticas)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
    select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_tiktok()
returns citext language sql stable security definer set search_path = public as $$
    select tiktok_username from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  7) TRIGGER: al crear auth.user, crear su row en profiles con la metadata
--     que el cliente envió en signUp(): tiktok_username, role, display_name.
--     Si el tiktok_username ya existe → falla (constraint unique) y se aborta
--     el registro (transaccional vía Supabase).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_tiktok       citext := nullif(trim(new.raw_user_meta_data->>'tiktok_username'), '');
    v_role         text   := coalesce(new.raw_user_meta_data->>'role', 'creator');
    v_display_name text   := coalesce(new.raw_user_meta_data->>'display_name', v_tiktok, split_part(new.email, '@', 1));
begin
    -- Para creators el tiktok_username es obligatorio.
    if v_role = 'creator' and (v_tiktok is null or length(v_tiktok) = 0) then
        raise exception 'tiktok_username es obligatorio para creators';
    end if;

    insert into public.profiles (id, tiktok_username, email, role, display_name)
    values (
        new.id,
        v_tiktok,
        new.email::citext,
        v_role,
        v_display_name
    );
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
--  8) RPCs públicas / RPCs privilegiadas
-- ─────────────────────────────────────────────────────────────────────────────

-- a) Resolver email a partir del tiktok_username (para el login con username).
--    Permitido a anónimos; solo devuelve el email asociado, no datos sensibles.
create or replace function public.resolve_email_for_username(p_username text)
returns text language sql stable security definer set search_path = public as $$
    select email::text from public.profiles
     where tiktok_username = p_username::citext
     limit 1
$$;

revoke all on function public.resolve_email_for_username(text) from public;
grant execute on function public.resolve_email_for_username(text) to anon, authenticated;

-- b) Verificar disponibilidad del tiktok_username antes del registro.
create or replace function public.is_tiktok_username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
    select not exists (
        select 1 from public.profiles
         where tiktok_username = p_username::citext
    )
$$;

revoke all on function public.is_tiktok_username_available(text) from public;
grant execute on function public.is_tiktok_username_available(text) to anon, authenticated;

-- c) Bulk upsert de métricas para un período (desde el panel admin tras
--    parsear el Excel).  Crea/actualiza el período y hace upsert de filas.
create or replace function public.admin_upsert_metrics(
    p_period date,
    p_label text,
    p_rows jsonb
)
returns json language plpgsql security definer set search_path = public as $$
declare
    v_period_id uuid;
    v_inserted integer := 0;
    v_updated integer := 0;
begin
    if not public.is_admin() then raise exception 'Acceso denegado'; end if;

    insert into public.report_periods (period, label, uploaded_by)
    values (p_period, p_label, auth.uid())
    on conflict (period) do update set label = excluded.label
    returning id into v_period_id;

    with payload as (
        select 
            (r->>'username')::citext as username,
            (r->>'diamonds')::numeric as diamonds,
            (r->>'diamondsLastMonth')::numeric as diamonds_last_month,
            (r->>'liveDuration')::text as live_duration,
            (r->>'liveSeconds')::integer as live_seconds,
            (r->>'validDays')::integer as valid_days,
            (r->>'newFollowers')::integer as new_followers,
            (r->>'emisionesLive')::integer as emisiones_live,
            (r->>'battles')::integer as battles,
            (r->>'battleDiamonds')::numeric as battle_diamonds,
            (r->>'multiGuestDiamonds')::numeric as multi_guest_diamonds,
            (r->>'statusGraduation')::text as status_graduation,
            (r->>'statusRank')::text as status_rank,
            (r->>'statusActive')::text as status_active,
            (r->>'groupName')::text as group_name,
            (r->>'manager')::text as manager_name_legacy
        from jsonb_array_elements(p_rows) as r
        where coalesce(trim(r->>'username'), '') <> ''
    ),
    upsert as (
        insert into public.creator_metrics
            (period_id, username, diamonds, diamonds_last_month,
             live_duration, live_seconds, valid_days, new_followers, 
             emisiones_live, battles, battle_diamonds, multi_guest_diamonds,
             status_graduation, status_rank, status_active, group_name, manager_name_legacy)
        select v_period_id, username, diamonds, diamonds_last_month,
               live_duration, live_seconds, valid_days, new_followers,
               emisiones_live, battles, battle_diamonds, multi_guest_diamonds,
               status_graduation, status_rank, status_active, group_name, manager_name_legacy
          from payload
        on conflict (period_id, username) do update
           set diamonds            = excluded.diamonds,
               diamonds_last_month = excluded.diamonds_last_month,
               live_duration       = excluded.live_duration,
               live_seconds        = excluded.live_seconds,
               valid_days          = excluded.valid_days,
               new_followers       = excluded.new_followers,
               emisiones_live      = excluded.emisiones_live,
               battles             = excluded.battles,
               battle_diamonds     = excluded.battle_diamonds,
               multi_guest_diamonds = excluded.multi_guest_diamonds,
               status_graduation   = excluded.status_graduation,
               status_rank         = excluded.status_rank,
               status_active       = excluded.status_active,
               group_name          = excluded.group_name,
               manager_name_legacy = coalesce(excluded.manager_name_legacy, creator_metrics.manager_name_legacy),
               updated_at          = now()
        returning (xmax = 0) as inserted
    )
    select sum(case when inserted then 1 else 0 end), sum(case when inserted then 0 else 1 end)
      into v_inserted, v_updated from upsert;

    return json_build_object('period_id', v_period_id, 'inserted', v_inserted, 'updated', v_updated);
end $$;


revoke all on function public.admin_upsert_metrics(date, text, jsonb) from public;
grant execute on function public.admin_upsert_metrics(date, text, jsonb) to authenticated;

-- d) Asignar manager a un creator (admin only).
create or replace function public.admin_assign_manager(
    p_creator_id uuid,
    p_manager_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.is_admin() then
        raise exception 'Solo el admin puede asignar managers';
    end if;
    if p_manager_id is not null and not exists (
        select 1 from public.profiles where id = p_manager_id and role = 'manager'
    ) then
        raise exception 'El usuario destino no es un manager';
    end if;
    update public.profiles
       set manager_id = p_manager_id, updated_at = now()
     where id = p_creator_id and role = 'creator';
end $$;

revoke all on function public.admin_assign_manager(uuid, uuid) from public;
grant execute on function public.admin_assign_manager(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  9) VISTAS — período activo y métricas vigentes
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.latest_period as
    select * from public.report_periods order by period desc limit 1;

create or replace view public.latest_metrics as
    select cm.*
      from public.creator_metrics cm
      join public.latest_period lp on lp.id = cm.period_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) RLS — POLÍTICAS DE ACCESO
--
--  Filosofía:
--   • Lectura: cualquier usuario autenticado puede leer perfiles, períodos y
--     métricas (es una app interna; usaremos el frontend para filtrar vistas).
--     Los anónimos solo pueden invocar las RPCs específicas (resolve_email,
--     is_tiktok_username_available).
--   • Escritura: solo admin (a través de RPCs security-definer o policies).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles            enable row level security;
alter table public.report_periods      enable row level security;
alter table public.creator_metrics     enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.notifications       enable row level security;

-- ─── profiles ───────────────────────────────────────────────────────────────
drop policy if exists "profiles_select"        on public.profiles;
drop policy if exists "profiles_self_update"   on public.profiles;
drop policy if exists "profiles_admin_write"   on public.profiles;
drop policy if exists "profiles_admin_update"  on public.profiles;
drop policy if exists "profiles_admin_delete"  on public.profiles;

create policy "profiles_select" on public.profiles
    for select using (auth.uid() is not null);

-- Cada usuario puede actualizar su propio perfil (display_name, phone, avatar)
create policy "profiles_self_update" on public.profiles
    for update using (id = auth.uid())
    with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- Admin: control total
create policy "profiles_admin_update" on public.profiles
    for update using (public.is_admin());
create policy "profiles_admin_delete" on public.profiles
    for delete using (public.is_admin());

-- ─── report_periods ────────────────────────────────────────────────────────
drop policy if exists "periods_select"       on public.report_periods;
drop policy if exists "periods_admin_write"  on public.report_periods;
create policy "periods_select" on public.report_periods
    for select using (auth.uid() is not null);
create policy "periods_admin_write" on public.report_periods
    for all using (public.is_admin()) with check (public.is_admin());

-- ─── creator_metrics ───────────────────────────────────────────────────────
drop policy if exists "metrics_select"       on public.creator_metrics;
drop policy if exists "metrics_admin_write"  on public.creator_metrics;
create policy "metrics_select" on public.creator_metrics
    for select using (auth.uid() is not null);
create policy "metrics_admin_write" on public.creator_metrics
    for all using (public.is_admin()) with check (public.is_admin());

-- ─── push_subscriptions ───────────────────────────────────────────────────
drop policy if exists "push_self_select" on public.push_subscriptions;
drop policy if exists "push_self_write"  on public.push_subscriptions;
drop policy if exists "push_self_delete" on public.push_subscriptions;
drop policy if exists "push_admin_select" on public.push_subscriptions;

create policy "push_self_select" on public.push_subscriptions
    for select using (user_id = auth.uid() or public.is_admin());
create policy "push_self_write" on public.push_subscriptions
    for insert with check (user_id = auth.uid());
create policy "push_self_delete" on public.push_subscriptions
    for delete using (user_id = auth.uid() or public.is_admin());

-- ─── notifications ─────────────────────────────────────────────────────────
drop policy if exists "notif_select"        on public.notifications;
drop policy if exists "notif_admin_write"   on public.notifications;
create policy "notif_select" on public.notifications
    for select using (public.is_admin());
create policy "notif_admin_write" on public.notifications
    for all using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 11) BOOTSTRAP — promueve un user a admin por email (correr una sola vez)
--     Uso (en SQL editor, después de que el admin se haya registrado):
--       update public.profiles set role = 'admin'
--          where email = 'tucorreo@ejemplo.com';
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================================================================
--  FIN DEL ESQUEMA
-- ============================================================================
