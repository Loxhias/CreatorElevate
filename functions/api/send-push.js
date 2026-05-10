/**
 * Cloudflare Pages Function — POST /api/send-push
 *
 * Envía una notificación a través de la REST API de OneSignal (v2).
 *
 * Variables de entorno (Cloudflare → Pages → Settings → Environment Variables):
 *   - ONESIGNAL_APP_ID    (Production + Preview)
 *   - ONESIGNAL_API_KEY   (Production + Preview, marcada como SECRET)
 *
 * Si no están definidas, cae a los valores hardcodeados como fallback,
 * pero lo correcto es eliminarlos del código y usar siempre las env vars.
 */

const FALLBACK_APP_ID  = "fd362054-cfe2-4b90-97cb-a2374f48c5c0";
const FALLBACK_API_KEY = "os_v2_app_7u3cavgp4jfzbf6lui3u6sgfycjon3tu3haew35wov652nnp4utmnrfrexrrk5lducfgfunukx6326fiuku7geltpmqcft3l4rk55ca";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}

export async function onRequestPost(context) {
    const ONESIGNAL_APP_ID  = context.env?.ONESIGNAL_APP_ID  || FALLBACK_APP_ID;
    const ONESIGNAL_API_KEY = context.env?.ONESIGNAL_API_KEY || FALLBACK_API_KEY;

    const logs = [];
    const log  = (msg, extra) => {
        const line = extra !== undefined
            ? `${msg} :: ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`
            : msg;
        logs.push(`[${new Date().toISOString()}] ${line}`);
        console.log(line);
    };

    try {
        if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
            return jsonResponse({
                success: false,
                error: 'Faltan ONESIGNAL_APP_ID / ONESIGNAL_API_KEY en las variables de entorno.',
                server_logs: logs,
            }, 500);
        }

        // Diagnóstico: confirmamos que estamos usando la key correcta sin filtrarla en logs.
        const keyPreview = `${ONESIGNAL_API_KEY.slice(0, 14)}…(${ONESIGNAL_API_KEY.length} chars)`;
        const fromEnv    = !!context.env?.ONESIGNAL_API_KEY;
        log('Auth → header "Key"', { key_preview: keyPreview, from_env: fromEnv, app_id: ONESIGNAL_APP_ID });

        const payload = await context.request.json().catch(() => null);
        if (!payload) {
            return jsonResponse({ success: false, error: 'JSON inválido en el body.', server_logs: logs }, 400);
        }

        const { title, body, url, target } = payload;
        if (!title || !body) {
            return jsonResponse({
                success: false,
                error: 'Faltan campos obligatorios: title y body.',
                server_logs: logs,
            }, 400);
        }

        const notificationBody = {
            app_id:   ONESIGNAL_APP_ID,
            headings: { en: title, es: title },
            contents: { en: body,  es: body  },
        };
        if (url) {
            notificationBody.url     = url;
            notificationBody.web_url = url;
        }

        const t = target || { type: 'all' };

        if (t.type === 'role') {
            // Requiere que en el cliente hayas hecho OneSignal.User.addTag('role', '<rol>')
            notificationBody.filters = [
                { field: "tag", key: "role", relation: "=", value: String(t.value) },
            ];
            log('Filtrando por tag role =', t.value);
        } else if (t.type === 'user') {
            notificationBody.include_aliases = { external_id: [String(t.value)] };
            notificationBody.target_channel  = 'push';
            log('Destino externo (1):', t.value);
        } else if (t.type === 'users') {
            const ids = Array.isArray(t.value) ? t.value.filter(Boolean).map(String) : [];
            if (!ids.length) {
                return jsonResponse({
                    success: false,
                    error: 'La lista de destinatarios está vacía (no hay usuarios con perfil asociado).',
                    server_logs: logs,
                }, 400);
            }
            notificationBody.include_aliases = { external_id: ids };
            notificationBody.target_channel  = 'push';
            log(`Destinos externos (${ids.length}):`, ids);
        } else {
            notificationBody.included_segments = ["Subscribed Users"];
            log('Broadcast a segmento "Subscribed Users"');
        }

        log('Enviando a OneSignal:', notificationBody);

        // ⚠️ La REST API de OneSignal NO usa Basic Auth con Base64.
        //     El header correcto es:   Authorization: Key <REST_API_KEY>
        //     (V2 también acepta:      Authorization: Basic <REST_API_KEY>  literal, sin codificar)
        const response = await fetch("https://api.onesignal.com/notifications?c=push", {
            method: "POST",
            headers: {
                "Content-Type":  "application/json; charset=utf-8",
                "Accept":        "application/json",
                "Authorization": `Key ${ONESIGNAL_API_KEY}`,
            },
            body: JSON.stringify(notificationBody),
        });

        const raw    = await response.text();
        let   result = {};
        try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }

        log(`Respuesta OneSignal HTTP ${response.status}:`, result);
        if (response.status === 401 || response.status === 403) {
            log('Pista: 401/403 suele significar que la REST API Key no corresponde al App ID, ' +
                'o que estás usando la "User Auth Key" de la cuenta en lugar de la "REST API Key" del app.');
        }

        const hasErrors = result && (
            (Array.isArray(result.errors) && result.errors.length) ||
            (result.errors && typeof result.errors === 'object' && Object.keys(result.errors).length)
        );
        const success = response.ok && !hasErrors;

        return jsonResponse({
            success,
            status: response.status,
            result,
            server_logs: logs,
        }, success ? 200 : (response.status >= 400 ? response.status : 502));

    } catch (err) {
        log('Excepción no controlada:', err?.message || String(err));
        return jsonResponse({
            success: false,
            error: err?.message || String(err),
            server_logs: logs,
        }, 500);
    }
}

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}
