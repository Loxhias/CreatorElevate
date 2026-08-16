/**
 * Cloudflare Pages Function — POST /api/magic-sync-subscriptions
 *
 * Se dispara automáticamente desde assets/js/api.js#upsertPeriod() justo
 * después de que el admin carga el Excel mensual — evalúa a cada creador con
 * Magic activo (magic_status trialing/active) comparando SUS diamantes del
 * período recién cargado contra el período anterior, con la MISMA tabla de
 * niveles que ya usa la agencia para bonos en efectivo (assets/js/config.js
 * — no se reimplementa acá, se importa). Si mantuvo o subió de nivel,
 * mantiene Magic; si bajó, la pierde. Ver CLAUDE.md de Magic ("Integración
 * con Creator Elevate") para el diseño completo.
 *
 * No usa una key propia de service-role: el caller ya tiene que ser admin
 * (admin_upsert_metrics, llamado justo antes en el mismo flujo, ya lo exige)
 * — acá se reverifica con el mismo token de sesión, y se lo reusa para leer/
 * escribir profiles de otros usuarios vía la política RLS profiles_admin_update
 * (is_admin()), sin necesitar un secreto nuevo de este lado.
 *
 * Requiere en Cloudflare → Pages → Settings → Environment Variables:
 *   SUPABASE_URL, SUPABASE_ANON_KEY     (igual que send-push.js)
 *   MAGIC_API_URL                        (ej: https://magicbyloxhias.pages.dev)
 *   AGENCY_INTEGRATION_SECRET            (Secret — el mismo valor que en Magic)
 */

import { getCashBonuses } from '../../assets/js/config.js';

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

const ALLOWED_ORIGINS = [
    "https://creatorelevate.pages.dev",
    "https://interactik.creatorelevate.pages.dev",
    "https://app.interactikagency.com",
];

function corsHeaders(requestOrigin, appOrigin) {
    const allowed = [...ALLOWED_ORIGINS, appOrigin].filter(Boolean);
    const origin  = allowed.includes(requestOrigin) ? requestOrigin : (appOrigin || ALLOWED_ORIGINS[0]);
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Vary": "Origin",
    };
}

export async function onRequestOptions(context) {
    const origin    = context.request.headers.get("Origin") || "";
    const appOrigin = context.env?.APP_ORIGIN || "https://creatorelevate.pages.dev";
    return new Response(null, { headers: corsHeaders(origin, appOrigin) });
}

// Mismo criterio de getIdx() en assets/js/views/creatorDashboard.js — no se
// importa ese archivo entero porque depende de `store` (estado de browser),
// esta única función es autónoma y se porta tal cual.
function getIdx(diamonds, tiers) {
    for (let i = tiers.length - 1; i >= 0; i--) if (diamonds >= tiers[i].range) return i;
    return -1;
}

function monthKey(dateStr) {
    const d = new Date(dateStr);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

export async function onRequestPost(context) {
    const origin = context.request.headers.get("Origin") || "";

    const SUPABASE_URL              = context.env?.SUPABASE_URL              || '';
    const SUPABASE_ANON_KEY         = context.env?.SUPABASE_ANON_KEY         || '';
    const MAGIC_API_URL             = context.env?.MAGIC_API_URL             || 'https://magicbyloxhias.pages.dev';
    const AGENCY_INTEGRATION_SECRET = context.env?.AGENCY_INTEGRATION_SECRET || '';
    const APP_ORIGIN                = context.env?.APP_ORIGIN                || 'https://creatorelevate.pages.dev';

    const reply = (obj, status = 200) =>
        new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...corsHeaders(origin, APP_ORIGIN) } });

    try {
        const authHeader = context.request.headers.get("Authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return reply({ success: false, error: "No autorizado." }, 401);
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return reply({ success: false, error: "Servidor mal configurado — faltan SUPABASE_URL/SUPABASE_ANON_KEY." }, 500);
        }
        if (!AGENCY_INTEGRATION_SECRET) {
            return reply({ success: false, error: "Servidor mal configurado — falta AGENCY_INTEGRATION_SECRET." }, 500);
        }

        const restHeaders = { "Authorization": `Bearer ${token}`, "apikey": SUPABASE_ANON_KEY };

        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: restHeaders });
        if (!userRes.ok) return reply({ success: false, error: "Sesión inválida o expirada." }, 401);
        const userData = await userRes.json().catch(() => null);
        const userId = userData?.id;
        if (!userId) return reply({ success: false, error: "Sesión inválida." }, 401);

        const callerRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
            { headers: restHeaders }
        );
        const callerProfiles = callerRes.ok ? await callerRes.json().catch(() => []) : [];
        if (callerProfiles?.[0]?.role !== 'admin') {
            return reply({ success: false, error: "Solo un admin puede disparar la sincronización con Magic." }, 403);
        }

        const { periodDate } = await context.request.json().catch(() => ({}));
        if (!periodDate) return reply({ success: false, error: "Falta periodDate" }, 400);

        const thisPeriodStart = new Date(periodDate);
        const prevPeriodStart = new Date(Date.UTC(thisPeriodStart.getUTCFullYear(), thisPeriodStart.getUTCMonth() - 1, 1));
        const thisPeriodStr = thisPeriodStart.toISOString().slice(0, 10);
        const prevPeriodStr = prevPeriodStart.toISOString().slice(0, 10);

        // ── Períodos (para resolver period_id → creator_metrics) ────────────
        const periodsRes = await fetch(
            `${SUPABASE_URL}/rest/v1/report_periods?period=in.(${thisPeriodStr},${prevPeriodStr})&select=id,period,label`,
            { headers: restHeaders }
        );
        const periods = periodsRes.ok ? await periodsRes.json().catch(() => []) : [];
        const thisPeriod = periods.find(p => p.period === thisPeriodStr);
        const prevPeriod = periods.find(p => p.period === prevPeriodStr);
        if (!thisPeriod) return reply({ success: false, error: "No se encontró el período recién cargado." }, 404);

        // ── Creadores con Magic activo (trialing/active) ────────────────────
        const magicProfilesRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?magic_status=in.(trialing,active)&select=id,email,tiktok_username,agency,magic_status,magic_activated_at`,
            { headers: restHeaders }
        );
        const magicProfiles = magicProfilesRes.ok ? await magicProfilesRes.json().catch(() => []) : [];
        if (magicProfiles.length === 0) return reply({ success: true, evaluated: 0, results: [] });

        // ── Métricas de los dos períodos, indexadas por username en minúscula ─
        const periodIds = [thisPeriod.id, prevPeriod?.id].filter(Boolean);
        const metricsRes = await fetch(
            `${SUPABASE_URL}/rest/v1/creator_metrics?period_id=in.(${periodIds.join(',')})&select=period_id,username,diamonds`,
            { headers: restHeaders }
        );
        const metrics = metricsRes.ok ? await metricsRes.json().catch(() => []) : [];
        const diamondsByUsernameAndPeriod = new Map();
        for (const m of metrics) {
            diamondsByUsernameAndPeriod.set(`${m.period_id}:${String(m.username || '').toLowerCase()}`, Number(m.diamonds) || 0);
        }

        const thisMonthKey = monthKey(thisPeriodStr);

        const results = await Promise.allSettled(magicProfiles.map(async (profile) => {
            // Protege el primer mes gratis incondicional: si recién pidió la
            // prueba DURANTE el período que se está evaluando, no se evalúa
            // todavía — recién en la carga del mes siguiente.
            if (profile.magic_activated_at && monthKey(profile.magic_activated_at) === thisMonthKey) {
                return { email: profile.email, skipped: true, reason: "trial_month" };
            }
            if (!profile.email || !profile.tiktok_username) {
                return { email: profile.email, skipped: true, reason: "sin_email_o_username" };
            }

            const uname = profile.tiktok_username.toLowerCase();
            const thisDiamonds = diamondsByUsernameAndPeriod.get(`${thisPeriod.id}:${uname}`) || 0;
            const lastDiamonds = prevPeriod ? (diamondsByUsernameAndPeriod.get(`${prevPeriod.id}:${uname}`) || 0) : 0;

            const tiers = getCashBonuses(profile.agency);
            const thisIdx = getIdx(thisDiamonds, tiers);
            const lastIdx = getIdx(lastDiamonds, tiers);
            const decision = thisIdx >= lastIdx ? "maintain" : "revoke";

            const magicRes = await fetch(`${MAGIC_API_URL}/api/agency/sync-subscription`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Agency-Secret": AGENCY_INTEGRATION_SECRET },
                body: JSON.stringify({ email: profile.email, decision, periodLabel: thisPeriod.label }),
            });
            const magicData = await magicRes.json().catch(() => ({}));
            if (!magicRes.ok) {
                return { email: profile.email, error: magicData?.error || `Magic respondió ${magicRes.status}` };
            }

            await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
                method: "PATCH",
                headers: { ...restHeaders, "Content-Type": "application/json", "Prefer": "return=minimal" },
                body: JSON.stringify({ magic_status: magicData.status }),
            });

            return { email: profile.email, decision, newStatus: magicData.status, thisDiamonds, lastDiamonds };
        }));

        return reply({
            success: true,
            evaluated: results.length,
            results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message || 'error desconocido' }),
        });
    } catch (err) {
        return reply({ success: false, error: err.message || "Error interno" }, 500);
    }
}
