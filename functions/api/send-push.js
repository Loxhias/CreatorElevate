/**
 * Cloudflare Pages Function — POST /api/send-push
 *
 * Requiere en Cloudflare → Pages → Settings → Environment Variables:
 *   ONESIGNAL_APP_ID      (Production + Preview)
 *   ONESIGNAL_API_KEY     (Secret)
 *   SUPABASE_URL          (ej: https://xxxx.supabase.co)
 *   SUPABASE_ANON_KEY     (anon public key)
 */

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

// Solo aceptamos peticiones de nuestro propio dominio
const ALLOWED_ORIGINS = [
    "https://creatorelevate.pages.dev",
    "https://interactik.creatorelevate.pages.dev",
];

function corsHeaders(requestOrigin) {
    const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Vary": "Origin",
    };
}

export async function onRequestOptions(context) {
    const origin = context.request.headers.get("Origin") || "";
    return new Response(null, { headers: corsHeaders(origin) });
}

export async function onRequestPost(context) {
    const origin = context.request.headers.get("Origin") || "";

    const ONESIGNAL_APP_ID   = context.env?.ONESIGNAL_APP_ID   || '';
    const ONESIGNAL_API_KEY  = context.env?.ONESIGNAL_API_KEY  || '';
    const SUPABASE_URL       = context.env?.SUPABASE_URL       || '';
    const SUPABASE_ANON_KEY  = context.env?.SUPABASE_ANON_KEY  || '';

    const logs = [];
    const log  = (msg, extra) => {
        const line = extra !== undefined
            ? `${msg} :: ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`
            : msg;
        logs.push(`[${new Date().toISOString()}] ${line}`);
        console.log(line);
    };

    const reply = (obj, status = 200) =>
        new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...corsHeaders(origin) } });

    try {
        // ── 1. Verificación de autenticación ────────────────────────────────
        const authHeader = context.request.headers.get("Authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

        if (!token) {
            log("Auth: token ausente — petición rechazada");
            return reply({ success: false, error: "No autorizado." }, 401);
        }

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            log("SUPABASE_URL / SUPABASE_ANON_KEY no configuradas en Cloudflare env vars");
            return reply({ success: false, error: "Servidor mal configurado — faltan SUPABASE_URL y SUPABASE_ANON_KEY en Cloudflare Pages env." }, 500);
        }

        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "apikey": SUPABASE_ANON_KEY,
            },
        });

        if (!userRes.ok) {
            log(`Auth: Supabase respondió ${userRes.status} — token inválido o expirado`);
            return reply({ success: false, error: "Sesión inválida o expirada." }, 401);
        }

        const userData = await userRes.json().catch(() => null);
        const userId   = userData?.id || "desconocido";
        log("Auth OK — usuario:", userId);

        // ── 2. Validar credenciales de OneSignal ────────────────────────────
        if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
            return reply({
                success: false,
                error: "Faltan ONESIGNAL_APP_ID / ONESIGNAL_API_KEY en Cloudflare Pages → Settings → Environment Variables.",
                server_logs: logs,
            }, 500);
        }

        const keyPreview = `${ONESIGNAL_API_KEY.slice(0, 14)}…(${ONESIGNAL_API_KEY.length} chars)`;
        log("OneSignal key", { key_preview: keyPreview, app_id: ONESIGNAL_APP_ID });

        // ── 3. Parsear y validar payload ────────────────────────────────────
        const payload = await context.request.json().catch(() => null);
        if (!payload) {
            return reply({ success: false, error: "JSON inválido en el body.", server_logs: logs }, 400);
        }

        const { title, body, url, target } = payload;
        if (!title || !body) {
            return reply({ success: false, error: "Faltan campos obligatorios: title y body.", server_logs: logs }, 400);
        }

        // Tamaño máximo para evitar abuso
        if (title.length > 200 || body.length > 1000) {
            return reply({ success: false, error: "title o body demasiado largos.", server_logs: logs }, 400);
        }

        // ── 4. Construir payload de OneSignal ───────────────────────────────
        const notificationBody = {
            app_id:   ONESIGNAL_APP_ID,
            headings: { en: title, es: title },
            contents: { en: body,  es: body  },
            chrome_web_icon:  "https://creatorelevate.pages.dev/iconos/logo_morado.png",
            chrome_web_badge: "https://creatorelevate.pages.dev/iconos/logo_blanco.png",
            firefox_icon:     "https://creatorelevate.pages.dev/iconos/logo_morado.png",
        };
        if (url) {
            notificationBody.url     = url;
            notificationBody.web_url = url;
        }

        const t = target || { type: "all" };

        if (t.type === "role") {
            notificationBody.filters = [{ field: "tag", key: "role", relation: "=", value: t.value }];
            log("Filtrando por tag role =", t.value);
        } else if (t.type === "user") {
            notificationBody.include_external_user_ids = [String(t.value)];
            notificationBody.channel_for_external_user_ids = "push";
            log("Destino (1 usuario):", t.value);
        } else if (t.type === "users") {
            const ids = Array.isArray(t.value) ? t.value.filter(Boolean).map(String) : [];
            if (!ids.length) {
                return reply({ success: false, error: "Lista de destinatarios vacía.", server_logs: logs }, 400);
            }
            if (ids.length > 2000) {
                return reply({ success: false, error: "Demasiados destinatarios (máx 2000).", server_logs: logs }, 400);
            }
            notificationBody.include_external_user_ids = ids;
            notificationBody.channel_for_external_user_ids = "push";
            log(`Destinos (${ids.length} usuarios)`);
        } else {
            notificationBody.included_segments = ["Subscribed Users"];
            log("Broadcast a 'Subscribed Users'");
        }

        // ── 5. Enviar a OneSignal ───────────────────────────────────────────
        const response = await fetch("https://api.onesignal.com/notifications", {
            method: "POST",
            headers: {
                "Content-Type":  "application/json; charset=utf-8",
                "Accept":        "application/json",
                "Authorization": `Basic ${ONESIGNAL_API_KEY}`,
            },
            body: JSON.stringify(notificationBody),
        });

        const raw    = await response.text();
        let   result = {};
        try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }

        log(`Respuesta OneSignal HTTP ${response.status}:`, result);
        if (response.status === 401 || response.status === 403) {
            log("401/403: la REST API Key puede estar revocada. Regenerala en OneSignal → Settings → Keys & IDs.");
        }

        const hasErrors = result && (
            (Array.isArray(result.errors) && result.errors.length) ||
            (result.errors && typeof result.errors === "object" && Object.keys(result.errors).length)
        );

        const success = response.ok && !hasErrors;

        return reply({
            success,
            status: response.status,
            result,
            server_logs: logs,
        }, success ? 200 : (response.status >= 400 ? response.status : 502));

    } catch (err) {
        log("Excepción:", err?.message || String(err));
        return reply({ success: false, error: err?.message || String(err), server_logs: logs }, 500);
    }
}
