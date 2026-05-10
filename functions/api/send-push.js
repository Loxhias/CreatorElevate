/**
 * Cloudflare Pages Function — POST /api/send-push
 *
 * Envía una notificación a través de la REST API de OneSignal (v2).
 *
 * REQUISITO: definir las variables de entorno en
 *   Cloudflare → Pages → Settings → Environment Variables (Production + Preview):
 *     - ONESIGNAL_APP_ID
 *     - ONESIGNAL_API_KEY   (marcala como "Encrypt"/Secret)
 *
 * NUNCA comprometas la REST API Key en el código fuente: GitHub Secret Scanning
 * la detectará y OneSignal la revocará automáticamente.
 */

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
    const ONESIGNAL_APP_ID  = context.env?.ONESIGNAL_APP_ID  || '';
    const ONESIGNAL_API_KEY = context.env?.ONESIGNAL_API_KEY || '';

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
                error: 'Faltan ONESIGNAL_APP_ID / ONESIGNAL_API_KEY en Cloudflare Pages → Settings → Environment Variables. Configurá ambas (Production + Preview), guardá y volvé a desplegar.',
                server_logs: logs,
            }, 500);
        }

        // Diagnóstico: confirmamos que estamos usando la key correcta sin filtrarla en logs.
        const keyPreview = `${ONESIGNAL_API_KEY.slice(0, 14)}…(${ONESIGNAL_API_KEY.length} chars)`;
        const fromEnv    = !!context.env?.ONESIGNAL_API_KEY;
        log('Auth → header "Basic"', { key_preview: keyPreview, from_env: fromEnv, app_id: ONESIGNAL_APP_ID });

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
            // Usamos la sintaxis legacy `include_external_user_ids` porque la nueva
            // `include_aliases.external_id` con `target_channel: "push"` reportadamente
            // resuelve a 0 destinatarios para web push aunque el alias exista.
            notificationBody.include_external_user_ids = [String(t.value)];
            notificationBody.channel_for_external_user_ids = 'push';
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
            notificationBody.include_external_user_ids = ids;
            notificationBody.channel_for_external_user_ids = 'push';
            log(`Destinos externos (${ids.length}):`, ids);
        } else {
            notificationBody.included_segments = ["Subscribed Users"];
            log('Broadcast a segmento "Subscribed Users"');
        }

        log('Enviando a OneSignal:', notificationBody);

        // ⚠️ La REST API de OneSignal usa el esquema "Basic" pero SIN codificar en Base64
        //     (no es HTTP Basic estándar). El valor es literalmente la REST API Key.
        //     El esquema "Key" de la doc nueva NO es aceptado por el endpoint /notifications.
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
            log('Pista (401/403): probables causas, en orden de probabilidad:');
            log('  1) La REST API Key fue REVOCADA por OneSignal (típicamente porque GitHub Secret Scanning la detectó pública en algún commit).');
            log('  2) La key no corresponde a este App ID.');
            log('  3) Es la "User Auth Key" de la cuenta en vez de la "REST API Key" del app.');
            log('  → Solución: regenerá la REST API Key en OneSignal → Settings → Keys & IDs y configurala como secret ONESIGNAL_API_KEY en Cloudflare Pages.');
        }

        const hasErrors = result && (
            (Array.isArray(result.errors) && result.errors.length) ||
            (result.errors && typeof result.errors === 'object' && Object.keys(result.errors).length)
        );

        // OneSignal devuelve `recipients` en la respuesta. Si vale 0 (o falta), la notificación
        // se aceptó pero no se entregó a nadie — típicamente porque el external_id/tag no resolvió.
        const recipients = (typeof result?.recipients === 'number') ? result.recipients : null;
        if (response.ok && !hasErrors && (recipients === 0 || recipients === null)) {
            log('⚠️ OneSignal aceptó la notificación pero recipients=' + recipients +
                '. Posibles causas: (a) el external_id no está asociado a ningún device suscrito, ' +
                '(b) el tag no matchea, (c) los devices están unsubscribed.');
        }

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
