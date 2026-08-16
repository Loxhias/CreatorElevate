/**
 * Capa de datos (DAL) — única fuente de acceso a Supabase desde la UI.
 * Si Supabase no está configurado, devuelve datos del fallback (preloadedData).
 */
import { supabase, isSupabaseConfigured } from './supabase.js';
import { preloadedData } from './data.js';

// Elimina surrogates solitarios de UTF-16 que producen JSON inválido en UTF-8
const san = (s) => typeof s === 'string' ? s.replace(/[\uD800-\uDFFF]/g, '') : s;

// Sanitiza recursivamente todo el objeto/array (cubre emoji de Excel vía SheetJS)
function sanDeep(v) {
    if (typeof v === 'string')  return san(v);
    if (Array.isArray(v))       return v.map(sanDeep);
    if (v !== null && typeof v === 'object') {
        const out = {};
        for (const [k, val] of Object.entries(v)) out[k] = sanDeep(val);
        return out;
    }
    return v;
}

// ────────────────────────────────────────────────────────────────────────────
//  AUTH
// ────────────────────────────────────────────────────────────────────────────

export const auth = {
    async getSession() {
        if (!isSupabaseConfigured) return null;
        const { data } = await supabase.auth.getSession();
        return data.session;
    },

    async getProfile(userId = null) {
        if (!isSupabaseConfigured) return null;
        let id = userId;
        if (!id) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;
            id = user.id;
        }
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data;
    },



    onAuthChange(handler) {
        if (!isSupabaseConfigured) return { unsubscribe() {} };
        const { data } = supabase.auth.onAuthStateChange((_evt, session) => handler(session));
        return data.subscription;
    },

    /**
     * Login admite username de TikTok o email.
     * - si contiene '@'  → email directo
     * - si no            → resuelve via RPC resolve_email_for_username
     */
    async signIn(identifier, password) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        let email = String(identifier || '').trim();
        if (!email) throw new Error('Ingresa tu usuario o email.');

        if (!email.includes('@')) {
            const { data, error } = await supabase.rpc('resolve_email_for_username', {
                p_username: email,
            });
            if (error) throw error;
            if (!data) throw new Error('No existe una cuenta con ese usuario de TikTok.');
            email = data;
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    /** Registro de creator: tiktok_username obligatorio + email + password */
    async signUpCreator({ tiktokUsername, email, password, displayName }) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const username = String(tiktokUsername || '').trim().replace(/^@/, '');
        if (!username)         throw new Error('El usuario de TikTok es obligatorio.');
        if (!/^[a-z0-9._]+$/i.test(username))
            throw new Error('El usuario de TikTok solo puede contener letras, números, "." y "_".');
        if (!email)            throw new Error('El email es obligatorio.');
        if (!password || password.length < 6)
            throw new Error('La contraseña debe tener al menos 6 caracteres.');

        // 1) verificar que el username está en la whitelist de la agencia
        const { data: wl, error: wlErr } = await supabase.rpc('is_creator_whitelisted', { p_username: username });
        if (wlErr) throw wlErr;
        if (!wl?.allowed) {
            throw new Error(wl?.reason === 'abandoned'
                ? 'Tu cuenta no está activa. Contactá al administrador de la agencia.'
                : 'Tu usuario de TikTok no está registrado en la agencia. El administrador debe cargarte en la planilla primero.');
        }

        // 2) verificar disponibilidad del username
        const { data: available, error: checkErr } = await supabase.rpc(
            'is_tiktok_username_available',
            { p_username: username },
        );
        if (checkErr) throw checkErr;
        if (!available) throw new Error('Ese usuario de TikTok ya está registrado.');

        // 3) signUp con metadata; el trigger handle_new_user crea el profile
        const agency = wl?.agency || 'latam';
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    tiktok_username: username,
                    role: 'creator',
                    display_name: displayName || username,
                    agency,
                },
            },
        });
        if (error) throw error;
        return data;
    },

    /** Registro de manager: requiere que un admin haya habilitado el email antes (manager_whitelist). */
    async signUpManager({ email, password, displayName }) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        email = String(email || '').trim().toLowerCase();
        if (!email)    throw new Error('El email es obligatorio.');
        if (!password || password.length < 6)
            throw new Error('La contraseña debe tener al menos 6 caracteres.');

        // Chequeo amigable — la validación real (que no se puede saltear) vive
        // en el trigger handle_new_user() del lado de la base de datos.
        const { data: wl, error: wlErr } = await supabase.rpc('is_manager_whitelisted', { p_email: email });
        if (wlErr) throw wlErr;
        if (!wl?.allowed) {
            throw new Error('Tu email no está habilitado para registrarte como manager. Pedile a un admin que te habilite desde "Gestión de Managers".');
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    role: 'manager',
                    display_name: displayName || email.split('@')[0],
                },
            },
        });
        if (error) throw error;
        return data;
    },

    async signOut() {
        if (!isSupabaseConfigured) return;
        await supabase.auth.signOut();
    },

    async resetPassword(email) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
        });
        if (error) throw error;
    },

    async updatePassword(newPassword) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
    },

    async updateOwnProfile(patch) {
        if (!isSupabaseConfigured) {
            const localProfile = JSON.parse(localStorage.getItem('ce_demo_profile') || '{}');
            const updatedProfile = { ...localProfile, ...patch };
            localStorage.setItem('ce_demo_profile', JSON.stringify(updatedProfile));
            return updatedProfile;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No autenticado.');
        const { data, error } = await supabase
            .from('profiles')
            .update(sanDeep(patch))
            .eq('id', user.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  MÉTRICAS — leer del período activo + utilidades para el panel admin
// ────────────────────────────────────────────────────────────────────────────

function rowFromDb(r) {
    const liveSecs = Number(r.live_seconds || 0);
    const liveDurFallback = liveSecs > 0
        ? `${Math.floor(liveSecs / 3600)}h ${Math.floor((liveSecs % 3600) / 60)}min`
        : '0h';
    return {
        username:           r.username,
        tiktokId:           r.tiktok_id || null,
        diamonds:           Number(r.diamonds || 0),
        diamondsLastMonth:  Number(r.diamonds_last_month || 0),
        liveDuration:       r.live_duration || liveDurFallback,
        liveSeconds:        liveSecs,
        validDays:          Number(r.valid_days || 0),
        newFollowers:       Number(r.new_followers || 0),
        emisionesLive:      Number(r.emisiones_live || 0),
        battles:            Number(r.battles || 0),
        battleDiamonds:     Number(r.battle_diamonds || 0),
        multiGuestDiamonds: Number(r.multi_guest_diamonds || 0),
        statusGraduation:   r.status_graduation,
        statusRank:         r.status_rank,
        statusActive:       r.status_active,
        groupName:          r.group_name,
        manager:            r.manager_name_legacy || null,
        managerId:          r.manager_id || null,
        daysSinceJoining:   r.days_since_joining != null ? Number(r.days_since_joining) : null,
        agency:             r.agency || 'latam',
    };
}

export const metrics = {
    /** Devuelve { period, rows } del período más reciente. */
    async getLatest() {
        if (!isSupabaseConfigured) {
            return { period: null, rows: preloadedData };
        }

        // Consulta directa a las tablas — ordenado por uploaded_at para evitar
        // períodos futuros/vacíos que tengan fecha más reciente sin datos reales
        const { data: period, error: pErr } = await supabase
            .from('report_periods')
            .select('*')
            .order('uploaded_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (pErr) throw pErr;
        if (!period) return { period: null, rows: [] };

        const { data, error } = await supabase
            .from('creator_metrics')
            .select('*')
            .eq('period_id', period.id)
            .order('diamonds', { ascending: false });
        if (error) throw error;

        const rows = data.map(rowFromDb);
        return { period, rows };
    },

    /** Lista de períodos disponibles (admin). */
    async listPeriods() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('report_periods').select('*').order('period', { ascending: false });
        if (error) throw error;
        return data;
    },

    /** Métricas de un período específico. */
    async getByPeriod(periodId) {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('creator_metrics')
            .select('*')
            .eq('period_id', periodId)
            .order('diamonds', { ascending: false });
        if (error) throw error;
        return data.map(rowFromDb);
    },

    // Total de diamantes de TODA la agencia en un período — vía RPC porque,
    // desde RESTRICT_CREATOR_METRICS_SQL.sql, un manager ya no puede leer
    // filas de creator_metrics fuera de su propio equipo (necesario para
    // que "Mis Ganancias" siga calculando bien la comisión de incremento de
    // ingresos, que depende del total real de la agencia, no solo su equipo).
    async agencyTotal(periodId, agency = 'latam') {
        if (!isSupabaseConfigured || !periodId) return null;
        const { data, error } = await supabase.rpc('agency_total_diamonds', {
            p_period_id: periodId, p_agency: agency,
        });
        if (error) throw error;
        return Number(data) || 0;
    },

    /** Bulk upsert (admin) — invoca la RPC. */
    async upsertPeriod(periodDate, label, rows) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const payload = rows.map(r => ({
            username:          san(String(r.username || '').trim().replace(/^@/, '')),
            diamonds:          Number(r.diamonds || 0),
            diamondsLastMonth: Number(r.diamondsLastMonth || 0),
            liveDuration:      san(r.liveDuration || '0s'),
            liveSeconds:       Number(r.liveSeconds || 0),
            validDays:         Number(r.validDays || 0),
            newFollowers:      Number(r.newFollowers || 0),
            emisionesLive:     Number(r.emisionesLive || 0),
            battles:           Number(r.battles || 0),
            battleDiamonds:    Number(r.battleDiamonds || 0),
            multiGuestDiamonds: Number(r.multiGuestDiamonds || 0),
            statusGraduation:  san(r.statusGraduation) || null,
            statusRank:        san(r.statusRank) || null,
            statusActive:      san(r.statusActive) || null,
            groupName:         san(r.groupName) || null,
            manager:           san(r.manager || r.managerName) || null,
            daysSinceJoining:  r.daysSinceJoining != null ? Number(r.daysSinceJoining) : null,
        })).filter(r => r.username);

        const safePayload = sanDeep(payload);

        const { data, error } = await supabase.rpc('admin_upsert_metrics', {
            p_period: periodDate,
            p_label:  san(label),
            p_rows:   safePayload,
        });
        if (error) throw error;

        // Post-upsert: guardar tiktok_id en creator_metrics y sincronizar profiles
        const withId = rows.filter(r => r.creatorId);
        if (withId.length > 0) {
            try {
                const { data: period } = await supabase
                    .from('report_periods').select('id').eq('period', periodDate).maybeSingle();

                if (period?.id) {
                    // 1. Actualizar tiktok_id en creator_metrics (match por username + período)
                    await Promise.all(withId.map(r =>
                        supabase.from('creator_metrics')
                            .update({ tiktok_id: san(String(r.creatorId)) })
                            .eq('period_id', period.id)
                            .ilike('username', r.username)
                    ));
                }

                // 2. Primera vez: asignar tiktok_id al perfil que coincide por username
                await Promise.all(withId.map(r =>
                    supabase.from('profiles')
                        .update({ tiktok_id: san(String(r.creatorId)) })
                        .ilike('tiktok_username', r.username)
                        .is('tiktok_id', null)
                ));

                // 3. Cambio de username: si el tiktok_id ya existe en profiles, actualizar username
                await Promise.all(withId.map(r =>
                    supabase.from('profiles')
                        .update({ tiktok_username: san(r.username) })
                        .eq('tiktok_id', san(String(r.creatorId)))
                        .not('tiktok_username', 'ilike', r.username)
                ));
            } catch (e) {
                console.warn('[upsertPeriod] tiktok_id sync parcialmente fallido:', e.message);
            }
        }

        return data;
    },

    /**
     * Evalúa a los creadores con Magic By Loxhias activo (trialing/active)
     * contra el período recién publicado — mismo patrón que
     * whatsapp.sendCheckins(): se llama después de publicar el Excel, no
     * bloquea ni revierte la publicación si falla (Pages Function
     * "magic-sync-subscriptions"). Ver CLAUDE.md de Magic, "Integración con
     * Creator Elevate".
     */
    async syncMagicSubscriptions(periodDate) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        const response = await fetch('/api/magic-sync-subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ periodDate }),
        });
        let payload = null;
        try { payload = await response.json(); } catch { /* respuesta no-JSON */ }
        if (!response.ok || (payload && payload.success === false)) {
            throw new Error(payload?.error || `Error HTTP ${response.status}`);
        }
        return payload;
    },

    /** Admin: sincroniza la whitelist desde el Excel y desactiva creadores "Abandonó". */
    async syncWhitelist(rows, agency = 'latam') {
        if (!isSupabaseConfigured) return 0;
        const payload = rows
            .map(r => ({
                username:  san(String(r.username || '').trim().replace(/^@/, '').toLowerCase()),
                tiktok_id: r.creatorId ? san(String(r.creatorId)) : null,
                status:    san(r.statusActive || ''),
                join_date: r.joinDate || null,
            }))
            .filter(r => r.username);
        if (!payload.length) return 0;
        const { data, error } = await supabase.rpc('admin_sync_whitelist', {
            p_rows:   sanDeep(payload),
            p_agency: agency,
        });
        if (error) throw error;
        return data;
    },

    /** Admin: sube solo días_desde_incorporación + partidas (NO pisa métricas del creador). */
    async upsertJoiningData(periodDate, label, rows, agency = 'latam') {
        if (!isSupabaseConfigured) throw new Error('Supabase no configurado.');
        const payload = rows
            .map(r => ({
                username:           san(String(r.username || '').trim().replace(/^@/, '')),
                days_since_joining: Number(r.daysSinceJoining || 0),
                battles:            Number(r.battles || 0),
            }))
            .filter(r => r.username);
        if (!payload.length) throw new Error('No se encontraron filas válidas en el archivo.');
        const { data, error } = await supabase.rpc('admin_update_joining_data', {
            p_period_date:  periodDate,
            p_period_label: san(label),
            p_rows:         sanDeep(payload),
            p_agency:       agency,
        });
        if (error) throw error;
        return data;
    },

    /** Creador: envía sus propias métricas para el período actual o uno específico. */
    async submitSelf(validDays, liveHours, diamonds, periodDate = null) {
        if (!isSupabaseConfigured) {
            // Modo Demo: Guardar métricas auto-reportadas en localStorage
            const targetPeriodDate = periodDate || (() => {
                const now = new Date();
                return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            })();
            const demoMetrics = JSON.parse(localStorage.getItem('ce_demo_metrics') || '{}');
            demoMetrics[targetPeriodDate] = {
                valid_days: Number(validDays),
                live_seconds: Math.round(Number(liveHours) * 3600),
                live_duration: `${Math.floor(Number(liveHours))}h ${Math.round((Number(liveHours) % 1) * 60)}min`,
                diamonds: Number(diamonds)
            };
            localStorage.setItem('ce_demo_metrics', JSON.stringify(demoMetrics));
            return { ok: true, period: targetPeriodDate };
        }
        const params = {
            p_valid_days: Number(validDays),
            p_live_hours: Number(liveHours),
            p_diamonds:   Number(diamonds),
        };
        if (periodDate) {
            params.p_period_date = periodDate;
        }
        const { data, error } = await supabase.rpc('creator_submit_metrics', params);
        if (error) throw error;
        return data;
    },

    /** Creador: obtiene sus propias métricas del período actual o uno específico (null si no envió aún). */
    async getMyMetrics(periodDate = null) {
        if (!isSupabaseConfigured) {
            // Modo Demo: Recuperar de localStorage
            const targetPeriodDate = periodDate || (() => {
                const now = new Date();
                return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            })();
            const demoMetrics = JSON.parse(localStorage.getItem('ce_demo_metrics') || '{}');
            return demoMetrics[targetPeriodDate] || null;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        
        const targetPeriodDate = periodDate || (() => {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        })();
        
        const { data: period } = await supabase
            .from('report_periods').select('id').eq('period', targetPeriodDate).maybeSingle();
        if (!period) return null;
        const { data: profile } = await supabase
            .from('profiles').select('tiktok_username').eq('id', user.id).maybeSingle();
        if (!profile?.tiktok_username) return null;
        const { data } = await supabase
            .from('creator_metrics')
            .select('valid_days, live_seconds, live_duration, diamonds')
            .eq('period_id', period.id)
            .ilike('username', profile.tiktok_username)
            .maybeSingle();
        return data || null;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  PROFILES — admin: lista, asignación de manager, cambio de rol
// ────────────────────────────────────────────────────────────────────────────

export const profiles = {
    async listAll() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async updateRoles(userId, roles) {
        const { data, error } = await supabase
            .from('profiles')
            .update({
                is_admin: roles.isAdmin ?? false,
                is_manager: roles.isManager ?? false,
                is_creator: roles.isCreator ?? true,
                role: roles.isAdmin ? 'admin' : (roles.isManager ? 'manager' : 'creator')
            })
            .eq('id', userId)
            .select();
        if (error) throw error;
        return data[0];
    },

    /** Admin: habilita un email para que pueda auto-registrarse como manager (pestaña "Soy manager" del signup). */
    async addManagerWhitelist(email, agency = 'latam') {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { data, error } = await supabase.rpc('admin_add_manager_whitelist', {
            p_email: san(String(email || '').trim().toLowerCase()),
            p_agency: agency,
        });
        if (error) throw error;
        return data;
    },

    async setAgency(userId, agency) {
        const { data, error } = await supabase
            .from('profiles')
            .update({ agency })
            .eq('id', userId)
            .select();
        if (error) throw error;
        return data[0];
    },

    /**
     * Vincula (o desvincula, con username='') el usuario de TikTok propio de
     * un manager, para que vea sus propias métricas como creador (nav
     * "Mis métricas" en main.js, ya condicionado a que este campo exista).
     */
    async setTiktokUsername(userId, username) {
        const clean = san(username || '').trim();
        const { data, error } = await supabase
            .from('profiles')
            .update({ tiktok_username: clean || null })
            .eq('id', userId)
            .select();
        if (error) {
            if (error.code === '23505') throw new Error('Ese usuario de TikTok ya está vinculado a otra cuenta.');
            throw error;
        }
        return data[0];
    },

    async getById(userId) {
        if (!isSupabaseConfigured) return null;
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async searchProfiles(query) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .or(`email.ilike.%${query}%,display_name.ilike.%${query}%,tiktok_username.ilike.%${query}%`)
            .limit(10);
        if (error) throw error;
        return data;
    },

    async listManagers() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('is_manager', true);
        if (error) throw error;
        return data;
    },

    async setRole(userId, role) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase
            .from('profiles')
            .update({ role })
            .eq('id', userId);
        if (error) throw error;
    },

    async setActive(userId, active) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase
            .from('profiles')
            .update({ active })
            .eq('id', userId);
        if (error) throw error;
    },

    // ── Asignación de creadores (fuente única: creator_assignments) ─────────

    async adminAssignCreator(username, managerId) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { data, error } = await supabase.rpc('admin_assign_creator', {
            p_username: username,
            p_manager_id: managerId,
        });
        if (error) throw error;
        return data;
    },

    async adminUnassignCreator(username) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase.rpc('admin_unassign_creator', { p_username: username });
        if (error) throw error;
    },

    // Asigna creador→manager y manager→admin en bloque a partir de las
    // columnas managerEmail/adminEmail del excel mensual (ver ADMIN_TEAM_SQL.sql).
    async bulkAssignFromExcel(rows) {
        if (!isSupabaseConfigured) return { assigned: 0, admin_linked: 0, manager_not_found: 0, admin_not_found: 0 };
        const { data, error } = await supabase.rpc('admin_bulk_assign_from_excel', { p_rows: rows });
        if (error) throw error;
        return data;
    },

    // ── Referentes (creadores que reclutaron a otros creadores) ─────────────
    // Distinto de manager: cobran de forma separada (fórmula a definir),
    // acá solo se administra el flag y el vínculo con quién reclutaron.
    // Ver referentes.sql.

    async setReferente(userId, isReferente) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase
            .from('profiles')
            .update({ is_referente: !!isReferente })
            .eq('id', userId);
        if (error) throw error;
    },

    async listReferrals() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase.from('creator_referrals').select('*');
        if (error) throw error;
        return data;
    },

    async assignReferral(username, referenteId) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { data, error } = await supabase.rpc('admin_assign_referral', {
            p_username: username,
            p_referente_id: referenteId,
        });
        if (error) throw error;
        return data;
    },

    async unassignReferral(username) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase.rpc('admin_unassign_referral', { p_username: username });
        if (error) throw error;
    },

    async lookupCreator(username) {
        if (!isSupabaseConfigured) return null;
        const { data, error } = await supabase.rpc('manager_lookup_creator', { p_username: username });
        if (error) throw error;
        return data;
    },

    async selfAssignCreator(username) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { data, error } = await supabase.rpc('manager_self_assign_creator', { p_username: username });
        if (error) throw error;
        return data;
    },

    async demoteManagerCleanup(managerId) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { data, error } = await supabase.rpc('admin_demote_manager_cleanup', { p_manager_id: managerId });
        if (error) throw error;
        return data;
    },

    async listAssignmentHistory({ username = null, managerId = null, limit = 100 } = {}) {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase.rpc('admin_list_assignment_history', {
            p_username: username,
            p_manager_id: managerId,
            p_limit: limit,
        });
        if (error) throw error;
        return data || [];
    },

    async listMyCreators(managerId = null) {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase.rpc('manager_list_my_creators', { p_manager_id: managerId });
        if (error) throw error;
        return data || [];
    },

    async listAllAssignments() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('creator_assignments')
            .select('username, manager_id');
        if (error) throw error;
        return data || [];
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  PUSH NOTIFICATIONS — registrar suscripción en BD
// ────────────────────────────────────────────────────────────────────────────

export const push = {
    async saveSubscription(subscription) {
        if (!isSupabaseConfigured) return;
        const json = subscription.toJSON();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No autenticado.');

        const { error } = await supabase.from('push_subscriptions').upsert({
            user_id:    user.id,
            endpoint:   json.endpoint,
            p256dh:     json.keys.p256dh,
            auth:       json.keys.auth,
            user_agent: navigator.userAgent,
        }, { onConflict: 'endpoint' });
        if (error) throw error;
    },

    async deleteSubscription(endpoint) {
        if (!isSupabaseConfigured) return;
        const { error } = await supabase
            .from('push_subscriptions').delete().eq('endpoint', endpoint);
        if (error) throw error;
    },

    /**
     * Envía un broadcast a través de la Pages Function "send-push".
     * target = { type: 'all' | 'role' | 'user' | 'users', value: string|string[]|null }
     */
    async send({ title, body, url, target }) {
        // Enviamos el JWT de la sesión activa para que el servidor pueda verificar identidad
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';

        const response = await fetch('/api/send-push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ title: san(title), body: san(body), url: san(url), target: sanDeep(target) }),
        });

        let payload = null;
        try { payload = await response.json(); } catch { /* respuesta no-JSON */ }

        if (payload && Array.isArray(payload.server_logs) && payload.server_logs.length) {
            console.group(`🚀 REGISTROS DE ENVÍO (SERVIDOR) — HTTP ${response.status}`);
            payload.server_logs.forEach(l => console.log(l));
            if (payload.result) console.log('Respuesta OneSignal:', payload.result);
            console.groupEnd();
        }

        if (!response.ok || (payload && payload.success === false)) {
            const oneSignalErr =
                payload?.result?.errors
                && (Array.isArray(payload.result.errors)
                    ? payload.result.errors[0]
                    : (payload.result.errors.invalid_external_user_ids
                        || payload.result.errors.invalid_aliases
                        || JSON.stringify(payload.result.errors)));
            const msg =
                oneSignalErr ||
                payload?.error ||
                `El servidor devolvió HTTP ${response.status}`;
            throw new Error(msg);
        }

        return payload;
    },

    /** Devuelve las últimas 50 notificaciones enviadas (vista admin). */
    async listSent() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('notifications')
            .select('id, title, body, url, target_type, target_value, sent_at, delivered, failed')
            .order('sent_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return data || [];
    },

    /** Guarda la notificación enviada en la tabla notifications para el historial. */
    async saveToDb(title, body, url, target) {
        if (!isSupabaseConfigured) return;
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('notifications').insert({
            sent_by:      user?.id || null,
            title:        san(title),
            body:         san(body),
            url:          url || null,
            target_type:  target.type,
            target_value: Array.isArray(target.value)
                ? JSON.stringify(target.value)
                : (target.value || null),
            sent_at:      new Date().toISOString(),
        });
        if (error) console.warn('[push.saveToDb] error al guardar en BD:', error.message);
    },

    /**
     * Devuelve las notificaciones relevantes para un usuario concreto.
     * Filtra por: all, por rol, por ID individual, y por array de IDs.
     */
    async getForUser(userId, userRole) {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('notifications')
            .select('id, title, body, url, target_type, target_value, sent_at')
            .order('sent_at', { ascending: false })
            .limit(100);
        if (error) throw error;

        return (data || []).filter(n => {
            if (n.target_type === 'all') return true;
            if (n.target_type === 'role' && n.target_value === userRole) return true;
            if (n.target_type === 'user' && n.target_value === userId) return true;
            if (n.target_type === 'users') {
                try {
                    const ids = JSON.parse(n.target_value);
                    return Array.isArray(ids) && ids.includes(userId);
                } catch { return false; }
            }
            return false;
        });
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  CAPACITACIONES
// ────────────────────────────────────────────────────────────────────────────

export const trainings = {
    // agency: 'latam'|'usa' → muestra de esa región + 'all'; null → todo (admin)
    async list(agency = null) {
        if (!isSupabaseConfigured) return [];
        if (agency) {
            try {
                const { data, error } = await supabase
                    .from('trainings').select('*').eq('published', true)
                    .or(`agency.eq.${agency},agency.eq.all`)
                    .order('created_at', { ascending: false });
                if (!error) return data || [];
            } catch { /* columna no existe aún — cae al fallback */ }
        }
        const { data, error } = await supabase
            .from('trainings').select('*').eq('published', true)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async create({ title, description, youtube_url, agency = 'all' }) {
        if (!isSupabaseConfigured) throw new Error('Supabase no configurado.');
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('trainings').insert({
            title: san(title), description: san(description),
            youtube_url: san(youtube_url), created_by: user?.id,
            agency: agency || 'all',
        });
        if (error) throw error;
    },

    async update(id, { title, description, youtube_url, agency = 'all' }) {
        if (!isSupabaseConfigured) throw new Error('Supabase no configurado.');
        const { error } = await supabase.from('trainings')
            .update({ title: san(title), description: san(description), youtube_url: san(youtube_url), agency: agency || 'all' })
            .eq('id', id);
        if (error) throw error;
    },

    async remove(id) {
        if (!isSupabaseConfigured) throw new Error('Supabase no configurado.');
        const { error } = await supabase.from('trainings').delete().eq('id', id);
        if (error) throw error;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  EVENTOS
// ────────────────────────────────────────────────────────────────────────────

export const agencyEvents = {
    async list() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('events').select('*')
            .eq('published', true)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async create({ title, description, image_url, event_date }) {
        if (!isSupabaseConfigured) throw new Error('Supabase no configurado.');
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('events').insert({
            title: san(title), description: san(description),
            image_url: image_url || null,
            event_date: event_date || null,
            created_by: user?.id,
        });
        if (error) throw error;
    },

    async uploadImage(file) {
        if (!isSupabaseConfigured) throw new Error('Supabase no configurado.');
        const ext  = file.name.split('.').pop().toLowerCase();
        const path = `events/${Date.now()}.${ext}`;
        const { data, error } = await supabase.storage
            .from('media').upload(path, file, { upsert: false, contentType: file.type });
        if (error) throw error;
        return supabase.storage.from('media').getPublicUrl(data.path).data.publicUrl;
    },

    async update(id, { title, description, image_url, event_date }) {
        if (!isSupabaseConfigured) throw new Error('Supabase no configurado.');
        const { error } = await supabase.from('events')
            .update({ title: san(title), description: san(description),
                      image_url: image_url || null, event_date: event_date || null })
            .eq('id', id);
        if (error) throw error;
    },

    async remove(id) {
        if (!isSupabaseConfigured) throw new Error('Supabase no configurado.');
        const { error } = await supabase.from('events').delete().eq('id', id);
        if (error) throw error;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  CONTENIDOS — páginas editables por el admin
// ────────────────────────────────────────────────────────────────────────────

const CONTENT_DEFAULTS = {
    normas:  { title: 'Normas de la Agencia',  body: '' },
    canales: { title: 'Canales Oficiales',     body: '' },
};

export const content = {
    async getPage(slug) {
        if (!isSupabaseConfigured) return CONTENT_DEFAULTS[slug] || null;
        const { data, error } = await supabase
            .from('agency_content')
            .select('slug, title, body')
            .eq('slug', slug)
            .maybeSingle();
        if (error) throw error;
        return data || CONTENT_DEFAULTS[slug];
    },

    async upsertPage(slug, title, body) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase
            .from('agency_content')
            .upsert({ slug, title: san(title), body: san(body), updated_at: new Date().toISOString() },
                    { onConflict: 'slug' });
        if (error) throw error;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  COMPENSACIÓN DE MANAGERS — objetivo mensual y tasas de comisión, por
//  agencia. Editable solo por admin (ver RLS en MANAGER_COMP_SQL.sql); el
//  manager y el admin pueden leerlo. Los defaults de demo replican los
//  valores reales validados en el Panel de Creadores (DEFAULT_COMP).
// ────────────────────────────────────────────────────────────────────────────

const DEMO_COMP_DEFAULTS = {
    latam: {
        agency: 'latam', objetivo_mensual: 7660000,
        tier1_nuevos: 25, tier1_monetizan: 10, tier1_graduados: 4, tier1_pago: 250,
        tier2_nuevos: 20, tier2_monetizan: 5, tier2_graduados: 1, tier2_pago: 200,
        umbral_monetizan_completo: 80000, umbral_monetizan_parcial: 40000, peso_monetizan_parcial: 0.5,
        tasa_subir: 4, tasa_mantener: 2,
        tasas_actividad: [0.5, 1, 1.5, 2, 2.5],
        tasas_incremento: [5.5, 9], incremento_tiers_min: [90, 100],
        pct_reparto_comisiones: 40,
    },
    usa: {
        agency: 'usa', objetivo_mensual: 7660000,
        tier1_nuevos: 25, tier1_monetizan: 10, tier1_graduados: 4, tier1_pago: 250,
        tier2_nuevos: 20, tier2_monetizan: 5, tier2_graduados: 1, tier2_pago: 200,
        umbral_monetizan_completo: 80000, umbral_monetizan_parcial: 40000, peso_monetizan_parcial: 0.5,
        tasa_subir: 4, tasa_mantener: 2,
        tasas_actividad: [0.5, 1, 1.5, 2, 2.5],
        tasas_incremento: [5.5, 9], incremento_tiers_min: [90, 100],
        pct_reparto_comisiones: 40,
    },
};

export const managerComp = {
    async getSettings(agency = 'latam') {
        if (!isSupabaseConfigured) return DEMO_COMP_DEFAULTS[agency] || DEMO_COMP_DEFAULTS.latam;
        const { data, error } = await supabase
            .from('manager_comp_settings')
            .select('*')
            .eq('agency', agency)
            .maybeSingle();
        if (error) throw error;
        return data || DEMO_COMP_DEFAULTS[agency] || DEMO_COMP_DEFAULTS.latam;
    },

    async updateSettings(agency, settings) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase
            .from('manager_comp_settings')
            .upsert({ agency, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'agency' });
        if (error) throw error;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  CANALES OFICIALES — lista gestionada por el admin, guardada como JSON
// ────────────────────────────────────────────────────────────────────────────

export const channels = {
    async list(agency = 'latam') {
        if (!isSupabaseConfigured) return [];
        const slug = `channels_${agency}`;
        const { data, error } = await supabase
            .from('agency_content').select('body').eq('slug', slug).maybeSingle();
        if (error) throw error;
        if (data?.body) try { return JSON.parse(data.body); } catch { return []; }
        // Migración: si aún no existe el slug regional, usa el legacy channels_v2
        const { data: legacy } = await supabase
            .from('agency_content').select('body').eq('slug', 'channels_v2').maybeSingle();
        if (legacy?.body) try { return JSON.parse(legacy.body); } catch {}
        return [];
    },

    async save(items, agency = 'latam') {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const slug = `channels_${agency}`;
        const { error } = await supabase
            .from('agency_content')
            .upsert({
                slug,
                title:      `Canales Oficiales ${agency.toUpperCase()}`,
                body:       JSON.stringify(items),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'slug' });
        if (error) throw error;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  SISTEMA DE PUNTOS / REFERIDOS
// ────────────────────────────────────────────────────────────────────────────

export const points = {
    /** Balance actual del usuario autenticado (o de un userId específico para admin). */
    async getBalance(userId = null) {
        if (!isSupabaseConfigured) return 0;
        let id = userId;
        if (!id) {
            const { data: { user } } = await supabase.auth.getUser();
            id = user?.id;
        }
        if (!id) return 0;
        const { data } = await supabase.from('profiles').select('points').eq('id', id).maybeSingle();
        return data?.points ?? 0;
    },

    /** Admin: suma (o resta) puntos a un creador. */
    async addPoints(userId, delta) {
        if (!isSupabaseConfigured) throw new Error('No configurado.');
        const { data: profile } = await supabase.from('profiles').select('points').eq('id', userId).maybeSingle();
        const next = Math.max(0, (profile?.points ?? 0) + delta);
        const { error } = await supabase.from('profiles').update({ points: next }).eq('id', userId);
        if (error) throw error;
        return next;
    },

    /** Admin: lista todos los creadores con sus puntos. */
    async listCreatorPoints() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('profiles')
            .select('id, tiktok_username, display_name, points, agency')
            .eq('role', 'creator')
            .gt('points', 0)
            .order('points', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    /** Creador: canjea todos sus puntos por diamantes. */
    async redeem() {
        if (!isSupabaseConfigured) throw new Error('No configurado.');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No autenticado.');
        const { data: profile } = await supabase
            .from('profiles').select('points, tiktok_username, display_name').eq('id', user.id).maybeSingle();
        const bal = profile?.points ?? 0;
        if (bal <= 0) throw new Error('No tenés puntos para canjear.');
        const diamonds = bal * 250;
        const username = profile?.tiktok_username || profile?.display_name || user.id;
        // Primero deducimos los puntos
        const { error: e1 } = await supabase.from('profiles').update({ points: 0 }).eq('id', user.id);
        if (e1) throw e1;
        // Registramos el canje (best-effort)
        await supabase.from('points_redemptions').insert({
            user_id: user.id, username, points_redeemed: bal, diamonds_earned: diamonds,
        });
        return { pointsRedeemed: bal, diamondsEarned: diamonds };
    },

    /** Creador: historial de sus canjes. */
    async myRedemptions() {
        if (!isSupabaseConfigured) return [];
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data, error } = await supabase
            .from('points_redemptions').select('*')
            .eq('user_id', user.id).order('redeemed_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    /** Admin: lista todos los canjes. */
    async listRedemptions() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('points_redemptions').select('*')
            .order('redeemed_at', { ascending: false }).limit(200);
        if (error) throw error;
        return data || [];
    },

    /** Admin: marca un canje como procesado. */
    async markProcessed(id) {
        if (!isSupabaseConfigured) throw new Error('No configurado.');
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('points_redemptions')
            .update({ status: 'processed', processed_at: new Date().toISOString(), processed_by: user?.id })
            .eq('id', id);
        if (error) throw error;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  MISIONES — camino de 7 días para nuevos creadores
// ────────────────────────────────────────────────────────────────────────────

export const missions = {
    async list() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('missions')
            .select('*')
            .order('day_number', { ascending: true })
            .order('sort_order',  { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async getCompletions(creatorId = null) {
        if (!isSupabaseConfigured) return [];
        let id = creatorId;
        if (!id) {
            const { data: { user } } = await supabase.auth.getUser();
            id = user?.id;
        }
        if (!id) return [];
        const { data, error } = await supabase
            .from('mission_completions')
            .select('mission_id, completed_at')
            .eq('creator_id', id);
        if (error) throw error;
        return data || [];
    },

    async complete(missionId) {
        if (!isSupabaseConfigured) throw new Error('No configurado.');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No autenticado.');
        const { error } = await supabase.from('mission_completions')
            .insert({ creator_id: user.id, mission_id: missionId });
        if (error) throw error;
    },

    async uncomplete(missionId) {
        if (!isSupabaseConfigured) throw new Error('No configurado.');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No autenticado.');
        const { error } = await supabase.from('mission_completions')
            .delete().eq('creator_id', user.id).eq('mission_id', missionId);
        if (error) throw error;
    },

    async create({ day_number, title, description = '', sort_order = 0 }) {
        if (!isSupabaseConfigured) throw new Error('No configurado.');
        const { error } = await supabase.from('missions').insert({
            day_number, title: san(title), description: san(description), sort_order,
        });
        if (error) throw error;
    },

    async update(id, { title, description, day_number, sort_order }) {
        if (!isSupabaseConfigured) throw new Error('No configurado.');
        const updates = {};
        if (title       !== undefined) updates.title       = san(title);
        if (description !== undefined) updates.description = san(description);
        if (day_number  !== undefined) updates.day_number  = day_number;
        if (sort_order  !== undefined) updates.sort_order  = sort_order;
        const { error } = await supabase.from('missions').update(updates).eq('id', id);
        if (error) throw error;
    },

    async remove(id) {
        if (!isSupabaseConfigured) throw new Error('No configurado.');
        const { error } = await supabase.from('missions').delete().eq('id', id);
        if (error) throw error;
    },

    async getCompletionCounts() {
        if (!isSupabaseConfigured) return {};
        const { data, error } = await supabase
            .from('mission_completions')
            .select('mission_id');
        if (error) return {};
        const counts = {};
        for (const r of data || []) counts[r.mission_id] = (counts[r.mission_id] || 0) + 1;
        return counts;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  MAGIC BY LOXHIAS — activación de suscripción por desempeño
//  Ver CLAUDE.md de Magic ("Integración con Creator Elevate") para el diseño
//  completo: 1 mes de prueba gratis (una única vez por siempre), mantenido
//  mes a mes según si el creador sube/mantiene su nivel de diamantes (misma
//  tabla que assets/js/config.js#cashBonuses, ver metrics.syncMagicSubscriptions
//  más arriba para el lado de mantenimiento/revocación).
// ────────────────────────────────────────────────────────────────────────────

export const magic = {
    /** El propio creador pide su mes de prueba gratis (Pages Function "magic-request-trial"). */
    async requestTrial() {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        const response = await fetch('/api/magic-request-trial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        });
        let payload = null;
        try { payload = await response.json(); } catch { /* respuesta no-JSON */ }
        if (!response.ok || (payload && payload.success === false)) {
            throw new Error(payload?.error || `Error HTTP ${response.status}`);
        }
        return payload;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  WHATSAPP — vinculación (creador) + FAQ (admin)
// ────────────────────────────────────────────────────────────────────────────

export const whatsapp = {
    async generateLinkCode() {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { data, error } = await supabase.rpc('whatsapp_generate_link_code');
        if (error) throw error;
        return data;
    },

    async listFaq() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('whatsapp_faq')
            .select('*')
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async upsertFaq({ id, keywords, question_label, answer, active = true, sort_order = 0 }) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const row = {
            keywords: (keywords || []).map(k => san(k).toLowerCase().trim()).filter(Boolean),
            question_label: san(question_label),
            answer: san(answer),
            active,
            sort_order,
        };
        if (id) {
            const { error } = await supabase.from('whatsapp_faq').update(row).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('whatsapp_faq').insert(row);
            if (error) throw error;
        }
    },

    async deleteFaq(id) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase.from('whatsapp_faq').delete().eq('id', id);
        if (error) throw error;
    },

    /**
     * Dispara el envío de "progreso actual" por WhatsApp a todos los
     * creadores vinculados (Pages Function "whatsapp-send-checkins").
     * Se llama después de publicar un Excel nuevo — no lanza si falla, para
     * no bloquear la publicación de datos por un problema de WhatsApp.
     */
    async sendCheckins() {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        const response = await fetch('/api/whatsapp-send-checkins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        });
        let payload = null;
        try { payload = await response.json(); } catch { /* respuesta no-JSON */ }
        if (!response.ok || (payload && payload.success === false)) {
            throw new Error(payload?.error || `Error HTTP ${response.status}`);
        }
        return payload;
    },
};

// ────────────────────────────────────────────────────────────────────────────
//  NOTIFICACIONES AUTOMÁTICAS — cooldown anti-spam
// ────────────────────────────────────────────────────────────────────────────

export const autoNotif = {
    /** Devuelve el Set de IDs que ya recibieron notif de inactividad en el cooldown. */
    async getCooldownIds(creatorIds, cooldownDays = 7) {
        if (!isSupabaseConfigured || !creatorIds.length) return new Set();
        const cutoff = new Date(Date.now() - cooldownDays * 86400 * 1000).toISOString();
        try {
            const { data } = await supabase
                .from('auto_notifications_log')
                .select('creator_id')
                .eq('type', 'inactivity')
                .gte('sent_at', cutoff)
                .in('creator_id', creatorIds);
            return new Set((data || []).map(l => l.creator_id));
        } catch {
            return new Set();
        }
    },

    /** Registra que se envió notif de inactividad a estos creadores. */
    async logInactivity(creatorIds) {
        if (!isSupabaseConfigured || !creatorIds.length) return;
        const { error } = await supabase.from('auto_notifications_log').insert(
            creatorIds.map(id => ({ creator_id: id, type: 'inactivity' }))
        );
        if (error) throw error;
    },
};
