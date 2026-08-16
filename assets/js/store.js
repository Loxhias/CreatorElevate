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
    managerCreators: {},   // cache { [managerId]: { usernames: Set, expiresAt: number } }
};

// Bug real de performance, mismo patrón que ya se corrigió en Magic By
// Loxhias (dashboard de la otra app): refreshMetrics()/refreshAdminLists()
// se llamaban SIN CONDICIÓN al montar casi cada vista (creatorDashboard,
// creatorGoals, managerDashboard, managerEarnings, partes de
// adminDashboard) — cada cambio de pestaña volvía a bajar la tabla
// COMPLETA de métricas de toda la agencia (o la lista completa de
// profiles), aunque `store.init()` ya la hubiera cargado hace instantes.
// Con la agencia creciendo, esto se sentía cada vez más lento. Ahora estas
// dos funciones son "cache-first con vencimiento": si ya se pidió hace
// menos de STALE_MS, no vuelven a pegarle a Supabase — salvo que el
// llamador pase `force:true` (después de publicar el Excel, guardar el
// perfil propio, marcar/desmarcar un referente, etc., donde el dato SÍ
// cambió de verdad en el servidor).
const METRICS_STALE_MS = 90 * 1000;
const ADMIN_LISTS_STALE_MS = 90 * 1000;
let metricsFetchedAt = 0;
let adminListsFetchedAt = 0;

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
    getProfile:  () => {
        if (!isSupabaseConfigured) {
            const localProfile = JSON.parse(localStorage.getItem('ce_demo_profile') || '{}');
            const currentUser = store.getCurrentUser();
            if (!currentUser) return null;
            return {
                id: currentUser.id || 'demo-user-id',
                tiktok_username: currentUser.username,
                display_name: currentUser.username,
                role: currentUser.role || 'creator',
                email: currentUser.email || 'demo@creatorelevate.com',
                joining_date: localProfile.joining_date || null,
                ...localProfile
            };
        }
        return state.profile;
    },
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
                // Pass userId to skip the internal getUser() round-trip
                state.profile = await auth.getProfile(sessionResult.value.user.id);
            }

            if (metricsResult.status === 'fulfilled' && metricsResult.value) {
                state.period = metricsResult.value.period;
                state.metricsRows = metricsResult.value.rows.length ? metricsResult.value.rows : null;
                // Marca el momento del fetch inicial — si no, la primera vista
                // que el usuario abre después de este init() vería
                // metricsFetchedAt en 0 y dispararía un refetch redundante
                // pese a que estos datos tienen segundos de antigüedad.
                metricsFetchedAt = Date.now();
            }
        } catch (e) {
            console.warn('Error en la inicialización paralela:', e);
        }
    },

    /**
     * Recarga las métricas. Cache-first con vencimiento (ver STALE_MS más
     * arriba) — pasar `force:true` cuando el dato SÍ cambió en el servidor
     * (ej. tras un upload de admin o que el propio creador cargue sus
     * métricas manuales).
     */
    async refreshMetrics(force = false) {
        if (!isSupabaseConfigured) return;
        if (!force && state.metricsRows && Date.now() - metricsFetchedAt < METRICS_STALE_MS) return;
        const { period, rows } = await metrics.getLatest();
        state.period = period;
        state.metricsRows = rows;
        metricsFetchedAt = Date.now();
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

    /** Fuerza re-fetch de profiles en el próximo renderAdminDashboard. */
    clearProfiles() {
        state.profiles = [];
        state.managers = [];
    },

    // ── manager group cache ────────────────────────────────────────────────
    getManagerGroup(managerId) {
        const c = state.managerCreators[managerId];
        return c && Date.now() < c.expiresAt ? c.usernames : null;
    },
    setManagerGroup(managerId, usernames) {
        state.managerCreators[managerId] = { usernames, expiresAt: Date.now() + 5 * 60 * 1000 };
    },
    invalidateManagerGroup(managerId) {
        delete state.managerCreators[managerId];
    },

    /**
     * Carga managers + perfiles (panel admin). Mismo criterio cache-first
     * que refreshMetrics — `force:true` cuando algo realmente cambió (ej.
     * marcar/desmarcar un referente, reasignar un creador).
     */
    async refreshAdminLists(force = false) {
        if (!isSupabaseConfigured) return;
        if (!force && state.profiles.length && Date.now() - adminListsFetchedAt < ADMIN_LISTS_STALE_MS) return;
        const { profiles } = await import('./api.js');
        state.profiles = await profiles.listAll();
        state.managers = state.profiles.filter(p => p.role === 'manager');
        adminListsFetchedAt = Date.now();
    },

    async clear() {
        state.profile = null;
        state.sessionUser = null;
    },
};
