/**
 * Capa de datos (DAL) — única fuente de acceso a Supabase desde la UI.
 * Si Supabase no está configurado, devuelve datos del fallback (preloadedData).
 */
import { supabase, isSupabaseConfigured } from './supabase.js';
import { preloadedData } from './data.js';

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
        const username = String(tiktokUsername || '').trim().toLowerCase().replace(/^@/, '');
        if (!username)         throw new Error('El usuario de TikTok es obligatorio.');
        if (!/^[a-z0-9._]+$/i.test(username))
            throw new Error('El usuario de TikTok solo puede contener letras, números, "." y "_".');
        if (!email)            throw new Error('El email es obligatorio.');
        if (!password || password.length < 6)
            throw new Error('La contraseña debe tener al menos 6 caracteres.');

        // 1) verificar disponibilidad del username
        const { data: available, error: checkErr } = await supabase.rpc(
            'is_tiktok_username_available',
            { p_username: username },
        );
        if (checkErr) throw checkErr;
        if (!available) throw new Error('Ese usuario de TikTok ya está registrado.');

        // 2) signUp con metadata; el trigger handle_new_user crea el profile
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    tiktok_username: username,
                    role: 'creator',
                    display_name: displayName || username,
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

    async updateOwnProfile(patch) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No autenticado.');
        const { data, error } = await supabase
            .from('profiles')
            .update(patch)
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
    return {
        username:           r.username,
        diamonds:           Number(r.diamonds || 0),
        diamondsLastMonth:  Number(r.diamonds_last_month || 0),
        liveDuration:       r.live_duration || '0s',
        liveSeconds:        Number(r.live_seconds || 0),
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
    };
}

export const metrics = {
    /** Devuelve { period, rows } del período más reciente. */
    async getLatest() {
        if (!isSupabaseConfigured) {
            return { period: null, rows: preloadedData };
        }
        const { data: period, error: pErr } = await supabase
            .from('latest_period').select('*').maybeSingle();
        if (pErr) throw pErr;
        if (!period) return { period: null, rows: [] };

        const { data, error } = await supabase
            .from('latest_metrics')
            .select('*')
            .order('diamonds', { ascending: false });
        if (error) throw error;

        const rows = data.map(rowFromDb);
        console.log('📥 API RECEIVE: Latest metrics from DB:', rows);
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

    /** Bulk upsert (admin) — invoca la RPC. */
    async upsertPeriod(periodDate, label, rows) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const payload = rows.map(r => ({
            username:          String(r.username || '').trim().toLowerCase().replace(/^@/, ''),
            diamonds:          Number(r.diamonds || 0),
            diamondsLastMonth: Number(r.diamondsLastMonth || 0),
            liveDuration:      r.liveDuration || '0s',
            liveSeconds:       Number(r.liveSeconds || 0),
            validDays:         Number(r.validDays || 0),
            newFollowers:      Number(r.newFollowers || 0),
            emisionesLive:     Number(r.emisionesLive || 0),
            battles:           Number(r.battles || 0),
            battleDiamonds:    Number(r.battleDiamonds || 0),
            multiGuestDiamonds: Number(r.multiGuestDiamonds || 0),
            statusGraduation:  r.statusGraduation || null,
            statusRank:        r.statusRank || null,
            statusActive:      r.statusActive || null,
            groupName:         r.groupName || null,
            manager:           r.manager || r.managerName || null,
        })).filter(r => r.username);

        console.log('🚀 API SEND: Upserting metrics to server:', { periodDate, label, payloadCount: payload.length, firstRow: payload[0] });

        const { data, error } = await supabase.rpc('admin_upsert_metrics', {
            p_period: periodDate,
            p_label:  label,
            p_rows:   payload,
        });
        if (error) throw error;
        console.log('✅ API SEND SUCCESS:', data);
        return data;
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

    async listManagers() {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('profiles').select('*').eq('role', 'manager');
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
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('is_manager', true);
        if (error) throw error;
        return data;
    },

    async listCreatorsForManager(managerId) {
        if (!isSupabaseConfigured) return [];
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'creator')
            .eq('manager_id', managerId);
        if (error) throw error;
        return data;
    },

    async assignManager(creatorId, managerId) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase.rpc('admin_assign_manager', {
            p_creator_id: creatorId,
            p_manager_id: managerId,
        });
        if (error) throw error;
    },

    async setRole(userId, role) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { error } = await supabase
            .from('profiles')
            .update({ role })
            .eq('id', userId);
        if (error) throw error;
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
     * Envía un broadcast a través de la Edge Function "send-push".
     * target = { type: 'all' | 'manager_group' | 'user', value: string|null }
     */
    async send({ title, body, url, target }) {
        if (!isSupabaseConfigured) throw new Error('Supabase no está configurado.');
        const { data, error } = await supabase.functions.invoke('send-push', {
            body: { title, body, url, target },
        });
        if (error) throw error;
        return data;
    },
};
