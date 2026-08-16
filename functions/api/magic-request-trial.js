/**
 * Cloudflare Pages Function — POST /api/magic-request-trial
 *
 * El creador pide, desde su propio panel, un mes de prueba gratis de
 * Magic By Loxhias — ver CLAUDE.md de Magic ("Integración con Creator
 * Elevate") para el diseño completo. Un único mes de prueba por siempre:
 * Magic es la fuente de verdad real de eso (tabla agency_subscription_grants,
 * UNIQUE por email) — acá solo se evita una llamada innecesaria si ya
 * sabemos localmente que este creador ya lo pidió.
 *
 * Requiere en Cloudflare → Pages → Settings → Environment Variables:
 *   SUPABASE_URL                (igual que send-push.js)
 *   SUPABASE_ANON_KEY           (igual que send-push.js)
 *   MAGIC_API_URL               (ej: https://magicbyloxhias.pages.dev)
 *   AGENCY_INTEGRATION_SECRET   (Secret — el mismo valor configurado en Magic)
 */

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
        // ── 1. Verificación de sesión (mismo patrón que send-push.js) ───────
        const authHeader = context.request.headers.get("Authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return reply({ success: false, error: "No autorizado." }, 401);
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return reply({ success: false, error: "Servidor mal configurado — faltan SUPABASE_URL/SUPABASE_ANON_KEY." }, 500);
        }
        if (!AGENCY_INTEGRATION_SECRET) {
            return reply({ success: false, error: "Servidor mal configurado — falta AGENCY_INTEGRATION_SECRET." }, 500);
        }

        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { "Authorization": `Bearer ${token}`, "apikey": SUPABASE_ANON_KEY },
        });
        if (!userRes.ok) return reply({ success: false, error: "Sesión inválida o expirada." }, 401);
        const userData = await userRes.json().catch(() => null);
        const userId = userData?.id;
        if (!userId) return reply({ success: false, error: "Sesión inválida." }, 401);

        // ── 2. Traer el perfil del creador (email/username/agencia) ─────────
        const profileRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=email,tiktok_username,agency,magic_status`,
            { headers: { "Authorization": `Bearer ${token}`, "apikey": SUPABASE_ANON_KEY } }
        );
        if (!profileRes.ok) return reply({ success: false, error: "No se pudo leer tu perfil." }, 500);
        const profiles = await profileRes.json().catch(() => []);
        const profile = profiles?.[0];
        if (!profile?.email) return reply({ success: false, error: "Tu perfil no tiene email registrado." }, 400);

        if (profile.magic_status) {
            return reply({ success: false, error: "Ya activaste tu mes de prueba de Magic — no se puede pedir de nuevo." }, 409);
        }

        // ── 3. Pedirle a Magic que otorgue el mes de prueba ──────────────────
        const magicRes = await fetch(`${MAGIC_API_URL}/api/agency/request-trial`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Agency-Secret": AGENCY_INTEGRATION_SECRET },
            body: JSON.stringify({ email: profile.email, username: profile.tiktok_username || null, agency: profile.agency || null }),
        });
        const magicData = await magicRes.json().catch(() => ({}));
        if (!magicRes.ok) {
            return reply({ success: false, error: magicData?.error || `Magic respondió ${magicRes.status}` }, magicRes.status);
        }

        // ── 4. Reflejar el estado local (para el botón/UI, y para que
        //      magic-sync-subscriptions.js sepa a quién evaluar) ────────────
        const nowIso = new Date().toISOString();
        const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${token}`,
                "apikey": SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            body: JSON.stringify({ magic_status: "trialing", magic_activated_at: nowIso }),
        });
        if (!updateRes.ok) {
            // Magic ya otorgó el trial real — esto solo es el reflejo local, no
            // se revierte nada del lado de Magic por un fallo acá.
            return reply({ success: true, warning: "Se activó tu prueba, pero no se pudo actualizar tu perfil local — refrescá la página." });
        }

        return reply({ success: true, status: "trialing" });
    } catch (err) {
        return reply({ success: false, error: err.message || "Error interno" }, 500);
    }
}
