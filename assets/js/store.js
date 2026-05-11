/**
 * Store global de la app — sesión + cache de métricas.
 * En modo demo (Supabase no configurado) usa preloadedData.
 */
import { auth, metrics } from './api.js';
import { isSupabaseConfigured } from './supabase.js';
import { preloadedData } from './data.js';

const state = {
    profile: null,         // perfil del usuario logueado (de la tabla profiles)
    sessionUser: null,     // user de auth.users
    metricsRows: null,     // array normalizado para los dashboards
    period: null,          // { id, period, label } o null
    managers: [],          // lista de managers (para admin)
    profiles: [],          // lista de profiles (para admin)
};

export const store = {
    // ── compat con código viejo ────────────────────────────────────────────
    get: (key) => {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
    },
    set: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
    remove: (key) => localStorage.removeItem(key),

    /** Devuelve el "currentUser" en el formato que usa el código actual. */
    getCurrentUser: () => {
        if (!state.profile) {
            // Modo demo: lee de localStorage (login con username plano)
            return store.get('currentUser');
        }
        return {
            id: state.profile.id,
            username: state.profile.tiktok_username || state.profile.display_name || state.profile.email,
            role: state.profile.role,
            managerId: state.profile.manager_id,
            email: state.profile.email,
        };
    },

    /** 
     * Devuelve las filas de métricas cargadas. 
     * Si Supabase está activo, NO debe devolver preloadedData.
     */
    getMetricsData: () => {
        if (!isSupabaseConfigured) return preloadedData;
        return state.metricsRows || [];
    },

    // ── nuevos getters ─────────────────────────────────────────────────────
    getProfile:  () => state.profile,
    getPeriod:   () => state.period,
    getManagers: () => state.managers,
    getProfiles: () => state.profiles,

    // ── login modo demo (cuando no hay Supabase) ──────────────────────────
    loginDemo: (user) => {
        store.set('currentUser', user);
    },

    logoutDemo: () => {
        store.remove('currentUser');
    },

    /**
     * Bootstrap inicial. Llamado desde main.js antes de navegar.
     * Lee la sesión, carga el profile y carga métricas del período activo.
     */
    async init() {
        if (!isSupabaseConfigured) {
            state.metricsRows = preloadedData;
            return;
        }

        // Cargamos sesión y métricas en paralelo para ahorrar tiempo
        try {
            const [sessionResult, metricsResult] = await Promise.allSettled([
                auth.getSession(),
                metrics.getLatest()
            ]);

            if (sessionResult.status === 'fulfilled' && sessionResult.value) {
                state.sessionUser = sessionResult.value.user;
                state.profile = await auth.getProfile();
            }

            if (metricsResult.status === 'fulfilled' && metricsResult.value) {
                state.period = metricsResult.value.period;
                state.metricsRows = metricsResult.value.rows.length ? metricsResult.value.rows : null;
            }
        } catch (e) {
            console.warn('Error en la inicialización paralela:', e);
        }
    },

    /** Recarga las métricas (ej. tras un upload de admin). */
    async refreshMetrics() {
        if (!isSupabaseConfigured) return;
        const { period, rows } = await metrics.getLatest();
        state.period = period;
        state.metricsRows = rows;
    },

    /** Recarga el perfil (ej. tras login). */
    async refreshProfile() {
        if (!isSupabaseConfigured) return;
        const [profile, session] = await Promise.all([
            auth.getProfile(),
            auth.getSession(),
        ]);
        state.profile  = profile;
        state.sessionUser = session?.user || null;
    },

    /** Carga managers + perfiles (panel admin). */
    async refreshAdminLists() {
        if (!isSupabaseConfigured) return;
        const { profiles } = await import('./api.js');
        state.profiles = await profiles.listAll();
        state.managers = state.profiles.filter(p => p.role === 'manager');
    },

    async clear() {
        state.profile = null;
        state.sessionUser = null;
    },
};
