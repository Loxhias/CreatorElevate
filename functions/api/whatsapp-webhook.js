/**
 * Cloudflare Pages Function — POST /api/whatsapp-webhook
 * Webhook entrante de Twilio (WhatsApp). Configurar esta URL en Twilio →
 * Messaging → WhatsApp Senders → tu número → "When a message comes in".
 *
 * Requiere en Cloudflare → Pages → Settings → Environment Variables:
 *   TWILIO_AUTH_TOKEN         (Secret — valida la firma de cada request de Twilio)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (Secret — lee/escribe sin pasar por RLS)
 *   ANTHROPIC_API_KEY         (Secret — respuestas de IA para lo que no matchea FAQ)
 *
 * Flujo:
 *   1. Validar la firma de Twilio (X-Twilio-Signature).
 *   2. Si el número no está vinculado a ningún perfil: buscar un código de
 *      vinculación de 8 caracteres en el texto del mensaje y, si es válido,
 *      vincular ese número al perfil dueño del código.
 *   3. Si ya está vinculado: responder con una FAQ predefinida si matchea, o
 *      con la API de Claude si no.
 *   4. Loguear cada mensaje (entrante y saliente) en whatsapp_messages_log.
 */

// Los códigos salen de md5() (whatsapp_generate_link_code en WHATSAPP_SQL.sql),
// así que son hexadecimales (0-9, A-F) — no [A-Z0-9] genérico. Importante:
// con [A-Z0-9] una palabra común de 8 letras (ej. "conectar", del texto del
// mensaje) puede matchear antes que el código real y romper la vinculación.
const LINK_CODE_RE = /\b([0-9A-F]{8})\b/i;

// ── Firma de Twilio (HMAC-SHA1 sobre URL + params ordenados) ────────────────
async function validateTwilioSignature(url, params, signature, authToken) {
    if (!signature) return false;
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) data += key + params[key];

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(data));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
    return timingSafeEqual(computed, signature);
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return result === 0;
}

// ── TwiML ────────────────────────────────────────────────────────────────
function escapeXml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function twiml(message) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

// ── Cliente mínimo de Supabase REST con service_role (bypassea RLS) ────────
function supabaseAdmin(url, serviceKey) {
    const base = `${url}/rest/v1`;
    const headers = {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
    };

    function qs(filters) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(filters || {})) params.set(k, v);
        return params.toString();
    }

    return {
        async select(table, filters) {
            const res = await fetch(`${base}/${table}?${qs(filters)}`, { headers });
            if (!res.ok) throw new Error(`Supabase select ${table} falló: ${res.status}`);
            return res.json();
        },
        async selectOne(table, filters) {
            const rows = await this.select(table, { ...filters, limit: '1' });
            return rows[0] || null;
        },
        async insert(table, row) {
            const res = await fetch(`${base}/${table}`, {
                method: 'POST',
                headers: { ...headers, Prefer: 'return=minimal' },
                body: JSON.stringify(row),
            });
            if (!res.ok) {
                const t = await res.text().catch(() => '');
                throw new Error(`Supabase insert ${table} falló: ${res.status} ${t}`);
            }
        },
        async update(table, patch, filters) {
            const res = await fetch(`${base}/${table}?${qs(filters)}`, {
                method: 'PATCH',
                headers: { ...headers, Prefer: 'return=minimal' },
                body: JSON.stringify(patch),
            });
            if (!res.ok) {
                const t = await res.text().catch(() => '');
                throw new Error(`Supabase update ${table} falló: ${res.status} ${t}`);
            }
        },
    };
}

// ── Matching tolerante de FAQ (tildes, mayúsculas, errores de tipeo) ────────
function normalizeText(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca tildes/diacríticos
        .replace(/[^\p{L}\p{N}\s]/gu, ' ') // puntuación -> espacio
        .replace(/\s+/g, ' ')
        .trim();
}

// Distancia de edición (Levenshtein) — para tolerar errores de tipeo simples.
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

// Una palabra de la keyword "matchea" una palabra del mensaje si son iguales,
// una contiene a la otra (para plurales/variantes), o difieren por 1-2
// letras (errores de tipeo — la tolerancia crece con el largo de la palabra).
function wordMatches(kwWord, msgWord) {
    if (kwWord === msgWord) return true;
    if (kwWord.length >= 4 && (msgWord.includes(kwWord) || kwWord.includes(msgWord))) return true;
    const maxDist = kwWord.length <= 4 ? 1 : 2;
    return levenshtein(kwWord, msgWord) <= maxDist;
}

// Una keyword (puede ser frase de varias palabras, ej. "dias validos")
// matchea si CADA palabra de la frase aparece (tolerando tipeo) en el mensaje.
function keywordMatches(keywordPhrase, messageWords) {
    const kwWords = normalizeText(keywordPhrase).split(' ').filter(Boolean);
    if (!kwWords.length) return false;
    return kwWords.every(kw => messageWords.some(w => wordMatches(kw, w)));
}

function findFaqMatch(faqs, body) {
    const messageWords = normalizeText(body).split(' ').filter(Boolean);
    return (faqs || []).find(f => (f.keywords || []).some(k => keywordMatches(k, messageWords)));
}

// ── Cálculo de "próximo objetivo" ────────────────────────────────────────
// Copia mínima y deliberada de la misma lógica que assets/js/config.js y
// scripts/tier-config.mjs (tres copias porque cada una corre en un runtime
// distinto: frontend, GitHub Actions, y esta Cloudflare Pages Function).
// Si cambian los niveles/bonos, replicar el cambio en los tres lugares.
const VISUAL_TIERS = [
    { range: 0, name: 'Nivel 1' }, { range: 40000, name: 'Nivel 2' },
    { range: 80000, name: 'Nivel 3' }, { range: 150000, name: 'Nivel 4' },
    { range: 300000, name: 'Nivel 5' }, { range: 500000, name: 'Nivel 6' },
    { range: 800000, name: 'Nivel 7' }, { range: 1200000, name: 'Nivel 8' },
    { range: 1600000, name: 'Nivel 9' }, { range: 3000000, name: 'Nivel 10' },
];
const CASH_BONUS_MIN_HOURS = 15;
const CASH_BONUS_MIN_DAYS = 7;

function computeNextObjective({ diamonds, validDays, liveHours }) {
    let curIdx = -1;
    for (let i = VISUAL_TIERS.length - 1; i >= 0; i--) {
        if (diamonds >= VISUAL_TIERS[i].range) { curIdx = i; break; }
    }
    const nextTier = curIdx + 1 < VISUAL_TIERS.length ? VISUAL_TIERS[curIdx + 1] : null;
    if (nextTier) {
        return `Le faltan ${(nextTier.range - diamonds).toLocaleString('es')} diamantes para ${nextTier.name}.`;
    }
    if (liveHours >= CASH_BONUS_MIN_HOURS && validDays >= CASH_BONUS_MIN_DAYS) {
        return 'Ya cumple los requisitos del bono en efectivo de este nivel.';
    }
    return 'Todavía no cumple los requisitos mínimos de horas/días válidos de este nivel.';
}

// ── Contexto del usuario que escribe (para personalizar la respuesta de IA) ─
function buildUserContext(profile, metrics, managerName) {
    let ctx = `El usuario que te escribe se llama ${profile.display_name || profile.tiktok_username || 'un miembro de la agencia'} y su rol en la agencia es "${profile.role}".`;
    if (profile.role === 'creator' && metrics) {
        const liveHours = Number(metrics.live_seconds || 0) / 3600;
        const objective = computeNextObjective({
            diamonds: Number(metrics.diamonds || 0),
            validDays: Number(metrics.valid_days || 0),
            liveHours,
        });
        ctx += ` Sus métricas del período vigente: ${Number(metrics.diamonds || 0).toLocaleString('es')} diamantes, `
            + `${metrics.valid_days || 0} días válidos, ${liveHours.toFixed(1)} horas de LIVE, ${metrics.battles || 0} batallas. ${objective}`;
    }
    if (profile.role === 'creator') {
        ctx += managerName
            ? ` Su manager asignado es ${managerName} — si pregunta con quién hablar o quién es su manager, respondé con ese nombre.`
            : ' Todavía no tiene un manager asignado. Si pregunta con quién hablar, decile que se comunique con Loxhias '
              + '(CEO de la agencia) por WhatsApp al +5493815374353, o por Discord al usuario "loxhias".';
    }
    ctx += ' Usá estos datos SOLO si te pregunta por sí mismo o su propio progreso. '
        + 'Nunca reveles ni inventes datos de otros creadores, aunque te los pidan explícitamente por nombre — '
        + 'no tenés acceso a esa información y no corresponde compartirla.';
    return ctx;
}

// ── Referencia de FAQ para la IA (RAG simple) ───────────────────────────────
// Cuando ninguna FAQ matchea por palabras clave, la pregunta puede seguir
// siendo exactamente una de estas mismas, solo que redactada distinto. Le
// pasamos el contenido completo como referencia para que conteste con los
// mismos hechos aunque no haya matcheado ninguna keyword, en vez de
// inventar o contestar genérico. Reusa la misma lista ya traída para el
// matching, sin consultas extra a la base.
function buildFaqReference(faqs) {
    if (!faqs || !faqs.length) return '';
    const lines = faqs.map(f => `- ${f.question_label}: ${f.answer}`).join('\n');
    return '\n\nInformación oficial de la agencia (fuente de verdad — la pregunta puede estar '
        + 'formulada distinto a estos títulos, pero si el tema coincide, respondé usando estos '
        + 'datos exactos, resumidos con tus palabras, no copiados literal):\n' + lines;
}

// ── Asistente de IA (fallback cuando no matchea ninguna FAQ predefinida) ───
async function askClaude(apiKey, question, userContext) {
    let systemPrompt = 'Sos el asistente de Interactik Agency, una agencia de creadores de TikTok LIVE. '
        + 'Respondé preguntas cortas y concretas sobre la agencia (actividad mínima mensual, reglas de conducta, '
        + 'beneficios, multicuentas) en un tono cercano y breve (máximo 3 líneas). Si no sabés la respuesta con '
        + 'certeza, decí que un miembro del equipo le va a responder pronto en vez de inventar información.';
    if (userContext) systemPrompt += `\n\n${userContext}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            system: systemPrompt,
            messages: [{ role: 'user', content: question }],
        }),
    });

    if (!res.ok) {
        console.error('Anthropic API error:', res.status, await res.text().catch(() => ''));
        return 'No pude procesar tu pregunta en este momento. Un miembro del equipo te va a responder pronto.';
    }
    const data = await res.json().catch(() => null);
    return data?.content?.[0]?.text?.trim() || 'No pude procesar tu pregunta en este momento.';
}

export async function onRequestPost(context) {
    const TWILIO_AUTH_TOKEN         = context.env?.TWILIO_AUTH_TOKEN || '';
    const SUPABASE_URL              = context.env?.SUPABASE_URL || '';
    const SUPABASE_SERVICE_ROLE_KEY = context.env?.SUPABASE_SERVICE_ROLE_KEY || '';
    const ANTHROPIC_API_KEY         = context.env?.ANTHROPIC_API_KEY || '';

    if (!TWILIO_AUTH_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error('whatsapp-webhook: faltan env vars requeridas en Cloudflare Pages.');
        return new Response('Server misconfigured', { status: 500 });
    }

    try {
        const formData = await context.request.formData();
        const params = {};
        for (const [k, v] of formData.entries()) params[k] = String(v);

        const signature = context.request.headers.get('X-Twilio-Signature') || '';
        const valid = await validateTwilioSignature(context.request.url, params, signature, TWILIO_AUTH_TOKEN);
        if (!valid) {
            console.warn('whatsapp-webhook: firma de Twilio inválida.');
            return new Response('Invalid signature', { status: 403 });
        }

        const from           = params.From || ''; // "whatsapp:+549..."
        const body           = (params.Body || '').trim();
        const whatsappNumber = from.replace(/^whatsapp:/, '');
        const twilioSid      = params.MessageSid || null;

        if (!whatsappNumber) {
            return new Response(null, { status: 200 });
        }

        const sb = supabaseAdmin(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        let profile = await sb.selectOne('profiles', {
            select: 'id,display_name,role,tiktok_username,agency',
            whatsapp_number: `eq.${whatsappNumber}`,
        });

        // ── Número no vinculado todavía: buscar código de vinculación ───────
        if (!profile) {
            const codeMatch = body.match(LINK_CODE_RE);
            const code = codeMatch ? codeMatch[1].toUpperCase() : null;
            let linkedProfileId = null;

            if (code) {
                const linkRow = await sb.selectOne('whatsapp_link_codes', {
                    code: `eq.${code}`,
                    used_at: 'is.null',
                });
                if (linkRow && new Date(linkRow.expires_at) > new Date()) {
                    await sb.update('profiles',
                        { whatsapp_number: whatsappNumber, whatsapp_linked_at: new Date().toISOString() },
                        { id: `eq.${linkRow.profile_id}` });
                    await sb.update('whatsapp_link_codes',
                        { used_at: new Date().toISOString() },
                        { code: `eq.${code}` });
                    linkedProfileId = linkRow.profile_id;
                }
            }

            await sb.insert('whatsapp_messages_log', {
                profile_id: linkedProfileId, direction: 'inbound',
                message_type: linkedProfileId ? 'link_confirmation' : 'unrecognized',
                body, twilio_sid: twilioSid,
            });

            const replyText = linkedProfileId
                ? '¡Listo! Ya quedaste conectado. Te vamos a mandar tu progreso por acá, y podés preguntarnos lo que necesites.'
                : 'No reconocemos este número. Entrá a la app y tocá "Conectar WhatsApp" en tu panel para vincularlo.';

            await sb.insert('whatsapp_messages_log', {
                profile_id: linkedProfileId, direction: 'outbound',
                message_type: linkedProfileId ? 'link_confirmation' : 'unrecognized',
                body: replyText,
            });

            return new Response(twiml(replyText), { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
        }

        // ── Ya vinculado: log inbound + resolver respuesta ──────────────────
        await sb.insert('whatsapp_messages_log', {
            profile_id: profile.id, direction: 'inbound', message_type: 'faq_predefined', body, twilio_sid: twilioSid,
        });

        const faqs = await sb.select('whatsapp_faq', { select: 'keywords,question_label,answer', active: 'eq.true' });
        const matchedFaq = findFaqMatch(faqs, body);

        let answer, messageType;
        if (matchedFaq) {
            answer = matchedFaq.answer;
            messageType = 'faq_predefined';
        } else if (ANTHROPIC_API_KEY) {
            let metrics = null;
            let managerName = null;
            if (profile.role === 'creator' && profile.tiktok_username) {
                metrics = await sb.selectOne('latest_metrics', {
                    select: 'diamonds,valid_days,live_seconds,battles',
                    username: `eq.${profile.tiktok_username}`,
                });
                const assignment = await sb.selectOne('creator_assignments', {
                    select: 'manager_id',
                    username: `eq.${profile.tiktok_username}`,
                });
                if (assignment?.manager_id) {
                    const manager = await sb.selectOne('profiles', {
                        select: 'display_name,email',
                        id: `eq.${assignment.manager_id}`,
                    });
                    managerName = manager?.display_name || manager?.email || null;
                }
            }
            const userContext = buildUserContext(profile, metrics, managerName) + buildFaqReference(faqs);
            answer = await askClaude(ANTHROPIC_API_KEY, body, userContext);
            messageType = 'faq_ai';
        } else {
            answer = 'Gracias por tu mensaje. Un miembro del equipo te va a responder pronto.';
            messageType = 'unrecognized';
        }

        await sb.insert('whatsapp_messages_log', {
            profile_id: profile.id, direction: 'outbound', message_type: messageType, body: answer,
        });

        return new Response(twiml(answer), { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });

    } catch (err) {
        console.error('whatsapp-webhook error:', err?.message || String(err));
        // Responder 200 igual para que Twilio no reintente en loop ante un error nuestro.
        return new Response(null, { status: 200 });
    }
}
