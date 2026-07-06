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

// Devuelve TODAS las FAQ que matchean, no solo la primera — un mensaje que
// matchea varias a la vez es una pregunta compuesta/ambigua (ej. "soy nuevo,
// ¿qué beneficios tengo?"), y ahí ninguna respuesta fija sola es la correcta.
function findFaqMatches(faqs, body) {
    const messageWords = normalizeText(body).split(' ').filter(Boolean);
    return (faqs || []).filter(f => (f.keywords || []).some(k => keywordMatches(k, messageWords)));
}

// ── Cálculo de "próximo objetivo" ────────────────────────────────────────
// Copia mínima y deliberada de la misma lógica que scripts/tier-config.mjs y
// functions/api/whatsapp-send-checkins.js (cada una corre en un runtime
// distinto: GitHub Actions, esta Cloudflare Pages Function, y otra). Si
// cambian los niveles/bonos, replicar el cambio en los tres lugares.
const CASH_BONUS_MIN_HOURS = 15;
const CASH_BONUS_MIN_DAYS = 7;
const ELITE_MIN_HOURS = 90;
const ELITE_MIN_DAYS = 22;
// Misma tasa que usa assets/js/views/creatorDashboard.js para "ganancias estimadas".
const DIAMONDS_PER_USD = 200;
// range/subio/mantiene: mismos valores que assets/js/config.js. Hace falta
// "mantiene" acá (a diferencia de la tabla vieja que solo tenía "subio")
// porque el cálculo compara contra el nivel del mes anterior.
const CASH_BONUSES = [
    { level: 'Nivel 1', range: 80000,   subio: 30,  mantiene: 15 },
    { level: 'Nivel 2', range: 150000,  subio: 60,  mantiene: 30 },
    { level: 'Nivel 3', range: 300000,  subio: 110, mantiene: 55 },
    { level: 'Nivel 4', range: 500000,  subio: 190, mantiene: 95 },
    { level: 'Nivel 5', range: 800000,  subio: 300, mantiene: 150 },
    { level: 'Nivel 6', range: 1200000, subio: 450, mantiene: 225 },
    { level: 'Nivel 7', range: 1600000, subio: 600, mantiene: 300 },
];
const CASH_BONUSES_USA = [
    { level: 'Nivel 1', range: 100000,  subio: 30,  mantiene: 15 },
    { level: 'Nivel 2', range: 200000,  subio: 60,  mantiene: 30 },
    { level: 'Nivel 3', range: 300000,  subio: 110, mantiene: 55 },
    { level: 'Nivel 4', range: 500000,  subio: 190, mantiene: 95 },
    { level: 'Nivel 5', range: 1000000, subio: 300, mantiene: 150 },
    { level: 'Nivel 6', range: 1600000, subio: 450, mantiene: 225 },
];

function fmt(n) { return Math.round(n).toLocaleString('es'); }

// Índice del tier más alto de bonusTable cuyo umbral ya cubre "diamonds"
// (-1 si todavía no llega ni al primero).
function tierIdx(diamonds, bonusTable) {
    for (let i = bonusTable.length - 1; i >= 0; i--) {
        if (diamonds >= bonusTable[i].range) return i;
    }
    return -1;
}

function daysElapsedInMonth() { return new Date().getDate(); }
function daysInCurrentMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

// Misma lógica que scripts/tier-config.mjs y whatsapp-send-checkins.js — ver
// comentario ahí sobre por qué está duplicada en cada runtime. Compara contra
// el NIVEL DEL MES ANTERIOR (retener/subir), no un umbral genérico, e incluye
// tendencia de ritmo y estado de días/horas.
function computeNextObjective({ diamonds, diamondsLastMonth = 0, validDays, liveHours, agency }) {
    const cashBonuses = agency === 'usa' ? CASH_BONUSES_USA : CASH_BONUSES;
    const ownEarnings = Math.round(diamonds / DIAMONDS_PER_USD);

    const elapsed   = daysElapsedInMonth();
    const totalDays = daysInCurrentMonth();
    const rateThis  = elapsed > 0 ? diamonds / elapsed : 0;
    const rateLast  = diamondsLastMonth > 0 ? diamondsLastMonth / 31 : 0;
    let trendLine;
    if (rateLast <= 0) {
        trendLine = rateThis > 0
            ? `Va a ${fmt(rateThis)} 💎/día (el mes pasado no tuvo actividad registrada).`
            : `Todavía no registra actividad este mes.`;
    } else {
        const paceRatio = (rateThis / rateLast) * 100;
        if (paceRatio >= 105) trendLine = `Va mejor que el mes pasado: ${fmt(rateThis)} 💎/día (mes pasado: ${fmt(rateLast)} 💎/día).`;
        else if (paceRatio >= 85) trendLine = `Va a un ritmo parecido al mes pasado: ${fmt(rateThis)} 💎/día (mes pasado: ${fmt(rateLast)} 💎/día).`;
        else trendLine = `Va por debajo del mes pasado: ${fmt(rateThis)} 💎/día (mes pasado: ${fmt(rateLast)} 💎/día).`;
    }

    const daysLine = validDays >= ELITE_MIN_DAYS
        ? `Días válidos: ya cumple el máximo (${ELITE_MIN_DAYS}+).`
        : validDays >= CASH_BONUS_MIN_DAYS
            ? `Días válidos: activo, le faltan ${ELITE_MIN_DAYS - validDays} para el tope élite (${ELITE_MIN_DAYS}).`
            : `Días válidos: le faltan ${CASH_BONUS_MIN_DAYS - validDays} para activar el bono en efectivo (mínimo ${CASH_BONUS_MIN_DAYS}).`;

    const hoursLine = liveHours >= ELITE_MIN_HOURS
        ? `Horas de LIVE: ya cumple el máximo (${ELITE_MIN_HOURS}h+).`
        : liveHours >= CASH_BONUS_MIN_HOURS
            ? `Horas de LIVE: activo, le faltan ${(ELITE_MIN_HOURS - liveHours).toFixed(1)}h para el tope élite (${ELITE_MIN_HOURS}h).`
            : `Horas de LIVE: le faltan ${(CASH_BONUS_MIN_HOURS - liveHours).toFixed(1)}h para activar el bono en efectivo (mínimo ${CASH_BONUS_MIN_HOURS}h).`;

    const lastMonthIdx = tierIdx(diamondsLastMonth, cashBonuses);
    const meetsCash    = liveHours >= CASH_BONUS_MIN_HOURS && validDays >= CASH_BONUS_MIN_DAYS;
    let bonusLine;

    if (lastMonthIdx < 0) {
        const first = cashBonuses[0];
        const missing = Math.max(0, first.range - diamonds);
        bonusLine = missing > 0
            ? `Bono en efectivo: le faltan ${fmt(missing)} 💎 para desbloquear su primer nivel (hasta $${first.mantiene}).`
            : `Bono en efectivo: ya alcanzó su primer nivel, va a cobrar hasta $${first.mantiene}.`;
    } else {
        const retain = cashBonuses[lastMonthIdx];
        const up     = cashBonuses[lastMonthIdx + 1] || null;
        if (diamonds < retain.range) {
            const missing = retain.range - diamonds;
            bonusLine = `Bono en efectivo: va a BAJAR de su nivel del mes pasado (${retain.level}) si no suma ${fmt(missing)} 💎 más. Necesita mantener el nivel para asegurar $${retain.mantiene}.`;
        } else if (up && diamonds < up.range) {
            const missing = up.range - diamonds;
            bonusLine = `Bono en efectivo: ya asegura mantener su nivel del mes pasado (${retain.level}, $${retain.mantiene}). Le faltan ${fmt(missing)} 💎 para subir a ${up.level} y cobrar $${up.subio}.`;
        } else {
            const topLevel = up ? up.level : retain.level;
            const topAmt   = up ? up.subio : retain.subio;
            bonusLine = `Bono en efectivo: superó su nivel del mes pasado. Va camino a ${topLevel} y podría cobrar hasta $${topAmt}.`;
        }
        if (!meetsCash) {
            bonusLine += ` (Para cobrar necesita mínimo ${CASH_BONUS_MIN_DAYS} días válidos y ${CASH_BONUS_MIN_HOURS}h de LIVE — todavía no los cumple.)`;
        }
    }

    return [
        `Día ${elapsed} de ${totalDays} del mes.`, trendLine, daysLine, hoursLine, bonusLine,
        `Sus propias ganancias de TikTok este mes rondarían los $${ownEarnings} USD.`,
    ].join(' ');
}

// ── Contexto del usuario que escribe (para personalizar la respuesta de IA) ─
function buildUserContext(profile, metrics, managerName) {
    let ctx = `El usuario que te escribe se llama ${profile.display_name || profile.tiktok_username || 'un miembro de la agencia'} y su rol en la agencia es "${profile.role}".`;
    if (profile.role === 'creator' && metrics) {
        const liveHours = Number(metrics.live_seconds || 0) / 3600;
        const objective = computeNextObjective({
            diamonds: Number(metrics.diamonds || 0),
            diamondsLastMonth: Number(metrics.diamonds_last_month || 0),
            validDays: Number(metrics.valid_days || 0),
            liveHours,
            agency: profile.agency,
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

// ── Conocimiento base de la agencia (fuente de verdad para la IA) ──────────
// Copia en texto plano del contenido real de assets/js/views/normas.js (que
// está en HTML, pensado para renderizarse en el navegador, no para pasarle a
// un LLM). Si cambian las normas ahí, replicar el cambio acá también.
const AGENCY_KNOWLEDGE = `
NORMAS Y REGLAS DE LA AGENCIA (fuente de verdad — usalas para responder con precisión):

Actividad mínima mensual (obligatorio): para ser creador activo hay que cumplir un mínimo de 10 días válidos por mes. Un día válido es transmitir en TikTok LIVE más de 1 hora continua sin cortes en el mismo día — varias transmisiones cortas que sumen 1 hora NO cuentan, tiene que ser continua.

Multicuentas en LIVE (tolerancia cero): está estrictamente prohibido usar más de una cuenta de TikTok para transmitir en vivo. Viola los términos de TikTok. Consecuencias: TikTok puede bloquear permanentemente TODAS las cuentas vinculadas al usuario (no solo la infractora), y la agencia desvincula al creador de inmediato.

Conducta y representación: todo creador es embajador de la agencia. Se espera trato respetuoso con la audiencia y otros creadores, comunicar a su manager cualquier problema técnico o personal, y reportar actividades sospechosas o violaciones de normas que observe.

Beneficios: bono en efectivo mensual, premio en diamantes, y suscripción gratis a Interactik App — todos sujetos a cumplir las métricas mensuales (días válidos, horas). El detalle de niveles y montos exactos está en la sección Objetivos del panel de cada creador.

Directrices de TikTok que aplican (resumen): prohibido contenido con menores en situaciones inapropiadas, contenido violento o peligroso, acoso o bullying, discurso de odio, manipulación de alcance con bots o cuentas falsas, compartir datos privados de terceros sin consentimiento (doxing), promover actividades ilegales, usar música o contenido con derechos de autor sin licencia (usar la biblioteca de sonidos de TikTok en su lugar). Específicamente en LIVE: prohibido contenido sexual explícito, pedir dinero de forma coercitiva o engañosa, transmitir bajo efectos de alcohol o sustancias, mostrar armas reales o conducir, y usar multicuentas.

Ante cualquier duda sobre estas normas que no puedas responder con certeza, decile al creador que contacte a su manager asignado.
`.trim();

// ── Asistente de IA (fallback cuando no matchea ninguna FAQ predefinida) ───
async function askClaude(apiKey, question, userContext) {
    let systemPrompt = 'Sos el asistente de Interactik Agency, una agencia de creadores de TikTok LIVE. '
        + 'Respondé preguntas cortas y concretas en un tono cercano y breve (máximo 4 líneas). Si no sabés la '
        + 'respuesta con certeza incluso con el conocimiento de base de abajo, decí que un miembro del equipo '
        + 'le va a responder pronto en vez de inventar información.'
        + `\n\n${AGENCY_KNOWLEDGE}`;
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

        const faqs = await sb.select('whatsapp_faq', {
            select: 'keywords,question_label,answer', active: 'eq.true', order: 'sort_order.asc',
        });
        const matches = findFaqMatches(faqs, body);

        let answer, messageType;
        if (matches.length === 1) {
            // Matchea exactamente una FAQ: respuesta fija, gratis.
            answer = matches[0].answer;
            messageType = 'faq_predefined';
        } else if (ANTHROPIC_API_KEY) {
            // Cero o varias FAQ matchearon (pregunta ambigua/compuesta): la IA
            // decide, con el contenido de todas las FAQ como referencia.
            let metrics = null;
            let managerName = null;
            if (profile.role === 'creator' && profile.tiktok_username) {
                metrics = await sb.selectOne('latest_metrics', {
                    select: 'diamonds,diamonds_last_month,valid_days,live_seconds,battles',
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
